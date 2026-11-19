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
    ['post', `/users/${UUID}/restore`, {}],
    ['patch', `/clients/${UUID}`, { name: 'x' }],
    ['delete', `/clients/${UUID}`, {}],
    ['get', `/clients/${UUID}/impact`, {}],
    ['post', `/clients/${UUID}/restore`, {}],
    ['get', '/deleted-questions', {}],
    ['post', `/questions/${UUID}/restore`, {}],
    ['get', `/clients/${UUID}/technologies`, {}],
    ['post', `/clients/${UUID}/technologies`, { label: 'x' }],
    ['delete', `/clients/${UUID}/technologies/${UUID}`, {}],
    ['post', `/clients/${UUID}/technologies/${UUID}/restore`, {}],
    ['patch', `/technologies/${UUID}`, { label: 'x' }],
    ['get', '/technologies/other', {}],
    ['post', `/technologies/${UUID}/archive`, {}],
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

describe('restore a deleted user', () => {
  const ids = (res: { body: { items: { id: string }[] } }) => res.body.items.map((i) => i.id);

  it('lists deleted users and restores one as inactive, keeping everything they own', async () => {
    const u = world.users.authorB;
    const q = await addQuestion(db, world, { text: 'Written before leaving', authorId: u.id });
    await adminCall('delete', `/users/${u.id}`).expect(204);

    expect(ids(await adminCall('get', '/users'))).not.toContain(u.id);
    const deleted = await adminCall('get', '/users?deleted=true');
    expect(deleted.body.items).toMatchObject([
      { id: u.id, email: 'authorb@test.dev', role: 'AUTHOR' },
    ]);
    // the email stays reserved while the account is deleted
    expect(
      (await adminCall('post', '/users', { ...newUser, email: 'authorb@test.dev' })).status,
    ).toBe(409);

    const res = await adminCall('post', `/users/${u.id}/restore`);
    expect(res.status).toBe(200);
    // back in the list, but switched off until an admin decides to let them in again
    expect(res.body.user).toMatchObject({ id: u.id, active: false, role: 'AUTHOR' });
    expect(ids(await adminCall('get', '/users'))).toContain(u.id);
    expect(ids(await adminCall('get', '/users?deleted=true'))).not.toContain(u.id);
    expect((await login('authorb@test.dev', PASSWORD)).status).toBe(401);

    await adminCall('patch', `/users/${u.id}`, { active: true }).expect(200);
    expect((await login('authorb@test.dev', PASSWORD)).status).toBe(200); // same password as before
    expect((await call(world.users.reviewer, 'get', `/api/questions/${q.id}`)).status).toBe(200);
    expect(await db.auditEvent.count({ where: { type: 'USER_RESTORED' } })).toBe(1);
  });

  it('a restore does not bring back sessions that were signed out by the delete', async () => {
    const u = world.users.authorB;
    const first = await login('authorb@test.dev', PASSWORD);
    const refresh = (first.headers['set-cookie'] as unknown as string[])
      .find((c) => c.startsWith('refresh_token='))!
      .split(';')[0]!;
    await adminCall('delete', `/users/${u.id}`).expect(204);
    await adminCall('post', `/users/${u.id}/restore`).expect(200);
    await adminCall('patch', `/users/${u.id}`, { active: true }).expect(200);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', refresh)).status).toBe(401);
  });

  it('only a deleted user can be restored; unknown ids are 404; deleted accounts stay out of other lists', async () => {
    expect((await adminCall('post', `/users/${world.users.authorB.id}/restore`)).status).toBe(404); // not deleted
    expect((await adminCall('post', `/users/${UUID}/restore`)).status).toBe(404);
    await adminCall('delete', `/users/${world.users.authorB.id}`).expect(204);
    await adminCall('post', `/users/${world.users.authorB.id}/restore`).expect(200);
    expect((await adminCall('post', `/users/${world.users.authorB.id}/restore`)).status).toBe(404); // already back
  });

  it('keeps the department grants they had (inactive until re-enabled)', async () => {
    const u = world.users.authorAcme;
    await adminCall('delete', `/users/${u.id}`).expect(204);
    const res = await adminCall('post', `/users/${u.id}/restore`);
    expect(res.body.user.clients.map((c: { name: string }) => c.name)).toEqual(['Acme']);
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
});

describe('department technologies', () => {
  // World: Acme offers react + nodejs, Globex offers react. So react is shared; nodejs is exclusive to Acme.
  const react = () => world.tags.get('technology:react')!;
  const nodejs = () => world.tags.get('technology:nodejs')!;
  const list = async (clientId: string) =>
    (await adminCall('get', `/clients/${clientId}/technologies`)).body;
  const labels = (rows: { label: string }[]) => rows.map((r) => r.label).sort();
  const techs = async (u: { id: string }, query = '') =>
    (await call(u, 'get', `/api/tags${query}`)).body.categories
      .find((c: { slug: string }) => c.slug === 'technology')
      .tags.map((t: { value: string; archived: boolean }) => `${t.value}:${t.archived}`)
      .sort();

  it("lists a department's technologies with shared flags and what could still be added", async () => {
    const acme = await list(world.acme.id);
    expect(labels(acme.active)).toEqual(['nodejs', 'react']);
    expect(acme.active.find((t: { label: string }) => t.label === 'react').shared).toBe(true);
    expect(acme.active.find((t: { label: string }) => t.label === 'nodejs').shared).toBe(false);
    expect(acme.available).toEqual([]);
    expect(labels((await list(world.globex.id)).available)).toEqual(['nodejs']);
    expect((await adminCall('get', `/clients/${UUID}/technologies`)).status).toBe(404);
  });

  it('removing a shared technology only unlinks it; an exclusive one is archived and restorable', async () => {
    await addQuestion(db, world, {
      text: 'Node question',
      authorId: world.users.authorAcme.id,
      clientId: world.acme.id,
      tags: ['technology:nodejs'],
    });
    expect(
      (await adminCall('delete', `/clients/${world.acme.id}/technologies/${react()}`)).status,
    ).toBe(204);
    expect(labels((await list(world.acme.id)).active)).toEqual(['nodejs']);
    expect(labels((await list(world.globex.id)).active)).toEqual(['react']); // untouched
    expect(await techs(world.users.authorGlobex, '?for=filter')).toEqual(['react:false']);

    expect(
      (await adminCall('delete', `/clients/${world.acme.id}/technologies/${nodejs()}`)).status,
    ).toBe(204);
    const acme = await list(world.acme.id);
    expect(acme.active).toEqual([]);
    expect(labels(acme.archived)).toEqual(['nodejs']);
    // hidden from filters and new questions, but kept on the question that has it
    expect(await techs(world.users.authorAcme, '?for=filter')).not.toContain('nodejs:true');
    expect(await techs(world.users.authorAcme)).toContain('nodejs:true');
    const attach = await call(world.users.authorAcme, 'post', '/api/questions', {
      text: 'A brand new node question',
      clientId: world.acme.id,
      tags: ['technology:nodejs'],
    });
    expect(attach.body.error.code).toBe('TAG_ARCHIVED');

    expect(
      (await adminCall('post', `/clients/${world.acme.id}/technologies/${nodejs()}/restore`))
        .status,
    ).toBe(204);
    expect(labels((await list(world.acme.id)).active)).toEqual(['nodejs']);
    expect(
      (await adminCall('post', `/clients/${world.acme.id}/technologies/${nodejs()}/restore`))
        .status,
    ).toBe(404);
    expect(
      await db.auditEvent.count({
        where: { type: { in: ['TAG_UNLINKED', 'TAG_ARCHIVED', 'TAG_RESTORED'] } },
      }),
    ).toBe(3);
  });

  it('adding links an existing technology by a loose name, un-archives it, or creates a new one', async () => {
    const before = await db.tag.count();
    const linked = await adminCall('post', `/clients/${world.globex.id}/technologies`, {
      label: ' Node.JS ',
    });
    expect(linked.status).toBe(201);
    expect(linked.body.technology).toMatchObject({ id: nodejs(), created: false });
    expect(await db.tag.count()).toBe(before);
    expect(labels((await list(world.globex.id)).active)).toEqual(['nodejs', 'react']);

    const created = await adminCall('post', `/clients/${world.globex.id}/technologies`, {
      label: 'Celery Beat',
    });
    expect(created.body.technology.created).toBe(true);
    const tag = await db.tag.findUniqueOrThrow({ where: { id: created.body.technology.id } });
    expect(tag).toMatchObject({ value: 'celery-beat', label: 'Celery Beat' });
    // not offered to Acme until it is added there
    expect(labels((await list(world.acme.id)).available)).toEqual(['Celery Beat']);

    await db.tag.update({ where: { id: nodejs() }, data: { archivedAt: new Date() } });
    await adminCall('post', `/clients/${world.acme.id}/technologies`, { label: 'nodejs' });
    expect((await db.tag.findUniqueOrThrow({ where: { id: nodejs() } })).archivedAt).toBeNull();

    expect(
      (await adminCall('post', `/clients/${world.globex.id}/technologies`, { label: '+++' }))
        .status,
    ).toBe(400);
    expect(
      (await adminCall('post', `/clients/${world.globex.id}/technologies`, { label: '' })).status,
    ).toBe(400);
    expect((await adminCall('post', `/clients/${UUID}/technologies`, { label: 'Go' })).status).toBe(
      404,
    );
  });

  it('names that differ only by a symbol are different technologies (C, C++, C#), and Unicode names work', async () => {
    const add = async (label: string) =>
      (await adminCall('post', `/clients/${world.globex.id}/technologies`, { label })).body
        .technology;
    const c = await add('C');
    const cpp = await add('C++');
    const csharp = await add('C#');
    expect(new Set([c.id, cpp.id, csharp.id]).size).toBe(3);
    expect([c, cpp, csharp].map((t) => t.created)).toEqual([true, true, true]);
    expect((await add('c++')).id).toBe(cpp.id); // the same name again links the same one
    expect((await add(' C ++ ')).id).toBe(cpp.id);

    const values = (
      await db.tag.findMany({
        where: { id: { in: [c.id, cpp.id, csharp.id] } },
        orderBy: { value: 'asc' },
      })
    ).map((t) => t.value);
    expect(values).toEqual(['c', 'c-plus-plus', 'c-sharp']);

    const cafe = await add('Café');
    expect((await db.tag.findUniqueOrThrow({ where: { id: cafe.id } })).value).toBe('cafe');
    expect((await add('CAFÉ')).id).toBe(cafe.id);
    const jp = await add('日本語');
    expect((await db.tag.findUniqueOrThrow({ where: { id: jp.id } })).value).toMatch(
      /^tech-[0-9a-f]{8}$/,
    );
    // and a question can actually use the new technologies
    const q = await call(world.users.authorGlobex, 'post', '/api/questions', {
      text: 'Pointers in C versus C++?',
      clientId: world.globex.id,
      tags: ['technology:c', 'technology:c-plus-plus'],
    });
    expect(q.status).toBe(201);
  });

  it('a spelled-out name resolves to the symbol one it slugs to, instead of colliding on the value', async () => {
    const cpp = (
      await adminCall('post', `/clients/${world.globex.id}/technologies`, { label: 'C++' })
    ).body.technology;
    for (const label of ['C-Plus-Plus', 'c plus plus']) {
      const res = await adminCall('post', `/clients/${world.globex.id}/technologies`, { label });
      expect(res.status).toBe(201);
      expect(res.body.technology).toMatchObject({ id: cpp.id, created: false });
    }
    expect(await db.tag.count({ where: { value: { startsWith: 'c-plus-plus' } } })).toBe(1);
  });

  it('a name with no letters or digits is refused', async () => {
    for (const label of ['+++', '###', '😀', ' - ']) {
      expect(
        (await adminCall('post', `/clients/${world.globex.id}/technologies`, { label })).status,
      ).toBe(400);
    }
  });

  it('renames the label everywhere, never the value, and refuses a clash', async () => {
    expect(
      (await adminCall('patch', `/technologies/${react()}`, { label: 'React.js' })).status,
    ).toBe(200);
    const tag = await db.tag.findUniqueOrThrow({ where: { id: react() } });
    expect(tag).toMatchObject({ value: 'react', label: 'React.js' });
    const clash = await adminCall('patch', `/technologies/${react()}`, { label: 'Node JS' });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe('TECHNOLOGY_EXISTS');
    expect(
      (
        await adminCall('patch', `/technologies/${world.tags.get('seniority:mid')!}`, {
          label: 'x',
        })
      ).status,
    ).toBe(404);
  });

  it('deleting a department archives only its exclusive technologies; restoring brings back only those', async () => {
    const impact = await adminCall('get', `/clients/${world.acme.id}/impact`);
    expect(impact.body.technologies).toBe(1); // nodejs; react is shared with Globex

    await adminCall('delete', `/clients/${world.acme.id}`);
    expect((await db.tag.findUniqueOrThrow({ where: { id: nodejs() } })).archivedAt).not.toBeNull();
    expect((await db.tag.findUniqueOrThrow({ where: { id: react() } })).archivedAt).toBeNull();

    await adminCall('post', `/clients/${world.acme.id}/restore`);
    expect((await db.tag.findUniqueOrThrow({ where: { id: nodejs() } })).archivedAt).toBeNull();
    expect(labels((await list(world.acme.id)).active)).toEqual(['nodejs', 'react']);
  });

  it('a technology shared by two departments comes back when either is restored, whichever deletion archived it', async () => {
    // react is linked to Acme and Globex. Delete Globex (react stays: Acme still uses it), then Acme (now nobody does).
    await adminCall('delete', `/clients/${world.globex.id}`).expect(204);
    expect((await db.tag.findUniqueOrThrow({ where: { id: react() } })).archivedAt).toBeNull();
    await adminCall('delete', `/clients/${world.acme.id}`).expect(204);
    const archived = await db.tag.findUniqueOrThrow({ where: { id: react() } });
    expect(archived.archivedAt).not.toBeNull();
    expect(archived.archivedByDepartmentId).toBe(world.acme.id);

    // Globex was deleted first, but it is Globex that comes back first: react is used again, so it is active
    await adminCall('post', `/clients/${world.globex.id}/restore`).expect(200);
    const back = await db.tag.findUniqueOrThrow({ where: { id: react() } });
    expect(back.archivedAt).toBeNull();
    expect(back.archivedByDepartmentId).toBeNull();
    // restoring the other one later changes nothing
    await adminCall('post', `/clients/${world.acme.id}/restore`).expect(200);
    expect((await db.tag.findUniqueOrThrow({ where: { id: react() } })).archivedAt).toBeNull();
  });

  it('only technologies archived BY the deletion come back: a hand-archived one with the same timestamp does not', async () => {
    await adminCall('delete', `/clients/${world.acme.id}/technologies/${nodejs()}`).expect(204); // archived by hand
    const deletedAt = new Date();
    await db.department.update({ where: { id: world.acme.id }, data: { deletedAt } });
    await db.tag.update({ where: { id: nodejs() }, data: { archivedAt: deletedAt } }); // same instant, on purpose
    await adminCall('post', `/clients/${world.acme.id}/restore`).expect(200);
    expect((await db.tag.findUniqueOrThrow({ where: { id: nodejs() } })).archivedAt).not.toBeNull();
  });

  it('a technology archived earlier by hand is not revived when the department is restored', async () => {
    await adminCall('delete', `/clients/${world.acme.id}/technologies/${nodejs()}`);
    await adminCall('delete', `/clients/${world.acme.id}`);
    await adminCall('post', `/clients/${world.acme.id}/restore`);
    expect(labels((await list(world.acme.id)).archived)).toEqual(['nodejs']);
  });

  it("a department question may only use that department's technologies; global ones any; edits keep what they have", async () => {
    const post = (u: { id: string }, body: object) => call(u, 'post', '/api/questions', body);
    const outside = await post(world.users.authorGlobex, {
      text: 'Node for Globex',
      clientId: world.globex.id,
      tags: ['technology:nodejs'],
    });
    expect(outside.status).toBe(400);
    expect(outside.body.error.code).toBe('TAG_NOT_IN_DEPARTMENT');

    const inside = await post(world.users.authorAcme, {
      text: 'Node for Acme',
      clientId: world.acme.id,
      tags: ['technology:nodejs', 'seniority:mid'],
    });
    expect(inside.status).toBe(201);

    const global = await post(world.users.authorA, {
      text: 'Global node question',
      tags: ['technology:nodejs'],
    });
    expect(global.status).toBe(201);

    // Globex later drops nothing, but Acme unlinks nodejs: its existing question can still be edited with it
    await db.departmentTag.deleteMany({ where: { departmentId: world.acme.id, tagId: nodejs() } });
    const edit = await call(
      world.users.authorAcme,
      'patch',
      `/api/questions/${inside.body.question.id}`,
      {
        text: 'Node for Acme (edited)',
        tags: ['technology:nodejs'],
      },
    );
    expect(edit.status).toBe(200);
  });

  it('GET /clients tells each user the technologies of their departments', async () => {
    const mine = await call(world.users.authorAcme, 'get', '/api/clients');
    expect(mine.body.items).toMatchObject([{ name: 'Acme', technologies: ['nodejs', 'react'] }]);
  });

  it("the list filter offers the technologies of the caller's departments (admin: all)", async () => {
    expect(await techs(world.users.authorGlobex, '?for=filter')).toEqual(['react:false']);
    expect(await techs(world.users.authorAcme, '?for=filter')).toEqual([
      'nodejs:false',
      'react:false',
    ]);
    expect(await techs(admin(), '?for=filter')).toEqual(['nodejs:false', 'react:false']);
    expect(await techs(world.users.authorA, '?for=filter')).toEqual([]); // no department, no global tech use
  });

  it('technologies no department uses form the "Other" group: flagged, offered to everyone, manageable by an admin', async () => {
    // Python is linked nowhere in this world, so it is "Other". (react and nodejs belong to departments.)
    const category = await db.tagCategory.findUniqueOrThrow({ where: { slug: 'technology' } });
    const loose = await db.tag.create({
      data: { categoryId: category.id, value: 'go', label: 'Go' },
    });

    const flagged = async (u: { id: string }, query = '') =>
      (await call(u, 'get', `/api/tags${query}`)).body.categories
        .find((c: { slug: string }) => c.slug === 'technology')
        .tags.filter((t: { other?: boolean }) => t.other)
        .map((t: { value: string }) => t.value);
    expect(await flagged(world.users.authorGlobex)).toEqual(['go']);
    // everyone's filter gets it, on top of their own departments' technologies
    expect(await techs(world.users.authorGlobex, '?for=filter')).toEqual([
      'go:false',
      'react:false',
    ]);

    const other = await adminCall('get', '/technologies/other');
    expect(other.body.active).toMatchObject([{ id: loose.id, label: 'Go', archived: false }]);

    expect((await adminCall('post', `/technologies/${loose.id}/archive`)).status).toBe(204);
    expect((await adminCall('post', `/technologies/${loose.id}/archive`)).status).toBe(404); // already archived
    expect((await adminCall('get', '/technologies/other')).body.archived).toHaveLength(1);
    expect(await flagged(world.users.authorGlobex)).toEqual([]);
    expect((await adminCall('post', `/technologies/${loose.id}/restore`)).status).toBe(204);

    // adding it to a department moves it out of "Other"
    await adminCall('post', `/clients/${world.globex.id}/technologies`, { label: 'Go' });
    expect((await adminCall('get', '/technologies/other')).body.active).toEqual([]);
    expect(await flagged(world.users.authorGlobex)).toEqual([]);
    // and it can no longer be archived from the Other endpoints
    const blocked = await adminCall('post', `/technologies/${loose.id}/archive`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('TECHNOLOGY_IN_DEPARTMENT');
  });
});
