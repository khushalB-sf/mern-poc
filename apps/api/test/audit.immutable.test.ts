/** The audit trail is append-only at the database, not just by convention in the code. */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildWorld, makeDb, resetDb, type World } from './helpers.js';

const db = makeDb();
let world: World;
beforeEach(async () => {
  await resetDb(db);
  world = await buildWorld(db);
});
afterAll(() => db.$disconnect());

const record = () =>
  db.auditEvent.create({
    data: { type: 'USER_UPDATED', actorId: world.users.admin.id, payload: { note: 'original' } },
  });

describe('audit_event is append-only', () => {
  it('new events can be added', async () => {
    const e = await record();
    expect((await db.auditEvent.findUniqueOrThrow({ where: { id: e.id } })).payload).toEqual({
      note: 'original',
    });
  });

  it('an event cannot be changed, through Prisma or raw SQL', async () => {
    const e = await record();
    await expect(
      db.auditEvent.update({ where: { id: e.id }, data: { payload: { note: 'edited' } } }),
    ).rejects.toThrow(/append-only/);
    await expect(
      db.$executeRaw`UPDATE audit_event SET type = 'USER_DELETED' WHERE id = ${e.id}::uuid`,
    ).rejects.toThrow(/append-only/);
    await expect(
      db.auditEvent.updateMany({ data: { actorId: world.users.plain.id } }),
    ).rejects.toThrow(/append-only/);
    expect((await db.auditEvent.findUniqueOrThrow({ where: { id: e.id } })).payload).toEqual({
      note: 'original',
    });
  });

  it('an event cannot be removed', async () => {
    const e = await record();
    await expect(db.auditEvent.delete({ where: { id: e.id } })).rejects.toThrow(/append-only/);
    await expect(db.$executeRaw`DELETE FROM audit_event`).rejects.toThrow(/append-only/);
    expect(await db.auditEvent.count()).toBe(1);
  });

  it('a transaction that tries it is rolled back whole', async () => {
    const e = await record();
    await expect(
      db.$transaction(async (tx) => {
        await tx.appUser.update({ where: { id: world.users.plain.id }, data: { name: 'changed' } });
        await tx.auditEvent.delete({ where: { id: e.id } });
      }),
    ).rejects.toThrow();
    expect((await db.appUser.findUniqueOrThrow({ where: { id: world.users.plain.id } })).name).toBe(
      'plain',
    );
  });

  it('test cleanup (TRUNCATE) is not blocked, so the suite can reset the database', async () => {
    await record();
    await resetDb(db);
    expect(await db.auditEvent.count()).toBe(0);
  });
});
