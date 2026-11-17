import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
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
const call = (
  u: { id: string },
  method: 'get' | 'post' | 'patch' | 'put',
  path: string,
  body?: object,
) => request(app)[method](`/api/admin${path}`).set('Cookie', as(u)).send(body);

describe('admin gate', () => {
  const routes: ['get' | 'post' | 'patch' | 'put', string, object][] = [
    ['get', '/users', {}],
    ['patch', `/users/${UUID}`, { role: 'AUTHOR' }],
    ['put', `/users/${UUID}/clients`, { clientIds: [] }],
    ['get', '/clients', {}],
    ['post', '/clients', { name: 'Nope' }],
  ];
  it.each(routes)('%s %s is ADMIN-only', async (method, path, body) => {
    for (const u of [world.users.plain, world.users.authorA, world.users.reviewer]) {
      const res = await call(u, method, path, body);
      expect(res.status).toBe(403);
    }
  });

  it('non-admins are refused before validation or any lookup runs', async () => {
    // A malformed body and an unknown id would be 400/404 for an admin; here it must be 403 either way.
    expect((await call(world.users.authorA, 'patch', '/users/not-a-uuid', { x: 1 })).status).toBe(
      403,
    );
  });
});

describe('users', () => {
  it('lists every user with role and departments', async () => {
    const res = await call(admin(), 'get', '/users');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(Object.keys(world.users).length);
    const acme = res.body.items.find((u: { email: string }) => u.email === 'authoracme@test.dev');
    expect(acme).toMatchObject({ role: 'AUTHOR', active: true, clients: [{ name: 'Acme' }] });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|password_hash|argon2/i);
  });

  it('changes a role, effective on the very next request, and audits it', async () => {
    const u = world.users.plain;
    const before = await request(app)
      .post('/api/questions')
      .set('Cookie', as(u))
      .send({ text: 'Can I add this?' });
    expect(before.status).toBe(403);

    const res = await call(admin(), 'patch', `/users/${u.id}`, { role: 'AUTHOR' });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('AUTHOR');
    const after = await request(app)
      .post('/api/questions')
      .set('Cookie', as(u))
      .send({ text: 'Can I add this?' });
    expect(after.status).toBe(201);

    const events = await db.auditEvent.findMany({ where: { type: 'USER_ROLE_CHANGED' } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actorId: admin().id,
      questionId: null,
      payload: { userId: u.id, from: 'USER', to: 'AUTHOR' },
    });
  });

  it('an unchanged role records nothing', async () => {
    await call(admin(), 'patch', `/users/${world.users.authorA.id}`, { role: 'AUTHOR' });
    expect(await db.auditEvent.count()).toBe(0);
  });

  it('an admin cannot change their own role (no lock-out)', async () => {
    const res = await call(admin(), 'patch', `/users/${admin().id}`, { role: 'USER' });
    expect(res.status).toBe(403);
    expect((await db.appUser.findUnique({ where: { id: admin().id } }))!.role).toBe('ADMIN');
  });

  it('an admin can promote another admin', async () => {
    const res = await call(admin(), 'patch', `/users/${world.users.authorA.id}`, { role: 'ADMIN' });
    expect(res.body.user.role).toBe('ADMIN');
  });

  it.each([
    ['unknown role', { role: 'ROOT' }],
    ['missing role', {}],
    ['extra field', { role: 'AUTHOR', admin: true }],
  ])('SEC-01: %s is a 400', async (_n, body) => {
    const res = await call(admin(), 'patch', `/users/${world.users.plain.id}`, body);
    expect(res.status).toBe(400);
    expect(await db.auditEvent.count()).toBe(0);
  });

  it('unknown user is 404', async () => {
    expect((await call(admin(), 'patch', `/users/${UUID}`, { role: 'AUTHOR' })).status).toBe(404);
  });

  it('replaces department grants and audits what was added and removed', async () => {
    const u = world.users.plainAcme; // starts with Acme
    const res = await call(admin(), 'put', `/users/${u.id}/clients`, {
      clientIds: [world.globex.id],
    });
    expect(res.status).toBe(200);
    expect(res.body.user.clients).toEqual([{ id: world.globex.id, name: 'Globex' }]);
    const [event] = await db.auditEvent.findMany({ where: { type: 'USER_CLIENTS_CHANGED' } });
    expect(event!.payload).toEqual({
      userId: u.id,
      added: [world.globex.id],
      removed: [world.acme.id],
    });

    // the grant is live: they now see Globex's questions and no longer Acme's
    await addQuestion(db, world, {
      text: 'globex only zzglobex',
      authorId: world.users.authorGlobex.id,
      clientId: world.globex.id,
    });
    const seen = await request(app).get('/api/questions?q=zzglobex').set('Cookie', as(u));
    expect(seen.body.page.total).toBe(1);
  });

  it('an unchanged grant set records nothing; duplicates in the request are ignored', async () => {
    const u = world.users.plainAcme;
    await call(admin(), 'put', `/users/${u.id}/clients`, {
      clientIds: [world.acme.id, world.acme.id],
    });
    expect(await db.auditEvent.count()).toBe(0);
  });

  it('refuses an unknown department and changes nothing', async () => {
    const u = world.users.plainAcme;
    const res = await call(admin(), 'put', `/users/${u.id}/clients`, {
      clientIds: [world.globex.id, UUID],
    });
    expect(res.status).toBe(400);
    expect(await db.clientGrant.count({ where: { userId: u.id } })).toBe(1);
  });
});

describe('departments', () => {
  it('adds a department, audits it, and rejects a duplicate name with 409', async () => {
    const res = await call(admin(), 'post', '/clients', { name: '  Initech  ' });
    expect(res.status).toBe(201);
    expect(res.body.client).toMatchObject({ name: 'Initech', userCount: 0 });
    expect(await db.auditEvent.count({ where: { type: 'CLIENT_CREATED' } })).toBe(1);

    const dup = await call(admin(), 'post', '/clients', { name: 'Initech' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('DEPARTMENT_EXISTS');
    expect(await db.client.count({ where: { name: 'Initech' } })).toBe(1);
  });

  it.each([
    ['blank', { name: '   ' }],
    ['too long', { name: 'x'.repeat(101) }],
    ['extra field', { name: 'A', id: 'x' }],
  ])('SEC-01: %s name is a 400', async (_n, body) => {
    expect((await call(admin(), 'post', '/clients', body)).status).toBe(400);
  });

  it('lists departments with how many users hold them', async () => {
    const res = await call(admin(), 'get', '/clients');
    expect(res.body.items).toEqual([
      expect.objectContaining({ name: 'Acme', userCount: 3 }), // plainAcme, authorAcme, reviewer
      expect.objectContaining({ name: 'Globex', userCount: 1 }),
    ]);
  });

  it('a new department is usable: grant it, and the user can then write into it', async () => {
    const { body } = await call(admin(), 'post', '/clients', { name: 'Initech' });
    const author = world.users.authorA;
    const denied = await request(app)
      .post('/api/questions')
      .set('Cookie', as(author))
      .send({ text: 'Initech only', clientId: body.client.id });
    expect(denied.status).toBe(404); // not granted yet
    await call(admin(), 'put', `/users/${author.id}/clients`, { clientIds: [body.client.id] });
    const ok = await request(app)
      .post('/api/questions')
      .set('Cookie', as(author))
      .send({ text: 'Initech only', clientId: body.client.id });
    expect(ok.status).toBe(201);
  });

  it('GET /clients lists every department for an admin, only granted ones for everyone else', async () => {
    const names = async (u: { id: string }) =>
      (
        (await request(app).get('/api/clients').set('Cookie', as(u))).body.items as {
          name: string;
        }[]
      ).map((c) => c.name);
    expect(await names(admin())).toEqual(['Acme', 'Globex']);
    expect(await names(world.users.authorAcme)).toEqual(['Acme']);
    expect(await names(world.users.authorA)).toEqual([]);
  });
});
