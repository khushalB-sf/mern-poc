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
let pending: { id: string }; // global, by authorA
let acmePending: { id: string }; // Acme, by authorAcme

beforeEach(async () => {
  await resetDb(db);
  world = await buildWorld(db);
  pending = await addQuestion(db, world, {
    text: 'What is the quokkawhisper pattern?',
    authorId: world.users.authorA.id,
    status: 'PENDING',
  });
  acmePending = await addQuestion(db, world, {
    text: 'Acme zebrafish rollout?',
    authorId: world.users.authorAcme.id,
    clientId: world.acme.id,
    status: 'PENDING',
  });
});
afterAll(() => db.$disconnect());

const as = (u: { id: string }) => cookieFor(u.id);
const review = (u: { id: string }, id: string, body: unknown) =>
  request(app)
    .post(`/api/questions/${id}/review`)
    .set('Cookie', as(u))
    .send(body as object);
const get = (u: { id: string }, path: string) => request(app).get(path).set('Cookie', as(u));

describe('POST /questions/:id/review', () => {
  it('a reviewer approves: status, note, reviewer and audit row are recorded', async () => {
    const res = await review(world.users.reviewer, pending.id, {
      decision: 'APPROVED',
      note: '  Clear and useful  ',
    });
    expect(res.status).toBe(200);
    expect(res.body.question).toMatchObject({
      status: 'APPROVED',
      review: { note: 'Clear and useful', reviewer: { id: world.users.reviewer.id } },
    });
    const events = await db.auditEvent.findMany({ where: { type: 'QUESTION_APPROVED' } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ actorId: world.users.reviewer.id, questionId: pending.id });
  });

  it('approving needs no note; rejecting does (blank is refused, nothing changes)', async () => {
    expect((await review(world.users.reviewer, pending.id, { decision: 'APPROVED' })).status).toBe(
      200,
    );
    const other = await addQuestion(db, world, {
      text: 'Another pending one',
      authorId: world.users.authorA.id,
      status: 'PENDING',
    });
    for (const body of [{ decision: 'REJECTED' }, { decision: 'REJECTED', note: '   ' }]) {
      expect((await review(world.users.reviewer, other.id, body)).status).toBe(400);
    }
    expect((await db.question.findUnique({ where: { id: other.id } }))!.status).toBe('PENDING');
    const ok = await review(world.users.reviewer, other.id, {
      decision: 'REJECTED',
      note: 'Too vague',
    });
    expect(ok.body.question).toMatchObject({ status: 'REJECTED', review: { note: 'Too vague' } });
  });

  it.each([
    ['empty body', {}],
    ['bad decision', { decision: 'PENDING' }],
    ['unknown field', { decision: 'APPROVED', status: 'APPROVED' }],
    ['note too long', { decision: 'REJECTED', note: 'x'.repeat(2001) }],
  ])('SEC-01: %s is a 400', async (_n, body) => {
    expect((await review(world.users.reviewer, pending.id, body)).status).toBe(400);
  });

  // [who, question, expected]: visibility first (404), then role (403)
  const matrix: [keyof World['users'], 'global' | 'acme', number][] = [
    ['reviewer', 'global', 200],
    ['reviewerNoGrant', 'global', 200],
    ['reviewerNoGrant', 'acme', 404], // not granted: invisible
    ['plain', 'global', 404], // pending questions are invisible to users
    ['authorB', 'global', 404], // ...and to other authors
    ['authorA', 'global', 403], // own question: visible, but not a reviewer
    ['admin', 'global', 200], // an admin reviews anything
  ];
  it.each(matrix)('%s on a %s pending question -> %i', async (who, which, status) => {
    const id = which === 'acme' ? acmePending.id : pending.id;
    const res = await review(world.users[who], id, { decision: 'APPROVED' });
    expect(res.status).toBe(status);
    const row = await db.question.findUnique({ where: { id } });
    expect(row!.status).toBe(status === 200 ? 'APPROVED' : 'PENDING');
  });

  it('IMP-02: an invisible question is the same 404 as a random id', async () => {
    const hidden = await review(world.users.reviewerNoGrant, acmePending.id, {
      decision: 'APPROVED',
    });
    const missing = await review(
      world.users.reviewerNoGrant,
      '11111111-1111-4111-8111-111111111111',
      {
        decision: 'APPROVED',
      },
    );
    expect(hidden.status).toBe(404);
    expect(hidden.body).toEqual(missing.body);
  });

  it('a reviewer cannot review their own question (roles can change after writing)', async () => {
    const own = await addQuestion(db, world, {
      text: 'Written before the promotion',
      authorId: world.users.reviewer.id,
      status: 'PENDING',
    });
    expect((await review(world.users.reviewer, own.id, { decision: 'APPROVED' })).status).toBe(403);
  });

  it('a decided question is a 409 and keeps the first decision', async () => {
    await review(world.users.reviewer, pending.id, { decision: 'APPROVED', note: 'first' });
    const again = await review(world.users.reviewerNoGrant, pending.id, {
      decision: 'REJECTED',
      note: 'second',
    });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('NOT_PENDING');
    expect((await db.question.findUnique({ where: { id: pending.id } }))!.reviewNote).toBe('first');
  });

  it('two reviewers deciding at once: exactly one wins', async () => {
    const [a, b] = await Promise.all([
      review(world.users.reviewer, pending.id, { decision: 'APPROVED' }),
      review(world.users.reviewerNoGrant, pending.id, { decision: 'REJECTED', note: 'no' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(
      await db.auditEvent.count({
        where: { type: { in: ['QUESTION_APPROVED', 'QUESTION_REJECTED'] } },
      }),
    ).toBe(1);
  });

  it('a decision is not an edit: updatedAt is untouched', async () => {
    const before = (await db.question.findUnique({ where: { id: pending.id } }))!.updatedAt;
    await review(world.users.reviewer, pending.id, { decision: 'APPROVED' });
    expect((await db.question.findUnique({ where: { id: pending.id } }))!.updatedAt).toEqual(
      before,
    );
  });

  it('the author sees the rejection note, edits, and the question returns to PENDING', async () => {
    await review(world.users.reviewer, pending.id, { decision: 'REJECTED', note: 'Add detail' });
    const seen = await get(world.users.authorA, `/api/questions/${pending.id}`);
    expect(seen.body.question).toMatchObject({
      status: 'REJECTED',
      review: { note: 'Add detail' },
    });

    const edit = await request(app)
      .patch(`/api/questions/${pending.id}`)
      .set('Cookie', as(world.users.authorA))
      .send({ answerNotes: 'More detail now' });
    expect(edit.body.question).toMatchObject({ status: 'PENDING', review: null });

    const hist = await get(world.users.authorA, `/api/questions/${pending.id}/history`);
    expect(hist.body.items.map((i: { type: string }) => i.type)).toEqual([
      'QUESTION_REJECTED',
      'QUESTION_UPDATED',
    ]);
    expect(hist.body.items[0].note).toBe('Add detail');
  });
});

describe('status-aware visibility', () => {
  let approved: { id: string };
  let rejected: { id: string };
  beforeEach(async () => {
    approved = await addQuestion(db, world, {
      text: 'Approved global one',
      authorId: world.users.authorB.id,
    });
    rejected = await addQuestion(db, world, {
      text: 'Rejected global one',
      authorId: world.users.authorB.id,
      status: 'REJECTED',
    });
  });

  const ids = async (u: { id: string }, qs = '') =>
    ((await get(u, `/api/questions?limit=50${qs}`)).body.items as { id: string }[])
      .map((i) => i.id)
      .sort();

  it('USER sees approved only (within department access)', async () => {
    expect(await ids(world.users.plain)).toEqual([approved.id]);
    expect(await ids(world.users.plainAcme)).toEqual([approved.id]);
  });

  it("AUTHOR sees approved plus their own at any status, never other authors' unfinished work", async () => {
    expect(await ids(world.users.authorA)).toEqual([approved.id, pending.id].sort());
    expect(await ids(world.users.authorB)).toEqual([approved.id, rejected.id].sort());
  });

  it('REVIEWER sees every status within their departments', async () => {
    expect(await ids(world.users.reviewer)).toEqual(
      [approved.id, pending.id, rejected.id, acmePending.id].sort(),
    );
    expect(await ids(world.users.reviewerNoGrant)).toEqual(
      [approved.id, pending.id, rejected.id].sort(),
    );
  });

  it('ADMIN sees everything, including departments they hold no grant for', async () => {
    expect(await ids(world.users.admin)).toEqual(
      [approved.id, pending.id, rejected.id, acmePending.id].sort(),
    );
    expect((await get(world.users.admin, `/api/questions/${acmePending.id}`)).status).toBe(200);
  });

  it('the status filter builds a reviewer queue', async () => {
    expect(await ids(world.users.reviewer, '&status=PENDING')).toEqual(
      [pending.id, acmePending.id].sort(),
    );
    expect(await ids(world.users.reviewer, '&status=APPROVED')).toEqual([approved.id]);
  });

  it('SEC-04: a user searching text that exists only in a PENDING question gets a genuine zero-match', async () => {
    const shape = (r: request.Response) => ({ status: r.status, body: r.body });
    for (const u of [world.users.plain, world.users.authorB]) {
      const hidden = await get(u, '/api/questions?q=quokkawhisper');
      const none = await get(u, '/api/questions?q=qqqqnomatch');
      expect(shape(hidden)).toEqual(shape(none));
      const byStatus = await get(u, '/api/questions?status=PENDING');
      expect(byStatus.body.items).toEqual([]);
      expect(byStatus.body.page.total).toBe(0);
    }
    // positive control
    expect((await get(world.users.authorA, '/api/questions?q=quokkawhisper')).body.page.total).toBe(
      1,
    );
    expect(
      (await get(world.users.reviewer, '/api/questions?q=quokkawhisper')).body.page.total,
    ).toBe(1);
  });

  it('IMP-02: an unfinished question by id is the same 404 as a random id, history included', async () => {
    for (const path of [`/api/questions/${pending.id}`, `/api/questions/${pending.id}/history`]) {
      const hidden = await get(world.users.plain, path);
      const missing = await get(
        world.users.plain,
        path.replace(pending.id, '11111111-1111-4111-8111-111111111111'),
      );
      expect(hidden.status).toBe(404);
      expect(hidden.body).toEqual(missing.body);
    }
  });

  it("a duplicate of someone else's pending question is not flagged (it is invisible to the submitter)", async () => {
    const res = await request(app)
      .post('/api/questions')
      .set('Cookie', as(world.users.authorB))
      .send({ text: 'What is the quokkawhisper pattern?' });
    expect(res.status).toBe(201);
  });
});
