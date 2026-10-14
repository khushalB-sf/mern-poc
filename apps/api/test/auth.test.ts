import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashToken, signAccess } from '../src/modules/auth/tokens.js';
import {
  PASSWORD,
  buildWorld,
  cookieFor,
  makeApp,
  makeDb,
  resetDb,
  testEnv,
  type World,
} from './helpers.js';

const db = makeDb();
let world: World;
const { app } = makeApp(db);

beforeAll(() => resetDb(db));
beforeEach(async () => {
  await resetDb(db);
  world = await buildWorld(db);
});
afterAll(() => db.$disconnect());

const login = (email = 'authora@test.dev', password = PASSWORD) =>
  request(app).post('/api/auth/login').send({ email, password });

const setCookies = (res: request.Response) =>
  (res.headers['set-cookie'] as unknown as string[]) ?? [];
const cookieValue = (res: request.Response, name: string) =>
  setCookies(res)
    .find((c) => c.startsWith(`${name}=`))
    ?.split(';')[0]
    ?.slice(name.length + 1);
const asCookies = (res: request.Response) =>
  [
    `access_token=${cookieValue(res, 'access_token')}`,
    `refresh_token=${cookieValue(res, 'refresh_token')}`,
  ].join('; ');
const refreshWith = (refresh: string | undefined) =>
  request(app)
    .post('/api/auth/refresh')
    .set('Cookie', refresh ? `refresh_token=${refresh}` : '');

describe('login', () => {
  it('returns the user and sets httpOnly, SameSite=Strict, path-scoped cookies; tokens never in the body', async () => {
    const res = await login();
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: 'authora@test.dev', role: 'AUTHOR' });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|eyJ/);

    const access = setCookies(res).find((c) => c.startsWith('access_token='))!;
    const refresh = setCookies(res).find((c) => c.startsWith('refresh_token='))!;
    for (const c of [access, refresh]) {
      expect(c).toMatch(/HttpOnly/i);
      expect(c).toMatch(/SameSite=Strict/i);
    }
    expect(access).toMatch(/Path=\/api(;|$)/);
    expect(refresh).toMatch(/Path=\/api\/auth(;|$)/);
    expect(res.body).not.toHaveProperty('accessToken');
  });

  it('gives the identical response for wrong password, unknown email and a disabled account', async () => {
    await db.appUser.update({ where: { email: 'authorb@test.dev' }, data: { active: false } });
    const [wrong, unknown, disabled] = await Promise.all([
      login('authora@test.dev', 'nope'),
      login('ghost@test.dev', PASSWORD),
      login('authorb@test.dev', PASSWORD),
    ]);
    for (const r of [wrong, unknown, disabled]) expect(r.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
    expect(disabled.body).toEqual(wrong.body);
    expect(setCookies(wrong)).toHaveLength(0);
  });

  it('treats the email case-insensitively and ignores surrounding whitespace', async () => {
    expect((await login('  AUTHORA@Test.dev ')).status).toBe(200);
  });

  it('rejects malformed input with 400 before touching the database', async () => {
    const before = await db.refreshToken.count();
    expect((await request(app).post('/api/auth/login').send({ email: 'x' })).status).toBe(400);
    expect((await login('not-an-email')).status).toBe(400);
    expect((await login('authora@test.dev', '')).status).toBe(400);
    expect((await login('authora@test.dev', 'x'.repeat(201))).status).toBe(400);
    expect(await db.refreshToken.count()).toBe(before);
  });

  it('is rate limited per IP+email, other emails unaffected', async () => {
    const { app: limited } = makeApp(db, { RATE_LIMIT_LOGIN_PER_MIN: '3' });
    const attempt = (email: string) =>
      request(limited).post('/api/auth/login').send({ email, password: 'wrong-password' });
    const codes = [];
    for (let i = 0; i < 4; i++) codes.push((await attempt('authora@test.dev')).status);
    expect(codes).toEqual([401, 401, 401, 429]);
    expect((await attempt('authorb@test.dev')).status).toBe(401);
  });
});

describe('access token / me', () => {
  it('returns the current user for a valid cookie', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', cookieFor(world.users.reviewer.id));
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: world.users.reviewer.id, role: 'REVIEWER' });
  });

  it.each([
    ['no cookie', undefined],
    ['garbage', 'access_token=garbage'],
    ['signed with the wrong secret', `access_token=${signAccess('x'.repeat(32), 'whoever')}`],
    [
      'signed with the refresh secret',
      `access_token=${signAccess(testEnv.JWT_REFRESH_SECRET, 'whoever')}`,
    ],
  ])('401 for %s', async (_name, cookie) => {
    const req = request(app).get('/api/auth/me');
    const res = await (cookie ? req.set('Cookie', cookie) : req);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('401 for an expired token', async () => {
    const expired = signAccess(testEnv.JWT_ACCESS_SECRET, world.users.plain.id, -10);
    const res = await request(app).get('/api/auth/me').set('Cookie', `access_token=${expired}`);
    expect(res.status).toBe(401);
  });

  it('401 for an unsigned (alg=none) token', async () => {
    const none = jwt.sign({ sub: world.users.plain.id }, '', { algorithm: 'none' });
    const res = await request(app).get('/api/auth/me').set('Cookie', `access_token=${none}`);
    expect(res.status).toBe(401);
  });

  it('401 once the account is disabled, and role changes apply immediately', async () => {
    const cookie = cookieFor(world.users.plain.id);
    await db.appUser.update({ where: { id: world.users.plain.id }, data: { role: 'REVIEWER' } });
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).body.user.role).toBe(
      'REVIEWER',
    );
    await db.appUser.update({ where: { id: world.users.plain.id }, data: { active: false } });
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
  });
});

describe('refresh rotation', () => {
  it('issues new cookies and stores only a hash of the refresh token', async () => {
    const first = await login();
    const oldRefresh = cookieValue(first, 'refresh_token')!;
    const res = await refreshWith(oldRefresh);
    expect(res.status).toBe(204);
    const newRefresh = cookieValue(res, 'refresh_token')!;
    expect(newRefresh).not.toBe(oldRefresh);
    expect(cookieValue(res, 'access_token')).toBeTruthy();

    const rows = await db.refreshToken.findMany();
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.tokenHash !== newRefresh && r.tokenHash !== oldRefresh)).toBe(true);
    expect(rows.some((r) => r.tokenHash === hashToken(newRefresh))).toBe(true);
    expect(new Set(rows.map((r) => r.familyId)).size).toBe(1);
  });

  it('a rotated token still works for the new one, and the new access cookie authenticates', async () => {
    const first = await login();
    const res = await refreshWith(cookieValue(first, 'refresh_token'));
    const me = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `access_token=${cookieValue(res, 'access_token')}`);
    expect(me.status).toBe(200);
    expect((await refreshWith(cookieValue(res, 'refresh_token'))).status).toBe(204);
  });

  it('replaying a used token is rejected and revokes the whole family', async () => {
    const first = await login();
    const t1 = cookieValue(first, 'refresh_token')!;
    const second = await refreshWith(t1);
    const t2 = cookieValue(second, 'refresh_token')!;

    expect((await refreshWith(t1)).status).toBe(401); // replay of a spent token
    expect((await refreshWith(t2)).status).toBe(401); // the legitimate successor is now dead too
    expect((await db.refreshToken.findMany()).every((r) => r.revokedAt !== null)).toBe(true);
  });

  it('does not touch other sessions of the same user when one family is revoked', async () => {
    const a = await login();
    const b = await login();
    const a1 = cookieValue(a, 'refresh_token')!;
    await refreshWith(a1);
    await refreshWith(a1); // replay: kills family A
    expect((await refreshWith(cookieValue(b, 'refresh_token'))).status).toBe(204);
  });

  it('only one of two concurrent refreshes with the same token succeeds', async () => {
    const t = cookieValue(await login(), 'refresh_token')!;
    const results = await Promise.all([refreshWith(t), refreshWith(t)]);
    expect(results.map((r) => r.status).sort()).toEqual([204, 401]);
  });

  it.each([
    ['missing cookie', undefined],
    ['garbage', 'garbage'],
    ['an access token', signAccess(testEnv.JWT_ACCESS_SECRET, 'x')],
  ])('401 for %s', async (_n, token) => {
    expect((await refreshWith(token)).status).toBe(401);
  });

  it('401 and family revoked if the user was disabled meanwhile', async () => {
    const t = cookieValue(await login(), 'refresh_token')!;
    await db.appUser.update({ where: { email: 'authora@test.dev' }, data: { active: false } });
    expect((await refreshWith(t)).status).toBe(401);
    expect((await db.refreshToken.findMany()).every((r) => r.revokedAt !== null)).toBe(true);
  });
});

describe('logout', () => {
  it('revokes the family, clears both cookies, and the refresh token no longer works', async () => {
    const first = await login();
    const t = cookieValue(first, 'refresh_token')!;
    const res = await request(app).post('/api/auth/logout').set('Cookie', `refresh_token=${t}`);
    expect(res.status).toBe(204);
    const cleared = setCookies(res);
    expect(cleared.find((c) => c.startsWith('access_token='))).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(cleared.find((c) => c.startsWith('refresh_token='))).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect((await refreshWith(t)).status).toBe(401);
  });

  it('is idempotent without any cookie', async () => {
    expect((await request(app).post('/api/auth/logout')).status).toBe(204);
  });
});

describe('CSRF origin check', () => {
  it('rejects unsafe requests from a non-allow-listed Origin', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Origin', 'https://evil.example')
      .send({ email: 'authora@test.dev', password: PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('BAD_ORIGIN');
    expect(setCookies(res)).toHaveLength(0);
  });

  it('allows the configured Origin, no Origin (non-browser), and cross-origin GETs', async () => {
    const ok = await request(app)
      .post('/api/auth/login')
      .set('Origin', 'http://localhost:3000')
      .send({ email: 'authora@test.dev', password: PASSWORD });
    expect(ok.status).toBe(200);
    expect(
      (await request(app).get('/api/health').set('Origin', 'https://evil.example')).status,
    ).toBe(200);
  });

  it('also protects refresh and logout', async () => {
    for (const path of ['/api/auth/refresh', '/api/auth/logout']) {
      const res = await request(app).post(path).set('Origin', 'https://evil.example');
      expect(res.status).toBe(403);
    }
  });
});

describe('secrets in logs', () => {
  it('never logs passwords or tokens', async () => {
    const { app: a, lines } = makeApp(db);
    const res = await request(a)
      .post('/api/auth/login')
      .send({ email: 'authora@test.dev', password: PASSWORD });
    await request(a).get('/api/auth/me').set('Cookie', asCookies(res));
    const out = lines.join('');
    expect(out).not.toContain(PASSWORD);
    expect(out).not.toContain(cookieValue(res, 'access_token')!);
    expect(out).not.toContain(cookieValue(res, 'refresh_token')!);
  });
});
