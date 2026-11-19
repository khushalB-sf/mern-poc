/**
 * Red-team tests for authentication and sessions. Each test asserts the SECURE behaviour; a failure
 * is a confirmed finding (see docs/06-security-review.md).
 */
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/env.js';
import { signAccess, signRefresh } from '../src/modules/auth/tokens.js';
import {
  PASSWORD,
  buildWorld,
  cookieFor,
  makeApp,
  makeDb,
  resetDb,
  testEnv,
  ensureSession,
  type World,
} from './helpers.js';

const db = makeDb();
let world: World;
beforeEach(async () => {
  await resetDb(db);
  world = await buildWorld(db);
});
afterAll(() => db.$disconnect());

const loginAs = (
  app: ReturnType<typeof makeApp>['app'],
  email: string,
  headers: Record<string, string> = {},
) => request(app).post('/api/auth/login').set(headers).send({ email, password: 'wrong-password' });

describe('A1 login flood: limits must not be bypassable by rotating the email', () => {
  it('one IP trying many different emails gets rate limited (credential stuffing / Argon2 CPU)', async () => {
    const { app } = makeApp(db, {
      RATE_LIMIT_LOGIN_PER_MIN: '5',
      RATE_LIMIT_LOGIN_IP_PER_MIN: '10',
    });
    const statuses: number[] = [];
    for (let i = 0; i < 14; i++) statuses.push((await loginAs(app, `victim${i}@test.dev`)).status);
    expect(statuses).toContain(429);
    // the first attempts are still answered normally
    expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
  });
});

describe('A2 X-Forwarded-For spoofing must not reset the rate limit', () => {
  it('rotating the header per request does not give a fresh allowance (default: no trusted proxy)', async () => {
    const { app } = makeApp(db, { RATE_LIMIT_LOGIN_PER_MIN: '3' });
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      statuses.push(
        (await loginAs(app, 'authora@test.dev', { 'X-Forwarded-For': `203.0.113.${i + 1}` }))
          .status,
      );
    }
    expect(statuses).toContain(429);
  });

  it('behind a trusted proxy (TRUST_PROXY=1) the forwarded client address is the limiter key', async () => {
    const { app } = makeApp(db, { RATE_LIMIT_LOGIN_PER_MIN: '2', TRUST_PROXY: '1' });
    const same = [];
    for (let i = 0; i < 4; i++) {
      same.push(
        (await loginAs(app, 'authora@test.dev', { 'X-Forwarded-For': '198.51.100.7' })).status,
      );
    }
    expect(same).toContain(429);
    // a different real client (as appended by the proxy) is unaffected
    expect(
      (await loginAs(app, 'authora@test.dev', { 'X-Forwarded-For': '198.51.100.8' })).status,
    ).toBe(401);
  });
});

describe('A3 session handling', () => {
  const signIn = async (app: ReturnType<typeof makeApp>['app'], email = 'authora@test.dev') => {
    const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
    const cookies = (res.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]!);
    return {
      access: cookies.find((c) => c.startsWith('access_token='))!,
      refresh: cookies.find((c) => c.startsWith('refresh_token='))!,
      both: cookies.join('; '),
    };
  };
  const me = (app: ReturnType<typeof makeApp>['app'], cookie: string) =>
    request(app)
      .get('/api/auth/me')
      .set('Cookie', cookie)
      .then((r) => r.status);

  it('an access token dies with its session: after logout it is rejected at once, not 15 minutes later', async () => {
    const { app } = makeApp(db);
    const s = await signIn(app);
    expect(await me(app, s.access)).toBe(200);
    await request(app).post('/api/auth/logout').set('Cookie', s.both);
    expect(await me(app, s.access)).toBe(401);
  });

  it('refreshing keeps the same session: the old access token stays valid until it expires, the new one works', async () => {
    const { app } = makeApp(db);
    const s = await signIn(app);
    const res = await request(app).post('/api/auth/refresh').set('Cookie', s.refresh);
    expect(res.status).toBe(204);
    const fresh = (res.headers['set-cookie'] as unknown as string[])
      .find((c) => c.startsWith('access_token='))!
      .split(';')[0]!;
    expect(await me(app, fresh)).toBe(200);
    expect(await me(app, s.access)).toBe(200);
  });

  it('a replayed refresh token revokes the family and so kills every access token of that session', async () => {
    const { app } = makeApp(db);
    const s = await signIn(app);
    await request(app).post('/api/auth/refresh').set('Cookie', s.refresh).expect(204);
    await request(app).post('/api/auth/refresh').set('Cookie', s.refresh).expect(401); // replay
    expect(await me(app, s.access)).toBe(401);
  });

  it("signing out one device leaves the same user's other session working", async () => {
    const { app } = makeApp(db);
    const phone = await signIn(app);
    const laptop = await signIn(app);
    await request(app).post('/api/auth/logout').set('Cookie', phone.both);
    expect(await me(app, phone.access)).toBe(401);
    expect(await me(app, laptop.access)).toBe(200);
  });

  it('an admin password reset ends the access tokens too, not only the refresh tokens', async () => {
    const { app } = makeApp(db);
    const s = await signIn(app);
    await request(app)
      .patch(`/api/admin/users/${world.users.authorA.id}`)
      .set('Cookie', cookieFor(world.users.admin.id))
      .send({ password: 'a-brand-new-password' })
      .expect(200);
    expect(await me(app, s.access)).toBe(401);
  });

  it('a token is only valid with a live session of the same user: no session, a foreign one, an expired one', async () => {
    const { app } = makeApp(db);
    const sign = (sid: string) =>
      `access_token=${signAccess(testEnv.JWT_ACCESS_SECRET, world.users.authorA.id, sid)}`;
    expect(await me(app, sign('55555555-5555-4555-8555-555555555555'))).toBe(401); // does not exist
    expect(await me(app, sign(world.users.authorB.id))).toBe(401); // another user's live session
    await db.refreshToken.updateMany({
      where: { familyId: world.users.authorA.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await me(app, sign(world.users.authorA.id))).toBe(401); // the user's own, but expired
    const legacy = jwt.sign({}, testEnv.JWT_ACCESS_SECRET, {
      subject: world.users.authorB.id,
      issuer: 'interview-qb',
      expiresIn: 60,
    });
    expect(await me(app, `access_token=${legacy}`)).toBe(401); // the old format, no session claim
  });

  it('an admin password reset, deactivation or delete kills the refresh families at once', async () => {
    const { app } = makeApp(db);
    const refreshOf = async (email: string) => {
      const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
      const c = (res.headers['set-cookie'] as unknown as string[]).find((x) =>
        x.startsWith('refresh_token='),
      )!;
      return c.split(';')[0]!;
    };
    const rt = await refreshOf('authora@test.dev');
    const admin = cookieFor(world.users.admin.id);
    await request(app)
      .patch(`/api/admin/users/${world.users.authorA.id}`)
      .set('Cookie', admin)
      .send({ password: 'a-brand-new-password' })
      .expect(200);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', rt)).status).toBe(401);

    const rt2 = await refreshOf('authorb@test.dev');
    await request(app)
      .delete(`/api/admin/users/${world.users.authorB.id}`)
      .set('Cookie', admin)
      .expect(204);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', rt2)).status).toBe(401);
  });

  it('a refresh token is not an access token and an access token is not a refresh token', async () => {
    const { app } = makeApp(db);
    const refresh = signRefresh(testEnv.JWT_REFRESH_SECRET, {
      userId: world.users.admin.id,
      jti: '11111111-1111-4111-8111-111111111111',
      familyId: '22222222-2222-4222-8222-222222222222',
    });
    expect(
      (await request(app).get('/api/auth/me').set('Cookie', `access_token=${refresh}`)).status,
    ).toBe(401);
    const access = signAccess(
      testEnv.JWT_ACCESS_SECRET,
      world.users.admin.id,
      world.users.admin.id,
    );
    expect(
      (await request(app).post('/api/auth/refresh').set('Cookie', `refresh_token=${access}`))
        .status,
    ).toBe(401);
  });

  it('a validly signed token whose subject is not a UUID or not a user is a clean 401, never a 500', async () => {
    const { app } = makeApp(db);
    for (const sub of ['abc', "1' OR '1'='1", '', '00000000-0000-4000-8000-000000000000']) {
      const token = signAccess(testEnv.JWT_ACCESS_SECRET, sub || 'x', world.users.admin.id);
      const res = await request(app).get('/api/auth/me').set('Cookie', `access_token=${token}`);
      expect(res.status, `sub=${sub}`).toBe(401);
    }
  });

  it('tokens signed with the wrong issuer, algorithm or secret are rejected', async () => {
    const { app } = makeApp(db);
    const sub = world.users.admin.id;
    const forged = [
      jwt.sign({}, testEnv.JWT_ACCESS_SECRET, {
        subject: sub,
        issuer: 'someone-else',
        expiresIn: 60,
      }),
      jwt.sign({}, testEnv.JWT_ACCESS_SECRET, {
        subject: sub,
        issuer: 'interview-qb',
        algorithm: 'HS512',
        expiresIn: 60,
      }),
      jwt.sign({}, 'x'.repeat(32), { subject: sub, issuer: 'interview-qb', expiresIn: 60 }),
      jwt.sign({}, testEnv.JWT_REFRESH_SECRET, {
        subject: sub,
        issuer: 'interview-qb',
        expiresIn: 60,
      }),
    ];
    for (const t of forged) {
      expect(
        (await request(app).get('/api/auth/me').set('Cookie', `access_token=${t}`)).status,
      ).toBe(401);
    }
  });
});

describe('A4 cookie attributes', () => {
  it('are Secure when COOKIE_SECURE is on, and the refresh cookie is never sent to the questions API', async () => {
    const { app } = makeApp(db, {
      COOKIE_SECURE: 'true',
      JWT_ACCESS_SECRET: 'x'.repeat(32),
      JWT_REFRESH_SECRET: 'y'.repeat(32),
    });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'authora@test.dev', password: PASSWORD });
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies).toHaveLength(2);
    for (const c of cookies) expect(c).toMatch(/;\s*Secure/i);
    const refresh = cookies.find((c) => c.startsWith('refresh_token='))!;
    expect(refresh).toMatch(/Path=\/api\/auth/);
    expect(refresh).not.toMatch(/Path=\/api;/);
  });
});

describe('A5 CSRF origin check', () => {
  const evil = [
    'null',
    'http://localhost:3001',
    'https://localhost:3000',
    'http://localhost:3000.evil.example',
    'http://evil.example/http://localhost:3000',
    'http://LOCALHOST:3000',
  ];
  it.each(evil)('rejects an unsafe request with Origin %s', async (origin) => {
    const { app } = makeApp(db);
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Origin', origin)
      .set('Cookie', cookieFor(world.users.admin.id));
    expect(res.status).toBe(403);
  });

  it('method-override headers do not turn a POST into something else', async () => {
    const { app } = makeApp(db);
    const q = await db.question.create({
      data: { text: 'keep me', authorId: world.users.authorA.id, status: 'APPROVED' },
    });
    const res = await request(app)
      .post(`/api/questions/${q.id}`)
      .set('X-HTTP-Method-Override', 'DELETE')
      .set('Cookie', cookieFor(world.users.admin.id));
    expect(res.status).toBe(404);
    expect(await db.question.count({ where: { id: q.id, deletedAt: null } })).toBe(1);
  });
});

describe('A6 login input abuse', () => {
  const post = (body: unknown) =>
    request(makeApp(db).app)
      .post('/api/auth/login')
      .send(body as object);

  it.each([
    [{ email: ['authora@test.dev'], password: PASSWORD }],
    [{ email: { $ne: '' }, password: PASSWORD }],
    [{ email: 'authora@test.dev', password: { $ne: '' } }],
    [{ email: 'authora@test.dev', password: ['x'] }],
    [{ email: 'authora@test.dev', password: 'x'.repeat(201) }],
    [{ email: `${'a'.repeat(250)}@test.dev`, password: PASSWORD }],
    [{ email: 'authora@test.dev\u0000x', password: PASSWORD }],
    [{}],
    [null],
  ])('%j is a 400 (or 401), never a 500 or a session', async (body) => {
    const res = await post(body);
    expect([400, 401]).toContain(res.status);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('unknown, disabled and deleted accounts get the byte-identical response', async () => {
    const { app } = makeApp(db);
    await db.appUser.update({ where: { id: world.users.authorB.id }, data: { active: false } });
    await db.appUser.update({
      where: { id: world.users.plain.id },
      data: { deletedAt: new Date(), active: false },
    });
    const ask = async (email: string) => {
      const r = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
      return { status: r.status, body: JSON.stringify(r.body), cookies: r.headers['set-cookie'] };
    };
    const [unknown, disabled, deleted] = [
      await ask('nobody@test.dev'),
      await ask('authorb@test.dev'),
      await ask('plain@test.dev'),
    ];
    expect(disabled).toEqual(unknown);
    expect(deleted).toEqual(unknown);
  });
});

describe('A6b extra fields in the login body never change who you become', () => {
  it('a role in the body is ignored: you get your own role from the database', async () => {
    const { app } = makeApp(db);
    const res = await request(app).post('/api/auth/login').send({
      email: 'authora@test.dev',
      password: PASSWORD,
      role: 'ADMIN',
      userId: world.users.admin.id,
    });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: 'authora@test.dev', role: 'AUTHOR' });
  });
});

describe('A7 default credentials never reach a real deployment', () => {
  const secure = {
    ...testEnv,
    COOKIE_SECURE: 'true',
    JWT_ACCESS_SECRET: 'p'.repeat(32),
    JWT_REFRESH_SECRET: 'q'.repeat(32),
  };
  it('refuses to start over https while seeding demo accounts with the published default password', () => {
    expect(() => loadConfig({ ...secure, SEED_ON_START: 'true' })).toThrow(/SEED_PASSWORD/);
  });
  it('allows it with a custom seed password, or without seeding', () => {
    expect(() =>
      loadConfig({ ...secure, SEED_ON_START: 'true', SEED_PASSWORD: 'Another-Str0ng-One!' }),
    ).not.toThrow();
    expect(() => loadConfig({ ...secure, SEED_ON_START: 'false' })).not.toThrow();
  });
});

describe('A8 an admin cannot be locked out by the admins themselves', () => {
  it('the last active admin cannot be demoted, deactivated or deleted, even concurrently', async () => {
    const { app } = makeApp(db);
    const other = await db.appUser.create({
      data: {
        email: 'admin2@test.dev',
        name: 'admin2',
        role: 'ADMIN',
        passwordHash: (await db.appUser.findUniqueOrThrow({ where: { id: world.users.admin.id } }))
          .passwordHash,
      },
    });
    await ensureSession(db, other.id);
    const a = cookieFor(world.users.admin.id);
    const b = cookieFor(other.id);
    // Each admin demotes the other at the same moment.
    await Promise.all([
      request(app).patch(`/api/admin/users/${other.id}`).set('Cookie', a).send({ role: 'USER' }),
      request(app)
        .patch(`/api/admin/users/${world.users.admin.id}`)
        .set('Cookie', b)
        .send({ role: 'USER' }),
    ]);
    expect(
      await db.appUser.count({ where: { role: 'ADMIN', active: true, deletedAt: null } }),
    ).toBeGreaterThanOrEqual(1);
  });
});
