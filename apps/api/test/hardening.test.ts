import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Router } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  MANIFEST,
  buildWorld,
  cookieFor,
  makeApp,
  makeDb,
  resetDb,
  type World,
} from './helpers.js';

const db = makeDb();
let world: World;
beforeAll(async () => {
  await resetDb(db);
  world = await buildWorld(db);
});
afterAll(() => db.$disconnect());

// ---------------------------------------------------------------- architecture guard (ADR-005)
const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const ALLOWED = new Set(['modules/questions/question.repo.ts']);
const SKIP_DIRS = ['generated', 'seed']; // generated client; the seed writes fixtures directly

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });

// Model access (db.question.*, tx.questionTag.*) or raw SQL naming the question tables.
const FORBIDDEN =
  /\.(question|questionTag)\s*\.\s*\w+|\b(FROM|JOIN|INTO|UPDATE|TABLE)\s+"?(question|question_tag)"?\b/i;

export const violations = (rel: string, code: string) =>
  ALLOWED.has(rel) || SKIP_DIRS.some((d) => rel.startsWith(`${d}/`)) || !FORBIDDEN.test(code)
    ? []
    : [rel];

describe('architecture guard: only question.repo.ts touches the question tables', () => {
  it('no other source file references them', () => {
    const bad = files(SRC).flatMap((f) => violations(relative(SRC, f), readFileSync(f, 'utf8')));
    expect(bad).toEqual([]);
  });

  it('the guard itself bites (it flags offending code elsewhere)', () => {
    expect(violations('modules/x.ts', 'await db.question.findMany()')).toEqual(['modules/x.ts']);
    expect(violations('modules/x.ts', 'tx.questionTag.create({})')).toEqual(['modules/x.ts']);
    expect(violations('modules/x.ts', 'db.$queryRaw`SELECT * FROM question q`')).toEqual([
      'modules/x.ts',
    ]);
    expect(violations('modules/x.ts', 'db.$queryRaw`... JOIN "question_tag" qt`')).toEqual([
      'modules/x.ts',
    ]);
    expect(violations('modules/questions/question.repo.ts', 'db.question.findMany()')).toEqual([]);
    expect(violations('modules/x.ts', 'db.appUser.findMany() // audit_event.question_id')).toEqual(
      [],
    );
  });

  it('unsafe raw SQL helpers are never used', () => {
    const bad = files(SRC).filter(
      (f) =>
        !f.includes('/generated/') && /\$(query|execute)RawUnsafe/.test(readFileSync(f, 'utf8')),
    );
    expect(bad).toEqual([]);
  });
});

// ---------------------------------------------------------------- route sweep (SEC-02)
const PUBLIC = new Set([
  'GET /api/health',
  'POST /api/auth/login',
  'POST /api/auth/refresh',
  'POST /api/auth/logout',
  // API docs describe the contract only and carry no data.
  'GET /api/openapi.json',
  'GET /api/docs',
  'GET /api/docs/init.js',
]);

/** Counts every (route, method) registered anywhere under the router, however deeply nested. */
function countRoutes(router: Router): number {
  type Layer = { route?: { methods: Record<string, boolean> }; handle?: { stack?: Layer[] } };
  const walk = (stack: Layer[]): number =>
    stack.reduce(
      (n, l) =>
        n +
        (l.route ? Object.values(l.route.methods).filter(Boolean).length : 0) +
        (l.handle?.stack ? walk(l.handle.stack) : 0),
      0,
    );
  return walk((router as unknown as { stack: Layer[] }).stack);
}

describe('SEC-02: there is no anonymous path', () => {
  const { app } = makeApp(db);

  it('the manifest lists every registered route (add new routes here so they get swept)', () => {
    const registered = countRoutes((app as unknown as { router: Router }).router);
    expect(MANIFEST).toHaveLength(registered);
  });

  it.each(MANIFEST.filter(([m, p]) => !PUBLIC.has(`${m.toUpperCase()} ${p}`)))(
    '%s %s requires authentication',
    async (method, path) => {
      const res = await request(app)[method](path).send({});
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    },
  );

  it('and each authenticated route works with a valid cookie (the 401s are about auth, not a dead route)', async () => {
    const cookie = cookieFor(world.users.reviewer.id);
    for (const [method, path] of [
      ['get', '/api/auth/me'],
      ['get', '/api/tags'],
      ['get', '/api/clients'],
      ['get', '/api/questions'],
    ] as const) {
      expect((await request(app)[method](path).set('Cookie', cookie)).status).toBe(200);
    }
  });
});

// ---------------------------------------------------------------- rate limiting
describe('rate limiting on the questions API', () => {
  it('limits per user, not globally, and adds no RateLimit headers (so SEC-04 bodies/headers stay identical)', async () => {
    const { app } = makeApp(db, { RATE_LIMIT_API_PER_MIN: '3' });
    const get = (u: { id: string }) =>
      request(app).get('/api/questions').set('Cookie', cookieFor(u.id));
    const a = world.users.authorA;
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await get(a)).status);
    expect(statuses).toEqual([200, 200, 200, 429]);

    const limited = await get(a);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(limited.headers).not.toHaveProperty('ratelimit');
    expect(limited.headers).not.toHaveProperty('ratelimit-remaining');

    const ok = await get(world.users.authorB); // different user is unaffected
    expect(ok.status).toBe(200);
    expect(ok.headers).not.toHaveProperty('ratelimit');
  });
});
