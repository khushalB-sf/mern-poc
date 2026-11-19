/** Health probes and Prometheus metrics. */
import request from 'supertest';
import pino from 'pino';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/http/app.js';
import {
  buildWorld,
  cookieFor,
  makeApp,
  makeDb,
  resetDb,
  testConfig,
  type World,
} from './helpers.js';

const db = makeDb();
let world: World;
beforeEach(async () => {
  await resetDb(db);
  world = await buildWorld(db);
});
afterAll(() => db.$disconnect());

const TOKEN = 'm'.repeat(24);

describe('health probes', () => {
  it('live says the process is up and never touches the database; ready checks the database', async () => {
    const { app } = makeApp(db);
    expect((await request(app).get('/api/health/live')).body).toEqual({ status: 'ok' });
    expect((await request(app).get('/api/health/ready')).body).toEqual({ status: 'ok' });
    expect((await request(app).get('/api/health')).body).toEqual({ status: 'ok' }); // the original, unchanged
  });

  it('with the database gone: live still passes, ready and health fail with 503 and no details', async () => {
    const broken = {
      $queryRaw: async () => {
        throw new Error('connect ECONNREFUSED 10.0.0.5:5432');
      },
    } as never;
    const app = createApp({ config: testConfig(), logger: pino({ level: 'silent' }), db: broken });
    expect((await request(app).get('/api/health/live')).status).toBe(200);
    for (const path of ['/api/health/ready', '/api/health']) {
      const res = await request(app).get(path);
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ status: 'unavailable' });
      expect(res.text).not.toMatch(/ECONN|10\.0\.0\.5/);
    }
  });
});

describe('GET /metrics', () => {
  it('is off unless a token is configured', async () => {
    const { app } = makeApp(db);
    expect((await request(app).get('/api/metrics')).status).toBe(404);
    expect(
      (await request(app).get('/api/metrics').set('Authorization', `Bearer ${TOKEN}`)).status,
    ).toBe(404);
  });

  it('needs that token, and says nothing about which part was wrong', async () => {
    const { app } = makeApp(db, { METRICS_TOKEN: TOKEN });
    const none = await request(app).get('/api/metrics');
    const wrong = await request(app).get('/api/metrics').set('Authorization', 'Bearer nope');
    const basic = await request(app).get('/api/metrics').set('Authorization', `Basic ${TOKEN}`);
    for (const r of [none, wrong, basic]) expect(r.status).toBe(401);
    expect(none.body).toEqual(wrong.body);
    // a session cookie is not a metrics credential
    expect(
      (await request(app).get('/api/metrics').set('Cookie', cookieFor(world.users.admin.id)))
        .status,
    ).toBe(401);
  });

  it('serves Prometheus text with process, request and rate-limit/auth counters', async () => {
    const { app } = makeApp(db, { METRICS_TOKEN: TOKEN });
    await request(app).get('/api/questions').set('Cookie', cookieFor(world.users.authorA.id));
    await request(app).get('/api/questions').set('Cookie', cookieFor(world.users.authorA.id));
    await request(app).get('/api/auth/me'); // 401
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@test.dev', password: 'wrong-wrong' });
    const res = await request(app).get('/api/metrics').set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/plain/);
    expect(res.headers['cache-control']).toMatch(/no-store/);
    expect(res.text).toMatch(/^process_cpu_user_seconds_total /m);
    expect(res.text).toMatch(
      /http_requests_total\{[^}]*method="GET"[^}]*route="\/api\/questions"[^}]*status="200"[^}]*\} 2/,
    );
    expect(res.text).toMatch(/http_request_duration_seconds_bucket\{[^}]*route="\/api\/questions"/);
    expect(res.text).toMatch(
      /http_requests_total\{[^}]*route="\/api\/auth\/me"[^}]*status="401"[^}]*\} 1/,
    );
    expect(res.text).toMatch(/auth_failures_total\{route="\/api\/auth\/login"\} 1/);
  });

  it('labels by route pattern, so ids and query strings never create new series or leak data', async () => {
    const { app } = makeApp(db, { METRICS_TOKEN: TOKEN });
    const id = '11111111-1111-4111-8111-111111111111';
    await request(app).get(`/api/questions/${id}`).set('Cookie', cookieFor(world.users.admin.id));
    await request(app)
      .get('/api/questions?q=secret-search-term')
      .set('Cookie', cookieFor(world.users.admin.id));
    await request(app).get('/api/no-such-thing-abc123');
    const text = (await request(app).get('/api/metrics').set('Authorization', `Bearer ${TOKEN}`))
      .text;
    expect(text).toContain('route="/api/questions/:id"');
    expect(text).not.toContain(id);
    expect(text).not.toContain('secret-search-term');
    expect(text).not.toContain('no-such-thing-abc123');
    expect(text).toContain('route="unmatched"');
  });

  it('counts rate-limited responses', async () => {
    const { app } = makeApp(db, { METRICS_TOKEN: TOKEN, RATE_LIMIT_OTHER_PER_MIN: '1' });
    const c = cookieFor(world.users.authorA.id);
    await request(app).get('/api/tags').set('Cookie', c);
    await request(app).get('/api/tags').set('Cookie', c);
    const text = (await request(app).get('/api/metrics').set('Authorization', `Bearer ${TOKEN}`))
      .text;
    expect(text).toMatch(/rate_limited_total\{route="\/api\/tags"\} 1/);
  });

  it('config: the token must be long enough', async () => {
    const { loadConfig } = await import('../src/config/env.js');
    const { testEnv } = await import('./helpers.js');
    expect(() => loadConfig({ ...testEnv, METRICS_TOKEN: 'short' })).toThrow(/METRICS_TOKEN/);
    expect(loadConfig({ ...testEnv, METRICS_TOKEN: TOKEN }).METRICS_TOKEN).toBe(TOKEN);
  });
});
