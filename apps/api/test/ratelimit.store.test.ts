/** Limits can live in a shared store, so several API processes count together. */
import type { Store } from 'express-rate-limit';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { useRateLimitStore } from '../src/http/rateLimit.js';
import { buildWorld, cookieFor, makeApp, makeDb, resetDb, type World } from './helpers.js';

const db = makeDb();
let world: World;
beforeAll(async () => {
  await resetDb(db);
  world = await buildWorld(db);
});
afterEach(() => useRateLimitStore(undefined));
afterAll(() => db.$disconnect());

/** The smallest possible shared store: one Map that two apps both use. */
function mapStore(shared: Map<string, number>): (prefix: string) => Store {
  return (prefix) => ({
    prefix,
    async increment(key) {
      const n = (shared.get(prefix + key) ?? 0) + 1;
      shared.set(prefix + key, n);
      return { totalHits: n, resetTime: new Date(Date.now() + 60_000) };
    },
    async decrement() {},
    async resetKey() {},
  });
}

describe('shared rate-limit store', () => {
  it('two app instances sharing a store share the allowance', async () => {
    const shared = new Map<string, number>();
    useRateLimitStore(mapStore(shared));
    const env = { RATE_LIMIT_OTHER_PER_MIN: '2' };
    const a = makeApp(db, env).app;
    const b = makeApp(db, env).app;
    const u = world.users.authorA;
    const get = (app: typeof a) => request(app).get('/api/tags').set('Cookie', cookieFor(u.id));
    expect((await get(a)).status).toBe(200);
    expect((await get(b)).status).toBe(200);
    expect((await get(a)).status).toBe(429); // the second instance's request counted too
    expect(shared.size).toBeGreaterThan(0);
  });

  it('without a store each instance counts alone (the default)', async () => {
    const env = { RATE_LIMIT_OTHER_PER_MIN: '1' };
    const a = makeApp(db, env).app;
    const b = makeApp(db, env).app;
    const u = world.users.authorA;
    const get = (app: typeof a) => request(app).get('/api/tags').set('Cookie', cookieFor(u.id));
    expect((await get(a)).status).toBe(200);
    expect((await get(b)).status).toBe(200);
  });
});

// Real Redis, only when one is provided: REDIS_TEST_URL=redis://localhost:16379 npm test
describe.skipIf(!process.env.REDIS_TEST_URL)('Redis store', () => {
  it('two app instances share the allowance through Redis', async () => {
    const { redisStoreFactory } = await import('../src/http/redisStore.js');
    const { client, factory } = redisStoreFactory(process.env.REDIS_TEST_URL!);
    await client.flushdb();
    useRateLimitStore(factory);
    const env = { RATE_LIMIT_OTHER_PER_MIN: '2' };
    const a = makeApp(db, env).app;
    const b = makeApp(db, env).app;
    const u = world.users.authorB;
    const get = (app: typeof a) => request(app).get('/api/tags').set('Cookie', cookieFor(u.id));
    expect((await get(a)).status).toBe(200);
    expect((await get(b)).status).toBe(200);
    expect((await get(a)).status).toBe(429);

    // Redis goes away: requests still succeed (fail open) instead of erroring.
    await new Promise((r) => setTimeout(r, 50));
    client.disconnect();
    const other = world.users.authorA;
    const res = await request(a).get('/api/tags').set('Cookie', cookieFor(other.id));
    expect(res.status).toBe(200);
  });
});
