import { Writable } from 'node:stream';
import argon2 from 'argon2';
import type { Express } from 'express';
import pino from 'pino';
import { loadConfig, type Config } from '../src/config/env.js';
import { createDb, type Db } from '../src/db/prisma.js';
import { createApp } from '../src/http/app.js';
import { ACCESS_COOKIE } from '../src/modules/auth/cookies.js';
import { signAccess } from '../src/modules/auth/tokens.js';
import { testDatabaseUrl } from './testDb.js';

export const PASSWORD = 'Test-Passw0rd!';

export const testEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: testDatabaseUrl(),
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  RATE_LIMIT_LOGIN_PER_MIN: '1000',
};

export const testConfig = (over: Record<string, string> = {}): Config =>
  loadConfig({ ...testEnv, ...over });

/** Logger that captures output so tests can assert on what is (not) logged. */
export function captureLogger() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(String(chunk));
      cb();
    },
  });
  return { logger: pino({ level: 'info' }, stream), lines };
}

export const makeDb = () => createDb(testDatabaseUrl());

export function makeApp(
  db: Db,
  over: Record<string, string> = {},
): { app: Express; lines: string[] } {
  const { logger, lines } = captureLogger();
  return { app: createApp({ config: testConfig(over), logger, db }), lines };
}

/** Empties every table except Prisma's bookkeeping. Refuses to run against a non-test database. */
export async function resetDb(db: Db) {
  const rows = await db.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
  const name = rows[0]?.name;
  if (!name?.endsWith('_test')) throw new Error(`refusing to truncate non-test database "${name}"`);
  await db.$executeRaw`TRUNCATE audit_event, question_tag, question, tag, tag_category, client_grant, client, refresh_token, app_user CASCADE`;
}

// Cheap Argon2 parameters: fixtures need valid hashes, not strong ones.
const fixtureHash = argon2.hash(PASSWORD, {
  type: argon2.argon2id,
  memoryCost: 1024,
  timeCost: 1,
  parallelism: 1,
});

/** Cookie header value that authenticates as `userId`, minted directly (no login round trip). */
export const cookieFor = (userId: string, secret = testEnv.JWT_ACCESS_SECRET) =>
  `${ACCESS_COOKIE}=${signAccess(secret, userId)}`;

/**
 * Standard cast: two clients, users in every role, tags in three categories.
 * Names say what they can do, e.g. authorAcme = AUTHOR granted for Acme.
 */
export async function buildWorld(db: Db) {
  const passwordHash = await fixtureHash;
  const [acme, globex] = await Promise.all([
    db.client.create({ data: { name: 'Acme' } }),
    db.client.create({ data: { name: 'Globex' } }),
  ]);
  const user = (key: string, role: 'USER' | 'AUTHOR' | 'REVIEWER', grants: string[] = []) =>
    db.appUser.create({
      data: {
        email: `${key.toLowerCase()}@test.dev`,
        name: key,
        role,
        passwordHash,
        grants: { create: grants.map((clientId) => ({ clientId })) },
      },
    });
  const users = {
    plain: await user('plain', 'USER'),
    plainAcme: await user('plainAcme', 'USER', [acme.id]),
    authorA: await user('authorA', 'AUTHOR'),
    authorB: await user('authorB', 'AUTHOR'),
    authorAcme: await user('authorAcme', 'AUTHOR', [acme.id]),
    authorGlobex: await user('authorGlobex', 'AUTHOR', [globex.id]),
    reviewer: await user('reviewer', 'REVIEWER', [acme.id]),
    reviewerNoGrant: await user('reviewerNoGrant', 'REVIEWER'),
  };

  const tags = new Map<string, string>(); // "category:value" -> id
  const categories = {
    technology: ['react', 'nodejs'],
    seniority: ['mid', 'senior'],
    type: ['technical'],
  };
  for (const [slug, values] of Object.entries(categories)) {
    const cat = await db.tagCategory.create({ data: { slug, name: slug } });
    for (const value of values) {
      const t = await db.tag.create({ data: { categoryId: cat.id, value, label: value } });
      tags.set(`${slug}:${value}`, t.id);
    }
  }
  return { acme, globex, users, tags };
}

export type World = Awaited<ReturnType<typeof buildWorld>>;

export async function addQuestion(
  db: Db,
  world: World,
  q: { text: string; notes?: string; authorId: string; clientId?: string | null; tags?: string[] },
) {
  return db.question.create({
    data: {
      text: q.text,
      answerNotes: q.notes ?? '',
      authorId: q.authorId,
      clientId: q.clientId ?? null,
      tags: { create: (q.tags ?? []).map((t) => ({ tagId: world.tags.get(t)! })) },
    },
  });
}

const UUID = '11111111-1111-4111-8111-111111111111';

/** Every route the app registers. A test fails if a route is added and not listed here (route sweep). */
export const MANIFEST: [method: 'get' | 'post' | 'patch', path: string][] = [
  ['get', '/api/health'],
  ['get', '/api/openapi.json'],
  ['get', '/api/docs'],
  ['get', '/api/docs/init.js'],
  ['post', '/api/auth/login'],
  ['post', '/api/auth/refresh'],
  ['post', '/api/auth/logout'],
  ['get', '/api/auth/me'],
  ['get', '/api/tags'],
  ['get', '/api/clients'],
  ['get', '/api/questions'],
  ['get', `/api/questions/${UUID}`],
  ['get', `/api/questions/${UUID}/history`],
  ['post', '/api/questions'],
  ['patch', `/api/questions/${UUID}`],
];
