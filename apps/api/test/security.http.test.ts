/** Red-team tests for the HTTP layer: headers, caching, CORS, error bodies and deployment defaults. */
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/env.js';
import { buildWorld, cookieFor, makeApp, makeDb, resetDb, testEnv, type World } from './helpers.js';

const db = makeDb();
const { app } = makeApp(db);
let world: World;
beforeEach(async () => {
  await resetDb(db);
  world = await buildWorld(db);
});
afterAll(() => db.$disconnect());

const cookie = () => cookieFor(world.users.admin.id);

describe('D1 authenticated responses are never cached', () => {
  it.each([
    '/api/auth/me',
    '/api/questions',
    '/api/tags',
    '/api/clients',
    '/api/admin/users',
    '/api/admin/clients',
    '/api/admin/deleted-questions',
  ])('GET %s sends Cache-Control: no-store', async (path) => {
    const res = await request(app).get(path).set('Cookie', cookie());
    expect(res.headers['cache-control']).toMatch(/no-store/);
  });

  it('errors (401, 404, 400) and login are not cacheable either', async () => {
    expect((await request(app).get('/api/auth/me')).headers['cache-control']).toMatch(/no-store/);
    expect((await request(app).get('/api/nope')).headers['cache-control']).toMatch(/no-store/);
    expect((await request(app).post('/api/auth/login').send({})).headers['cache-control']).toMatch(
      /no-store/,
    );
  });
});

describe('D2 security headers', () => {
  it('helmet defaults are on and the framework is not advertised', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['content-security-policy']).toMatch(/default-src 'self'/);
    expect(res.headers['referrer-policy']).toBeDefined();
  });

  it('request ids are generated server-side; a client-supplied one is ignored (log forging)', async () => {
    const res = await request(app).get('/api/health').set('X-Request-Id', 'evil\\x00id');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('D3 CORS: no cross-origin access is ever granted', () => {
  it('preflight and simple requests from another origin get no Access-Control-Allow-* headers', async () => {
    const pre = await request(app)
      .options('/api/questions')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'DELETE');
    const get = await request(app).get('/api/health').set('Origin', 'https://evil.example');
    for (const res of [pre, get]) {
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
      expect(res.headers['access-control-allow-credentials']).toBeUndefined();
    }
  });
});

describe('D4 error bodies reveal nothing about the implementation', () => {
  it('no stack traces, SQL, file paths or library names in any error response', async () => {
    const attacks = await Promise.all([
      request(app).get('/api/nope'),
      request(app).post('/api/auth/login').send('{{{').set('Content-Type', 'application/json'),
      request(app).get('/api/questions?limit=abc').set('Cookie', cookie()),
      request(app).get('/api/questions/not-a-uuid').set('Cookie', cookie()),
      request(app)
        .get(`/api/questions/${'1'.repeat(8)}-1111-4111-8111-111111111111`)
        .set('Cookie', cookie()),
      request(app).post('/api/questions').set('Cookie', cookie()).send({ text: '' }),
      request(app).trace('/api/questions'),
      request(app).get('/api/auth/me').set('Cookie', 'access_token=garbage'),
    ]);
    for (const res of attacks) {
      const body = typeof res.text === 'string' ? res.text : '';
      expect(body, `${res.status}`).not.toMatch(
        /node_modules|\.ts:|\.js:|at .*\(|prisma|postgres|SELECT |INSERT |stack|ECONN|jsonwebtoken|express/i,
      );
      expect(res.headers['content-type'] ?? '').toMatch(/json|^$/);
    }
  });

  it('health exposes only a status, not versions, hosts or connection details', async () => {
    const res = await request(app).get('/api/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('D5 safe deployment defaults', () => {
  it('Swagger is off by default in production, on by default elsewhere, and always switchable', () => {
    expect(loadConfig({ ...testEnv, NODE_ENV: 'production' }).DOCS_ENABLED).toBe(false);
    expect(loadConfig({ ...testEnv, NODE_ENV: 'development' }).DOCS_ENABLED).toBe(true);
    expect(
      loadConfig({ ...testEnv, NODE_ENV: 'production', DOCS_ENABLED: 'true' }).DOCS_ENABLED,
    ).toBe(true);
  });

  it('a production app does not serve the API contract unless asked to', async () => {
    const { app: prod } = makeApp(db, { NODE_ENV: 'production' });
    expect((await request(prod).get('/api/openapi.json')).status).toBe(404);
    expect((await request(prod).get('/api/docs')).status).toBe(404);
  });

  it('no proxy header is trusted unless TRUST_PROXY says so', () => {
    expect(loadConfig(testEnv).TRUST_PROXY).toBe(0);
    expect(loadConfig({ ...testEnv, TRUST_PROXY: '1' }).TRUST_PROXY).toBe(1);
    expect(() => loadConfig({ ...testEnv, TRUST_PROXY: '-1' })).toThrow();
    expect(() => loadConfig({ ...testEnv, TRUST_PROXY: 'true' })).toThrow();
  });
});
