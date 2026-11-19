/** Every authenticated endpoint is rate limited, not just the questions API. */
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/env.js';
import { buildWorld, cookieFor, makeApp, makeDb, resetDb, testEnv, type World } from './helpers.js';

const db = makeDb();
let world: World;
beforeEach(async () => {
  await resetDb(db);
  world = await buildWorld(db);
});
afterAll(() => db.$disconnect());

const get = (app: ReturnType<typeof makeApp>['app'], path: string, u: { id: string }) =>
  request(app).get(path).set('Cookie', cookieFor(u.id));

describe('taxonomy and admin endpoints share one allowance per user', () => {
  it('/tags, /clients and /admin/* are limited together, per user', async () => {
    const { app } = makeApp(db, { RATE_LIMIT_OTHER_PER_MIN: '3' });
    const admin = world.users.admin;
    const statuses = [
      (await get(app, '/api/tags', admin)).status,
      (await get(app, '/api/clients', admin)).status,
      (await get(app, '/api/admin/users', admin)).status,
      (await get(app, '/api/tags', admin)).status, // the fourth call, whichever endpoint
    ];
    expect(statuses).toEqual([200, 200, 200, 429]);

    const limited = await get(app, '/api/admin/clients', admin);
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(limited.headers).not.toHaveProperty('ratelimit');
    expect(limited.headers).not.toHaveProperty('ratelimit-remaining');

    // another user is unaffected
    expect((await get(app, '/api/tags', world.users.authorA)).status).toBe(200);
  });

  it('does not eat into the questions allowance, which is counted separately', async () => {
    const { app } = makeApp(db, { RATE_LIMIT_OTHER_PER_MIN: '1', RATE_LIMIT_API_PER_MIN: '5' });
    const u = world.users.authorA;
    expect((await get(app, '/api/tags', u)).status).toBe(200);
    expect((await get(app, '/api/tags', u)).status).toBe(429);
    expect((await get(app, '/api/questions', u)).status).toBe(200);
  });

  it('is checked after authentication: an anonymous caller gets 401, not a counted 429', async () => {
    const { app } = makeApp(db, { RATE_LIMIT_OTHER_PER_MIN: '1' });
    for (let i = 0; i < 4; i++) expect((await request(app).get('/api/tags')).status).toBe(401);
  });

  it('leaves the health check and docs alone', async () => {
    const { app } = makeApp(db, { RATE_LIMIT_OTHER_PER_MIN: '1', RATE_LIMIT_AUTH_PER_MIN: '1' });
    for (let i = 0; i < 5; i++) {
      expect((await request(app).get('/api/health')).status).toBe(200);
      expect((await request(app).get('/api/openapi.json')).status).toBe(200);
    }
  });

  it('has sensible defaults and refuses nonsense', () => {
    const c = loadConfig({
      ...testEnv,
      RATE_LIMIT_OTHER_PER_MIN: undefined,
      RATE_LIMIT_AUTH_PER_MIN: undefined,
    });
    expect(c.RATE_LIMIT_OTHER_PER_MIN).toBe(120);
    expect(c.RATE_LIMIT_AUTH_PER_MIN).toBe(30);
    expect(() => loadConfig({ ...testEnv, RATE_LIMIT_OTHER_PER_MIN: '0' })).toThrow();
    expect(() => loadConfig({ ...testEnv, RATE_LIMIT_AUTH_PER_MIN: 'many' })).toThrow();
  });
});

describe('refresh and logout are limited per address', () => {
  it('too many calls from one address get a 429, whatever the cookie says', async () => {
    const { app } = makeApp(db, { RATE_LIMIT_AUTH_PER_MIN: '3' });
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      const path = i % 2 ? '/api/auth/logout' : '/api/auth/refresh'; // the two share the allowance
      statuses.push((await request(app).post(path)).status);
    }
    expect(statuses.slice(0, 3)).not.toContain(429);
    expect(statuses.slice(3)).toEqual([429, 429]);
  });

  it('a spoofed X-Forwarded-For does not reset it (no trusted proxy by default)', async () => {
    const { app } = makeApp(db, { RATE_LIMIT_AUTH_PER_MIN: '2' });
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      statuses.push(
        (
          await request(app)
            .post('/api/auth/refresh')
            .set('X-Forwarded-For', `203.0.113.${i + 1}`)
        ).status,
      );
    }
    expect(statuses).toContain(429);
  });

  it('the 429 has the standard body and no rate-limit headers', async () => {
    const { app } = makeApp(db, { RATE_LIMIT_AUTH_PER_MIN: '1' });
    await request(app).post('/api/auth/refresh');
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    expect(res.headers).not.toHaveProperty('ratelimit');
  });
});
