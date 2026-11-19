/** The first admin of a real deployment: created from environment variables, never from a published demo password. */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import pino from 'pino';
import { loadConfig } from '../src/config/env.js';
import { bootstrapAdmin } from '../src/seed/bootstrap.js';
import { verifyPassword } from '../src/modules/auth/password.js';
import { buildWorld, makeDb, resetDb, testEnv } from './helpers.js';

const db = makeDb();
const log = pino({ level: 'silent' });
const GOOD = 'correct-horse-battery-staple';
beforeEach(async () => {
  await resetDb(db);
});
afterAll(() => db.$disconnect());

describe('bootstrapAdmin', () => {
  it('creates the first admin, who must choose their own password at first sign-in', async () => {
    const r = await bootstrapAdmin(db, log, { email: 'Boss@Example.com', password: GOOD });
    expect(r).toBe('created');
    const u = await db.appUser.findUniqueOrThrow({ where: { email: 'boss@example.com' } });
    expect(u).toMatchObject({ role: 'ADMIN', active: true, mustChangePassword: true });
    expect(await verifyPassword(u.passwordHash, GOOD)).toBe(true);
    expect(await db.auditEvent.count({ where: { type: 'USER_CREATED' } })).toBe(1);
  });

  it('does nothing when an active admin already exists, so it is safe on every start', async () => {
    await bootstrapAdmin(db, log, { email: 'boss@example.com', password: GOOD });
    expect(await bootstrapAdmin(db, log, { email: 'other@example.com', password: GOOD })).toBe(
      'skipped',
    );
    expect(await db.appUser.count()).toBe(1);
  });

  it('creates one again if every admin has been deactivated or deleted (a way back in)', async () => {
    const world = await buildWorld(db);
    await db.appUser.update({ where: { id: world.users.admin.id }, data: { active: false } });
    expect(await bootstrapAdmin(db, log, { email: 'rescue@example.com', password: GOOD })).toBe(
      'created',
    );
  });

  it("refuses a weak password, and an email that is already someone else's", async () => {
    await expect(
      bootstrapAdmin(db, log, { email: 'boss@example.com', password: 'password1234' }),
    ).rejects.toThrow(/common|12/);
    await expect(
      bootstrapAdmin(db, log, { email: 'boss@example.com', password: 'short' }),
    ).rejects.toThrow(/12/);
    const world = await buildWorld(db);
    await db.appUser.update({ where: { id: world.users.admin.id }, data: { active: false } }); // no active admin
    await expect(
      bootstrapAdmin(db, log, { email: 'plain@test.dev', password: GOOD }),
    ).rejects.toThrow(/already/i);
  });

  it('never writes the password anywhere it can be read back', async () => {
    await bootstrapAdmin(db, log, { email: 'boss@example.com', password: GOOD });
    expect(JSON.stringify(await db.auditEvent.findMany())).not.toContain(GOOD);
  });
});

describe('config', () => {
  it('ADMIN_EMAIL and ADMIN_PASSWORD come as a pair', () => {
    expect(() => loadConfig({ ...testEnv, ADMIN_EMAIL: 'a@b.co' })).toThrow(/ADMIN_PASSWORD/);
    expect(() => loadConfig({ ...testEnv, ADMIN_PASSWORD: GOOD })).toThrow(/ADMIN_EMAIL/);
    expect(
      loadConfig({ ...testEnv, ADMIN_EMAIL: 'a@b.co', ADMIN_PASSWORD: GOOD }).ADMIN_EMAIL,
    ).toBe('a@b.co');
    expect(loadConfig(testEnv).ADMIN_EMAIL).toBeUndefined();
  });
  it('the password needs 12 characters', () => {
    expect(() =>
      loadConfig({ ...testEnv, ADMIN_EMAIL: 'a@b.co', ADMIN_PASSWORD: 'short' }),
    ).toThrow(/ADMIN_PASSWORD/);
  });
});
