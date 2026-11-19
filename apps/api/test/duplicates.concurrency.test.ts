/** Duplicate detection: serialised against races, and applied when an existing question is edited. */
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  addQuestion,
  buildWorld,
  cookieFor,
  makeApp,
  makeDb,
  resetDb,
  type World,
} from './helpers.js';

const db = makeDb();
const { app } = makeApp(db);
let world: World;
beforeEach(async () => {
  await resetDb(db);
  world = await buildWorld(db);
});
afterAll(() => db.$disconnect());

const TEXT = 'How would you design a distributed rate limiter for an API gateway?';
const post = (u: { id: string }, body: object) =>
  request(app).post('/api/questions').set('Cookie', cookieFor(u.id)).send(body);
const patch = (u: { id: string }, id: string, body: object) =>
  request(app).patch(`/api/questions/${id}`).set('Cookie', cookieFor(u.id)).send(body);

// An author's own unreviewed questions are visible to them (and only them), so the check can see a double
// click or a retry. Other authors' unreviewed questions stay invisible, by design (no leak).
describe('the same question submitted twice at the same moment', () => {
  it('exactly one is saved; the other is told it is a duplicate', async () => {
    const [a, b] = await Promise.all([
      post(world.users.authorA, { text: TEXT }),
      post(world.users.authorA, { text: TEXT }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const loser = a.status === 409 ? a : b;
    expect(loser.body.error.code).toBe('DUPLICATE_SUSPECTED');
    expect(await db.question.count({ where: { text: TEXT } })).toBe(1);
  });

  it('the blocked attempt still leaves its audit row, and an override still works', async () => {
    await post(world.users.authorA, { text: TEXT }).expect(201);
    const blocked = await post(world.users.authorA, { text: TEXT });
    expect(blocked.status).toBe(409);
    expect(await db.auditEvent.count({ where: { type: 'DUPLICATE_REJECTED' } })).toBe(1);
    const forced = await post(world.users.authorA, { text: TEXT, confirmNotDuplicate: true });
    expect(forced.status).toBe(201);
    expect(await db.auditEvent.count({ where: { type: 'DUPLICATE_OVERRIDDEN' } })).toBe(1);
  });

  it('two admins adding the same question at once (both go live at once): one wins', async () => {
    const second = await db.appUser.create({
      data: { email: 'admin2@test.dev', name: 'admin2', role: 'ADMIN', passwordHash: 'x' },
    });
    const { ensureSession } = await import('./helpers.js');
    await ensureSession(db, second.id);
    const results = await Promise.all([
      post(world.users.admin, { text: TEXT }),
      post(second, { text: TEXT }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it('different questions at the same moment do not block each other', async () => {
    const results = await Promise.all([
      post(world.users.authorA, { text: 'Explain the CAP theorem with a real example.' }),
      post(world.users.authorB, {
        text: 'What is the difference between a mutex and a semaphore?',
      }),
    ]);
    expect(results.map((r) => r.status)).toEqual([201, 201]);
  });
});

describe('editing a question into a duplicate', () => {
  it('is caught, names the matches, and can be overridden on purpose (audited)', async () => {
    await addQuestion(db, world, { text: TEXT, authorId: world.users.authorB.id });
    const mine = await addQuestion(db, world, {
      text: 'A completely unrelated starter question',
      authorId: world.users.authorA.id,
    });
    const blocked = await patch(world.users.authorA, mine.id, { text: TEXT });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('DUPLICATE_SUSPECTED');
    expect(blocked.body.error.matches[0].text).toBe(TEXT);
    expect((await db.question.findUniqueOrThrow({ where: { id: mine.id } })).text).toContain(
      'unrelated',
    );
    expect(
      await db.auditEvent.count({
        where: { type: 'DUPLICATE_REJECTED', actorId: world.users.authorA.id },
      }),
    ).toBe(1);

    const forced = await patch(world.users.authorA, mine.id, {
      text: TEXT,
      confirmNotDuplicate: true,
    });
    expect(forced.status).toBe(200);
    expect(
      await db.auditEvent.count({ where: { type: 'DUPLICATE_OVERRIDDEN', questionId: mine.id } }),
    ).toBe(1);
  });

  it('a question never counts as a duplicate of itself, and notes or tags are not checked', async () => {
    const q = await addQuestion(db, world, { text: TEXT, authorId: world.users.authorA.id });
    expect(
      (await patch(world.users.authorA, q.id, { text: `${TEXT} Please be specific.` })).status,
    ).toBe(200);
    expect(
      (await patch(world.users.authorA, q.id, { answerNotes: 'Token bucket, sliding window.' }))
        .status,
    ).toBe(200);
  });

  it('never reveals a question the editor cannot see', async () => {
    await addQuestion(db, world, {
      text: TEXT,
      authorId: world.users.authorAcme.id,
      clientId: world.acme.id,
    });
    const mine = await addQuestion(db, world, {
      text: 'Something else entirely about queues',
      authorId: world.users.authorGlobex.id,
      clientId: world.globex.id,
    });
    const res = await patch(world.users.authorGlobex, mine.id, { text: TEXT });
    expect(res.status).toBe(200); // the Acme question is invisible to them, so it is not compared
    expect(res.body).not.toHaveProperty('error');
  });

  it('the override flag must be a boolean, and is not an edit by itself', async () => {
    const q = await addQuestion(db, world, {
      text: 'Original text of the question',
      authorId: world.users.authorA.id,
    });
    expect(
      (
        await patch(world.users.authorA, q.id, {
          text: 'New text of the question',
          confirmNotDuplicate: 'yes',
        })
      ).status,
    ).toBe(400);
    expect((await patch(world.users.authorA, q.id, { confirmNotDuplicate: true })).status).toBe(
      400,
    );
  });
});
