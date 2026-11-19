/** Operational safety: a runaway query is cancelled, and expired sessions are cleaned up. */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/env.js';
import { createDb } from '../src/db/prisma.js';
import { purgeExpiredTokens } from '../src/maintenance.js';
import { buildWorld, makeDb, resetDb, testEnv, type World } from './helpers.js';
import { testDatabaseUrl } from './testDb.js';

const db = makeDb();
let world: World;
beforeEach(async () => {
  await resetDb(db);
  world = await buildWorld(db);
});
afterAll(() => db.$disconnect());

describe('statement timeout', () => {
  it('a query that runs too long is cancelled by the database, quickly', async () => {
    const short = createDb(testDatabaseUrl(), { statementTimeoutMs: 300 });
    try {
      const started = Date.now();
      await expect(short.$queryRaw`SELECT pg_sleep(3)`).rejects.toThrow(/timeout|cancel/i);
      expect(Date.now() - started).toBeLessThan(2000);
      // the connection is still good afterwards
      expect(await short.$queryRaw`SELECT 1 AS ok`).toEqual([{ ok: 1 }]);
    } finally {
      await short.$disconnect();
    }
  });

  it('is applied to every pooled connection, not just the first', async () => {
    const short = createDb(testDatabaseUrl(), { statementTimeoutMs: 300 });
    try {
      const results = await Promise.allSettled(
        Array.from({ length: 4 }, () => short.$queryRaw`SELECT pg_sleep(2)`),
      );
      expect(results.every((r) => r.status === 'rejected')).toBe(true);
    } finally {
      await short.$disconnect();
    }
  });

  it('fast queries are unaffected, and the config has a default and refuses nonsense', async () => {
    const normal = createDb(testDatabaseUrl(), { statementTimeoutMs: 5000 });
    try {
      expect(await normal.$queryRaw`SELECT 1 AS ok FROM pg_sleep(0.05)`).toEqual([{ ok: 1 }]);
    } finally {
      await normal.$disconnect();
    }
    expect(loadConfig(testEnv).DB_STATEMENT_TIMEOUT_MS).toBe(15_000);
    expect(loadConfig({ ...testEnv, DB_STATEMENT_TIMEOUT_MS: '0' }).DB_STATEMENT_TIMEOUT_MS).toBe(
      0,
    );
    expect(() => loadConfig({ ...testEnv, DB_STATEMENT_TIMEOUT_MS: '-1' })).toThrow();
    expect(() => loadConfig({ ...testEnv, DB_STATEMENT_TIMEOUT_MS: 'soon' })).toThrow();
  });
});

describe('purging expired sessions', () => {
  const day = 24 * 3600 * 1000;
  const token = (over: Record<string, unknown>) =>
    db.refreshToken.create({
      data: {
        id: crypto.randomUUID(),
        userId: world.users.plain.id,
        familyId: crypto.randomUUID(),
        tokenHash: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 7 * day),
        ...over,
      },
    });

  it('removes tokens that expired more than a week ago, and revoked or used ones older than a month', async () => {
    const live = await token({});
    const recentlyExpired = await token({ expiresAt: new Date(Date.now() - 2 * day) });
    const longExpired = await token({ expiresAt: new Date(Date.now() - 10 * day) });
    const oldRevoked = await token({ revokedAt: new Date(Date.now() - 40 * day) });
    const recentRevoked = await token({ revokedAt: new Date(Date.now() - 2 * day) });
    const oldUsed = await token({ usedAt: new Date(Date.now() - 40 * day) });

    const removed = await purgeExpiredTokens(db);
    expect(removed).toBe(3);
    const left = (
      await db.refreshToken.findMany({
        where: {
          userId: world.users.plain.id,
          NOT: { tokenHash: { startsWith: 'test-session-' } },
        },
      })
    ).map((t) => t.id);
    expect(left.sort()).toEqual([live.id, recentlyExpired.id, recentRevoked.id].sort());
    expect(left).not.toContain(longExpired.id);
    expect(left).not.toContain(oldRevoked.id);
    expect(left).not.toContain(oldUsed.id);
  });

  it('never touches a session that is still alive (even an old one, if it has not expired)', async () => {
    const old = await token({ usedAt: new Date(Date.now() - 3 * day) }); // rotated 3 days ago, family still in use
    expect(await purgeExpiredTokens(db)).toBe(0);
    expect(await db.refreshToken.count({ where: { id: old.id } })).toBe(1);
  });
});
