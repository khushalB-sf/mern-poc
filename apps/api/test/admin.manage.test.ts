import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  PASSWORD,
  addQuestion,
  buildWorld,
  cookieFor,
  makeApp,
  makeDb,
  resetDb,
  type World,
} from './helpers.js';

const db = makeDb();
const { app } = makeApp(db);
let world: World;

beforeEach(async () => {
  await resetDb(db);
  world = await buildWorld(db);
});
afterAll(() => db.$disconnect());

const UUID = '11111111-1111-4111-8111-111111111111';
const as = (u: { id: string }) => cookieFor(u.id);
const admin = () => world.users.admin;
type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';
const call = (u: { id: string }, method: Method, path: string, body?: object) =>
  request(app)[method](path).set('Cookie', as(u)).send(body);
const adminCall = (method: Method, path: string, body?: object) =>
  call(admin(), method, `/api/admin${path}`, body);
const login = (email: string, password: string) =>
  request(app).post('/api/auth/login').send({ email, password });

const newUser = {
  email: 'New.Person@Test.dev',
  name: 'New Person',
  password: 'a-long-password',
  role: 'REVIEWER',
};

describe('admin gate on the new routes', () => {
  const routes: [Method, string, object][] = [
    ['post', '/users', newUser],
    ['delete', `/users/${UUID}`, {}],
    ['patch', `/clients/${UUID}`, { name: 'x' }],
    ['delete', `/clients/${UUID}`, {}],
    ['get', `/clients/${UUID}/impact`, {}],
    ['post', `/clients/${UUID}/restore`, {}],
    ['get', '/deleted-questions', {}],
    ['post', `/questions/${UUID}/restore`, {}],
    ['get', '/technologies', {}],
    ['post', `/technologies/${UUID}/retire`, {}],
    ['post', `/technologies/${UUID}/restore`, {}],
  ];
  it.each(routes)('%s %s is ADMIN-only', async (method, path, body) => {
    for (const u of [world.users.plain, world.users.authorA, world.users.reviewer]) {
      expect((await call(u, method, `/api/admin${path}`, body)).status).toBe(403);
    }
  });
});

describe('add a user', () => {
  it('creates the account (email normalised), who can then sign in with that password', async () => {
    const res = await adminCall('post', '/users', { ...newUser, clientIds: [world.acme.id] });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      email: 'new.person@test.dev',
      role: 'REVIEWER',
      active: true,
      clients: [{ name: 'Acme' }],
    });
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash|argon2/i);

    const signedIn = await login('new.person@test.dev', 'a-long-password');
    expect(signedIn.status).toBe(200);
    expect(signedIn.body.user.role).toBe('REVIEWER');

    const [event] = await db.auditEvent.findMany({ where: { type: 'USER_CREATED' } });
    expect(event).toMatchObject({ actorId: admin().id });
    expect(JSON.stringify(event!.payload)).not.toContain('a-long-password');
  });

  it('a duplicate email is a 409 (case-insensitive) and nothing is created', async () => {
    const before = await db.appUser.count();
    const res = await adminCall('post', '/users', { ...newUser, email: 'AUTHORA@test.dev' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_EXISTS');
    expect(await db.appUser.count()).toBe(before);
  });

  it.each([
    ['short password', { password: 'short' }],
    ['bad email', { email: 'nope' }],
    ['blank name', { name: '  ' }],
    ['unknown role', { role: 'ROOT' }],
    ['unknown field', { active: false }],
    ['unknown department', { clientIds: [UUID] }],
  ])('SEC-01: %s is a 400 and nothing is created', async (_n, over) => {
    const before = await db.appUser.count();
    expect((await adminCall('post', '/users', { ...newUser, ...over })).status).toBe(400);
    expect(await db.appUser.count()).toBe(before);
  });
});

describe('edit a user', () => {
  it('changes name, email and active; audits only what changed', async () => {
    const u = world.users.authorA;
    const res = await adminCall('patch', `/users/${u.id}`, {
      name: 'Renamed',
      email: 'renamed@test.dev',
      active: false,
    });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      name: 'Renamed',
      email: 'renamed@test.dev',
      active: false,
    });
    const [event] = await db.auditEvent.findMany({ where: { type: 'USER_UPDATED' } });
    expect(event!.payload).toMatchObject({
      changes: { name: { from: 'authorA', to: 'Renamed' } },
      passwordReset: false,
    });
  });

  it('an email already used by someone else is a 409', async () => {
    const res = await adminCall('patch', `/users/${world.users.authorA.id}`, {
      email: 'authorb@test.dev',
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_EXISTS');
  });

  it('a password reset replaces the password and signs the user out everywhere', async () => {
    const u = world.users.authorA;
    const first = await login('authora@test.dev', PASSWORD);
    const refresh = (first.headers['set-cookie'] as unknown as string[]).find((c: string) =>
      c.startsWith('refresh_token='),
    )!;

    const res = await adminCall('patch', `/users/${u.id}`, { password: 'brand-new-password' });
    expect(res.status).toBe(200);
    expect((await login('authora@test.dev', PASSWORD)).status).toBe(401);
    expect((await login('authora@test.dev', 'brand-new-password')).status).toBe(200);
    // the old session's refresh token no longer works
    expect(
      (await request(app).post('/api/auth/refresh').set('Cookie', refresh.split(';')[0]!)).status,
    ).toBe(401);
    const [event] = await db.auditEvent.findMany({ where: { type: 'USER_UPDATED' } });
    expect(JSON.stringify(event!.payload)).not.toContain('brand-new-password');
    expect(event!.payload).toMatchObject({ passwordReset: true });
  });

  it('a deactivated user is locked out at once', async () => {
    const u = world.users.authorA;
    await adminCall('patch', `/users/${u.id}`, { active: false });
    expect((await call(u, 'get', '/api/auth/me')).status).toBe(401);
    expect((await login('authora@test.dev', PASSWORD)).status).toBe(401);
  });

  it('an admin cannot deactivate themselves', async () => {
    expect((await adminCall('patch', `/users/${admin().id}`, { active: false })).status).toBe(403);
    expect((await adminCall('patch', `/users/${admin().id}`, { name: 'Still me' })).status).toBe(
      200,
    );
  });

  it('a reviewer is managed like any other user (rename, change departments, demote)', async () => {
    const r = world.users.reviewerNoGrant;
    const created = await adminCall('post', '/users', newUser);
    const id = created.body.user.id;
    expect(
      (await adminCall('patch', `/users/${id}`, { name: 'Renamed reviewer' })).body.user.name,
    ).toBe('Renamed reviewer');
    expect(
      (await adminCall('put', `/users/${id}/clients`, { clientIds: [world.globex.id] })).body.user
        .clients,
    ).toHaveLength(1);
    expect((await adminCall('patch', `/users/${r.id}`, { role: 'AUTHOR' })).body.user.role).toBe(
      'AUTHOR',
    );
  });
});

describe('delete a user (soft)', () => {
  it('removes them from lists and sign-in, but keeps what they wrote', async () => {
    const u = world.users.authorA;
    const q = await addQuestion(db, world, { text: 'Written by someone leaving', authorId: u.id });
    const res = await adminCall('delete', `/users/${u.id}`);
    expect(res.status).toBe(204);

    const list = await adminCall('get', '/users');
    expect(list.body.items.map((x: { id: string }) => x.id)).not.toContain(u.id);
    expect((await call(u, 'get', '/api/auth/me')).status).toBe(401);
    expect((await login('authora@test.dev', PASSWORD)).status).toBe(401);
    // their question and its author name are still there
    const seen = await call(world.users.reviewer, 'get', `/api/questions/${q.id}`);
    expect(seen.status).toBe(200);
    expect(seen.body.question.author.name).toBe('authorA');
    expect(await db.auditEvent.count({ where: { type: 'USER_DELETED' } })).toBe(1);
  });

  it('a deleted user behaves as missing: 404 to edit or delete again, and the email stays reserved', async () => {
    const u = world.users.authorA;
    await adminCall('delete', `/users/${u.id}`);
    expect((await adminCall('delete', `/users/${u.id}`)).status).toBe(404);
    expect((await adminCall('patch', `/users/${u.id}`, { active: true })).status).toBe(404);
    expect((await adminCall('put', `/users/${u.id}/clients`, { clientIds: [] })).status).toBe(404);
    expect(
      (await adminCall('post', '/users', { ...newUser, email: 'authora@test.dev' })).status,
    ).toBe(409);
  });

  it('an admin cannot delete themselves; unknown id is 404', async () => {
    expect((await adminCall('delete', `/users/${admin().id}`)).status).toBe(403);
    expect((await adminCall('delete', `/users/${UUID}`)).status).toBe(404);
    expect(await db.appUser.count({ where: { id: admin().id, deletedAt: null } })).toBe(1);
  });
});

describe('departments: description, edit, delete (soft)', () => {
  it('adds with a description, edits both fields, blank clears the description', async () => {
    const created = await adminCall('post', '/clients', {
      name: 'MERN',
      description: '  Full-stack JS  ',
    });
    expect(created.body.client).toMatchObject({
      name: 'MERN',
      description: 'Full-stack JS',
      userCount: 0,
    });
    const id = created.body.client.id;

    const edited = await adminCall('patch', `/clients/${id}`, {
      name: 'MERN Stack',
      description: 'React + Node',
    });
    expect(edited.body.client).toMatchObject({ name: 'MERN Stack', description: 'React + Node' });
    const cleared = await adminCall('patch', `/clients/${id}`, { description: '   ' });
    expect(cleared.body.client.description).toBeNull();
    expect((await adminCall('patch', `/clients/${id}`, { description: null })).status).toBe(200);
    expect(await db.auditEvent.count({ where: { type: 'CLIENT_UPDATED' } })).toBe(2); // the null edit changed nothing
  });

  it('rejects a name that is taken (409), empty edits and unknown ids', async () => {
    expect((await adminCall('patch', `/clients/${world.acme.id}`, { name: 'Globex' })).status).toBe(
      409,
    );
    expect((await adminCall('patch', `/clients/${world.acme.id}`, {})).status).toBe(400);
    expect((await adminCall('patch', `/clients/${UUID}`, { name: 'x' })).status).toBe(404);
    expect(
      (await adminCall('post', '/clients', { name: 'X', description: 'y'.repeat(501) })).status,
    ).toBe(400);
  });

  it('delete hides the department and all of its questions, even from admins', async () => {
    const q = await addQuestion(db, world, {
      text: 'zzacmeonly secret',
      authorId: world.users.authorAcme.id,
      clientId: world.acme.id,
    });
    const res = await adminCall('delete', `/clients/${world.acme.id}`);
    expect(res.status).toBe(204);

    for (const u of [admin(), world.users.authorAcme, world.users.reviewer]) {
      expect((await call(u, 'get', `/api/questions/${q.id}`)).status).toBe(404);
      expect((await call(u, 'get', '/api/questions?q=zzacmeonly')).body.page.total).toBe(0);
    }
    const names = (r: request.Response) => r.body.items.map((c: { name: string }) => c.name);
    expect(names(await adminCall('get', '/clients'))).toEqual(['Globex']);
    expect(names(await call(world.users.authorAcme, 'get', '/api/clients'))).toEqual([]);
    // no new questions into it, and it cannot be granted any more
    const post = await call(admin(), 'post', '/api/questions', {
      text: 'Into a deleted department',
      clientId: world.acme.id,
    });
    expect(post.status).toBe(404);
    const grant = await adminCall('put', `/users/${world.users.plain.id}/clients`, {
      clientIds: [world.acme.id],
    });
    expect(grant.status).toBe(400);
    // the user list no longer shows it either
    const users = await adminCall('get', '/users');
    const deptNames = users.body.items.flatMap((x: { clients: { name: string }[] }) =>
      x.clients.map((c) => c.name),
    );
    expect(deptNames).not.toContain('Acme');
    expect(await db.auditEvent.count({ where: { type: 'CLIENT_DELETED' } })).toBe(1);
  });

  it('a deleted department is 404 to edit or delete again, and its name stays reserved', async () => {
    await adminCall('delete', `/clients/${world.acme.id}`);
    expect((await adminCall('delete', `/clients/${world.acme.id}`)).status).toBe(404);
    expect((await adminCall('patch', `/clients/${world.acme.id}`, { name: 'Z' })).status).toBe(404);
    expect((await adminCall('post', '/clients', { name: 'Acme' })).status).toBe(409);
  });
});

describe('admin manages questions', () => {
  let q: { id: string };
  beforeEach(async () => {
    q = await addQuestion(db, world, {
      text: 'Original question about Kafka',
      authorId: world.users.authorA.id,
    });
  });

  it('an admin edit keeps the status; an author edit of the same question resubmits it', async () => {
    const byAdmin = await call(admin(), 'patch', `/api/questions/${q.id}`, {
      answerNotes: 'Admin notes',
    });
    expect(byAdmin.body.question).toMatchObject({ status: 'APPROVED', answerNotes: 'Admin notes' });
    const byAuthor = await call(world.users.authorA, 'patch', `/api/questions/${q.id}`, {
      answerNotes: 'Author notes',
    });
    expect(byAuthor.body.question.status).toBe('PENDING');
  });

  it('an admin can overturn an earlier decision; a reviewer still cannot', async () => {
    expect(
      (
        await call(world.users.reviewer, 'post', `/api/questions/${q.id}/review`, {
          decision: 'REJECTED',
          note: 'no',
        })
      ).status,
    ).toBe(409);
    const res = await call(admin(), 'post', `/api/questions/${q.id}/review`, {
      decision: 'REJECTED',
      note: 'Outdated',
    });
    expect(res.body.question).toMatchObject({
      status: 'REJECTED',
      review: { note: 'Outdated', reviewer: { id: admin().id } },
    });
  });

  it('delete: visibility first, then role; soft; gone everywhere; audited', async () => {
    const acmeQ = await addQuestion(db, world, {
      text: 'Acme Kafka thing',
      authorId: world.users.authorAcme.id,
      clientId: world.acme.id,
    });
    // not admin: can see it -> 403; cannot see it -> the same 404 as a random id
    expect((await call(world.users.authorA, 'delete', `/api/questions/${q.id}`)).status).toBe(403);
    expect((await call(world.users.reviewer, 'delete', `/api/questions/${q.id}`)).status).toBe(403);
    const hidden = await call(world.users.authorA, 'delete', `/api/questions/${acmeQ.id}`);
    const missing = await call(world.users.authorA, 'delete', `/api/questions/${UUID}`);
    expect(hidden.status).toBe(404);
    expect(hidden.body).toEqual(missing.body);
    expect(await db.question.count({ where: { deletedAt: null } })).toBe(2);

    expect((await call(admin(), 'delete', `/api/questions/${q.id}`)).status).toBe(204);
    expect((await call(admin(), 'get', `/api/questions/${q.id}`)).status).toBe(404);
    expect((await call(admin(), 'get', `/api/questions/${q.id}/history`)).status).toBe(404);
    expect((await call(admin(), 'patch', `/api/questions/${q.id}`, { text: 'x' })).status).toBe(
      404,
    );
    expect((await call(admin(), 'delete', `/api/questions/${q.id}`)).status).toBe(404);
    for (const u of [admin(), world.users.authorA, world.users.plain]) {
      expect(
        (await call(u, 'get', '/api/questions?q=Kafka')).body.items.map(
          (i: { id: string }) => i.id,
        ),
      ).not.toContain(q.id);
    }
    // soft: the row and its audit trail are still there
    expect(await db.question.count({ where: { id: q.id } })).toBe(1);
    expect(
      await db.auditEvent.count({ where: { type: 'QUESTION_DELETED', questionId: q.id } }),
    ).toBe(1);
  });

  it('a deleted question no longer triggers a duplicate warning', async () => {
    await call(admin(), 'delete', `/api/questions/${q.id}`);
    const res = await call(world.users.authorA, 'post', '/api/questions', {
      text: 'Original question about Kafka',
    });
    expect(res.status).toBe(201);
  });
});

describe('restore: departments, questions and technologies', () => {
  const ids = (res: { body: { items: { id: string }[] } }) => res.body.items.map((i) => i.id);

  it('a deleted department is listed, its questions stay hidden, and restore brings them back unchanged', async () => {
    const q = await addQuestion(db, world, {
      text: 'Acme only question',
      authorId: world.users.authorAcme.id,
      clientId: world.acme.id,
      status: 'PENDING',
    });
    const impact = await adminCall('get', `/clients/${world.acme.id}/impact`);
    expect(impact.body).toMatchObject({ questions: 1, pending: 1 });

    await adminCall('delete', `/clients/${world.acme.id}`);
    expect(ids(await adminCall('get', '/clients'))).not.toContain(world.acme.id);
    expect(ids(await adminCall('get', '/clients?deleted=true'))).toEqual([world.acme.id]);
    expect((await call(admin(), 'get', `/api/questions/${q.id}`)).status).toBe(404);

    expect((await adminCall('post', `/clients/${world.acme.id}/restore`)).status).toBe(200);
    const back = await call(admin(), 'get', `/api/questions/${q.id}`);
    expect(back.status).toBe(200);
    expect(back.body.question.status).toBe('PENDING');
    expect((await adminCall('post', `/clients/${world.acme.id}/restore`)).status).toBe(404);
    expect(await db.auditEvent.count({ where: { type: 'CLIENT_RESTORED' } })).toBe(1);
  });

  it('a deleted question is listed and restorable, but not while its department is deleted', async () => {
    const q = await addQuestion(db, world, {
      text: 'Gone then back',
      authorId: world.users.authorAcme.id,
      clientId: world.acme.id,
    });
    await call(admin(), 'delete', `/api/questions/${q.id}`);
    const listed = await adminCall('get', '/deleted-questions');
    expect(listed.body.items).toMatchObject([
      { id: q.id, department: { name: 'Acme' }, departmentDeleted: false },
    ]);

    await adminCall('delete', `/clients/${world.acme.id}`);
    expect((await adminCall('get', '/deleted-questions')).body.items[0].departmentDeleted).toBe(
      true,
    );
    const blocked = await adminCall('post', `/questions/${q.id}/restore`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('DEPARTMENT_DELETED');

    await adminCall('post', `/clients/${world.acme.id}/restore`);
    expect((await adminCall('post', `/questions/${q.id}/restore`)).status).toBe(204);
    expect((await call(admin(), 'get', `/api/questions/${q.id}`)).status).toBe(200);
    expect((await adminCall('post', `/questions/${q.id}/restore`)).status).toBe(404);
    expect(
      await db.auditEvent.count({ where: { type: 'QUESTION_RESTORED', questionId: q.id } }),
    ).toBe(1);
  });

  it('retiring a technology hides it from filters and new questions but keeps it on existing ones', async () => {
    const q = await addQuestion(db, world, {
      text: 'Uses react',
      authorId: world.users.authorAcme.id,
      clientId: world.acme.id,
      tags: ['technology:react'],
    });
    const react = world.tags.get('technology:react')!;
    const list = await adminCall('get', '/technologies');
    expect(list.body.items.find((t: { id: string }) => t.id === react)).toMatchObject({
      retired: false,
      questionCount: 1,
    });

    expect((await adminCall('post', `/technologies/${react}/retire`)).status).toBe(204);
    expect((await adminCall('post', `/technologies/${react}/retire`)).status).toBe(404);

    const techValues = async (query: string) =>
      (await call(world.users.authorAcme, 'get', `/api/tags${query}`)).body.categories
        .find((c: { slug: string }) => c.slug === 'technology')
        .tags.map((t: { value: string; retired: boolean }) => `${t.value}:${t.retired}`);
    expect(await techValues('')).toContain('react:true');
    expect(await techValues('?for=filter')).not.toContain('react:true');

    // still on the existing question, and an edit that keeps it is fine
    const detail = await call(admin(), 'get', `/api/questions/${q.id}`);
    expect(detail.body.question.tags.map((t: { value: string }) => t.value)).toContain('react');
    expect(
      (await call(admin(), 'patch', `/api/questions/${q.id}`, { tags: ['technology:react'] }))
        .status,
    ).toBe(200);
    // but nobody can newly attach it
    const attach = await call(world.users.authorAcme, 'post', '/api/questions', {
      text: 'Brand new react question',
      clientId: world.acme.id,
      tags: ['technology:react'],
    });
    expect(attach.status).toBe(400);
    expect(attach.body.error.code).toBe('TAG_RETIRED');

    expect((await adminCall('post', `/technologies/${react}/restore`)).status).toBe(204);
    expect(await techValues('?for=filter')).toContain('react:false');
    expect(
      await db.auditEvent.count({ where: { type: { in: ['TAG_RETIRED', 'TAG_RESTORED'] } } }),
    ).toBe(2);
  });

  it('only technologies can be retired (not seniority or type tags)', async () => {
    const mid = world.tags.get('seniority:mid')!;
    expect((await adminCall('post', `/technologies/${mid}/retire`)).status).toBe(404);
  });
});
