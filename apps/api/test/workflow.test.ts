/** The reviewer's queue, "my questions", authors withdrawing their own questions, and notifications. */
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

type Method = 'get' | 'post' | 'delete' | 'patch';
const as = (u: { id: string }, method: Method, path: string, body?: object) =>
  request(app)[method](path).set('Cookie', cookieFor(u.id)).send(body);
const summary = async (u: { id: string }) => (await as(u, 'get', '/api/questions/summary')).body;

describe('GET /questions/summary', () => {
  it('a reviewer sees how many pending questions they could review, within their departments, not their own', async () => {
    const { users, acme, globex } = world;
    await addQuestion(db, world, {
      text: 'Pending in Acme',
      authorId: users.authorAcme.id,
      clientId: acme.id,
      status: 'PENDING',
    });
    await addQuestion(db, world, {
      text: 'Pending global',
      authorId: users.authorA.id,
      status: 'PENDING',
    });
    await addQuestion(db, world, {
      text: 'Pending in Globex',
      authorId: users.authorGlobex.id,
      clientId: globex.id,
      status: 'PENDING',
    });
    await addQuestion(db, world, {
      text: 'Approved in Acme',
      authorId: users.authorAcme.id,
      clientId: acme.id,
    });
    await addQuestion(db, world, {
      text: 'Rejected in Acme',
      authorId: users.authorAcme.id,
      clientId: acme.id,
      status: 'REJECTED',
    });
    await addQuestion(db, world, {
      text: 'Reviewer own pending',
      authorId: users.reviewer.id,
      status: 'PENDING',
    });
    const deleted = await addQuestion(db, world, {
      text: 'Deleted pending',
      authorId: users.authorA.id,
      status: 'PENDING',
    });
    await db.question.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } });

    expect((await summary(users.reviewer)).toReview).toBe(2); // Acme + global; not Globex, not own, not deleted
    expect((await summary(users.reviewerNoGrant)).toReview).toBe(2); // global + the reviewer's own does not count
    expect((await summary(users.admin)).toReview).toBe(4); // every live pending question, own included
  });

  it('an author sees counts of their own questions by status', async () => {
    const { users, acme } = world;
    await addQuestion(db, world, {
      text: 'a',
      authorId: users.authorAcme.id,
      clientId: acme.id,
      status: 'PENDING',
    });
    await addQuestion(db, world, { text: 'b', authorId: users.authorAcme.id, status: 'PENDING' });
    await addQuestion(db, world, { text: 'c', authorId: users.authorAcme.id, status: 'REJECTED' });
    await addQuestion(db, world, { text: 'd', authorId: users.authorAcme.id });
    await addQuestion(db, world, { text: 'e', authorId: users.authorB.id, status: 'PENDING' });
    const s = await summary(users.authorAcme);
    expect(s.mine).toEqual({ pending: 2, rejected: 1, approved: 1 });
    expect(s.toReview).toBe(0);
  });

  it('only counts what the person may see: no grant, no count', async () => {
    const { users, acme } = world;
    await addQuestion(db, world, {
      text: 'secret pending',
      authorId: users.authorAcme.id,
      clientId: acme.id,
      status: 'PENDING',
    });
    expect((await summary(users.reviewerNoGrant)).toReview).toBe(0);
    // an author who authored it but lost the grant no longer sees it, so it is not counted for them either
    await db.departmentGrant.deleteMany({ where: { userId: users.authorAcme.id } });
    expect((await summary(users.authorAcme)).mine).toEqual({
      pending: 0,
      rejected: 0,
      approved: 0,
    });
  });

  it('is all zeros for a read-only user, needs sign-in, and is not mistaken for a question id', async () => {
    expect(await summary(world.users.plain)).toEqual({
      toReview: 0,
      mine: { pending: 0, rejected: 0, approved: 0 },
    });
    expect((await request(app).get('/api/questions/summary')).status).toBe(401);
  });
});

describe('GET /questions?mine=true', () => {
  it('returns only the questions you wrote, at any status, combined with the other filters', async () => {
    const { users } = world;
    await addQuestion(db, world, {
      text: 'Mine approved about queues',
      authorId: users.authorA.id,
    });
    await addQuestion(db, world, {
      text: 'Mine pending about caches',
      authorId: users.authorA.id,
      status: 'PENDING',
    });
    await addQuestion(db, world, { text: 'Theirs about queues', authorId: users.authorB.id });
    const all = await as(users.authorA, 'get', '/api/questions?mine=true');
    expect(all.body.items.map((i: { text: string }) => i.text).sort()).toEqual([
      'Mine approved about queues',
      'Mine pending about caches',
    ]);
    expect(all.body.page.total).toBe(2);
    expect(
      (await as(users.authorA, 'get', '/api/questions?mine=true&status=PENDING')).body.items,
    ).toHaveLength(1);
    expect(
      (await as(users.authorA, 'get', '/api/questions?mine=true&q=queues')).body.items,
    ).toHaveLength(1);
    expect((await as(users.plain, 'get', '/api/questions?mine=true')).body.items).toEqual([]);
  });

  it('never widens what you can see, and rejects anything but "true"', async () => {
    const { users, acme } = world;
    await addQuestion(db, world, {
      text: 'Acme only',
      authorId: users.authorAcme.id,
      clientId: acme.id,
    });
    await db.departmentGrant.deleteMany({ where: { userId: users.authorAcme.id } });
    expect((await as(users.authorAcme, 'get', '/api/questions?mine=true')).body.items).toEqual([]);
    for (const v of ['false', '1', 'yes', '']) {
      expect((await as(users.authorA, 'get', `/api/questions?mine=${v}`)).status, v).toBe(400);
    }
  });
});

describe('authors can withdraw their own unreviewed questions', () => {
  const del = (u: { id: string }, id: string) => as(u, 'delete', `/api/questions/${id}`);

  it("own pending and own rejected: yes. own approved, or anyone else's: no", async () => {
    const { users } = world;
    const pending = await addQuestion(db, world, {
      text: 'p',
      authorId: users.authorA.id,
      status: 'PENDING',
    });
    const rejected = await addQuestion(db, world, {
      text: 'r',
      authorId: users.authorA.id,
      status: 'REJECTED',
    });
    const approved = await addQuestion(db, world, { text: 'a', authorId: users.authorA.id });
    const theirs = await addQuestion(db, world, {
      text: 't',
      authorId: users.authorB.id,
      status: 'PENDING',
    });

    expect((await del(users.authorA, approved.id)).status).toBe(403);
    expect((await del(users.authorA, theirs.id)).status).toBe(404); // not visible to A at all
    expect((await del(users.authorA, pending.id)).status).toBe(204);
    expect((await del(users.authorA, rejected.id)).status).toBe(204);
    expect((await as(users.authorA, 'get', `/api/questions/${pending.id}`)).status).toBe(404);
    expect(
      await db.auditEvent.count({ where: { type: 'QUESTION_DELETED', actorId: users.authorA.id } }),
    ).toBe(2);
    // it is a soft delete: an admin can see and restore it
    expect((await as(users.admin, 'get', '/api/admin/deleted-questions')).body.items).toHaveLength(
      2,
    );
  });

  it('a visible question by someone else is a 403, and readers and reviewers cannot delete', async () => {
    const { users, acme } = world;
    const pending = await addQuestion(db, world, {
      text: 'Acme pending',
      authorId: users.authorAcme.id,
      clientId: acme.id,
      status: 'PENDING',
    });
    const approved = await addQuestion(db, world, {
      text: 'Acme approved',
      authorId: users.authorAcme.id,
      clientId: acme.id,
    });
    expect((await del(users.reviewer, pending.id)).status).toBe(403); // can see it, may not delete it
    expect((await del(users.plainAcme, approved.id)).status).toBe(403);
    expect((await del(users.plainAcme, pending.id)).status).toBe(404); // cannot even see it
    expect(await db.question.count({ where: { deletedAt: null } })).toBe(2);
  });

  it('an admin can still delete anything', async () => {
    const q = await addQuestion(db, world, { text: 'approved', authorId: world.users.authorA.id });
    expect((await del(world.users.admin, q.id)).status).toBe(204);
  });
});

describe('notifications', () => {
  const pendingQuestion = () =>
    addQuestion(db, world, {
      text: 'Please review me',
      authorId: world.users.authorAcme.id,
      clientId: world.acme.id,
      status: 'PENDING',
    });
  const review = (u: { id: string }, id: string, body: object) =>
    as(u, 'post', `/api/questions/${id}/review`, body);

  it('the author is told when their question is approved or rejected, and nobody else is', async () => {
    const a = await pendingQuestion();
    const b = await pendingQuestion();
    await review(world.users.reviewer, a.id, { decision: 'APPROVED' }).then((r) =>
      expect(r.status).toBe(200),
    );
    await review(world.users.reviewer, b.id, { decision: 'REJECTED', note: 'Too vague' }).then(
      (r) => expect(r.status).toBe(200),
    );

    const mine = await as(world.users.authorAcme, 'get', '/api/notifications');
    expect(mine.status).toBe(200);
    expect(mine.body.unreadCount).toBe(2);
    expect(mine.body.items.map((n: { type: string }) => n.type).sort()).toEqual([
      'QUESTION_APPROVED',
      'QUESTION_REJECTED',
    ]);
    expect(mine.body.items[0]).toMatchObject({
      readAt: null,
      question: { text: 'Please review me' },
    });
    expect((await as(world.users.authorB, 'get', '/api/notifications')).body).toEqual({
      items: [],
      unreadCount: 0,
    });
    expect((await as(world.users.reviewer, 'get', '/api/notifications')).body.unreadCount).toBe(0);
  });

  it('an admin overturning a decision notifies again; reviewing your own as admin notifies nobody', async () => {
    const q = await pendingQuestion();
    await review(world.users.reviewer, q.id, { decision: 'APPROVED' });
    await review(world.users.admin, q.id, { decision: 'REJECTED', note: 'On reflection, no' });
    expect((await as(world.users.authorAcme, 'get', '/api/notifications')).body.items).toHaveLength(
      2,
    );

    const own = await addQuestion(db, world, {
      text: 'Admin own',
      authorId: world.users.admin.id,
      status: 'PENDING',
    });
    await review(world.users.admin, own.id, { decision: 'APPROVED' });
    expect((await as(world.users.admin, 'get', '/api/notifications')).body.items).toEqual([]);
  });

  it('stores ids and the outcome, never question text; the text is looked up (through visibility) when read', async () => {
    const q = await pendingQuestion();
    await review(world.users.reviewer, q.id, { decision: 'APPROVED' });
    const row = await db.notification.findFirstOrThrow();
    expect(JSON.stringify(row)).not.toContain('Please review me');

    // the author is moved out of the department: they can no longer read that question, so neither its text
    await db.departmentGrant.deleteMany({ where: { userId: world.users.authorAcme.id } });
    const after = await as(world.users.authorAcme, 'get', '/api/notifications');
    expect(after.body.items).toHaveLength(1);
    expect(after.body.items[0].question).toBeNull();
    expect(JSON.stringify(after.body)).not.toContain('Please review me');
  });

  it('a deleted question leaves a notification without text', async () => {
    const q = await pendingQuestion();
    await review(world.users.reviewer, q.id, { decision: 'APPROVED' });
    await as(world.users.admin, 'delete', `/api/questions/${q.id}`);
    const res = await as(world.users.authorAcme, 'get', '/api/notifications');
    expect(res.body.items[0].question).toBeNull();
  });

  it("marking read: your own ids or all of them; someone else's ids do nothing and say nothing", async () => {
    const q = await pendingQuestion();
    await review(world.users.reviewer, q.id, { decision: 'APPROVED' });
    const r2 = await pendingQuestion();
    await review(world.users.reviewer, r2.id, { decision: 'APPROVED' });
    const list = (await as(world.users.authorAcme, 'get', '/api/notifications')).body.items;

    const theirs = await as(world.users.authorB, 'post', '/api/notifications/read', {
      ids: [list[0].id],
    });
    expect(theirs.status).toBe(204);
    expect((await as(world.users.authorAcme, 'get', '/api/notifications')).body.unreadCount).toBe(
      2,
    );

    await as(world.users.authorAcme, 'post', '/api/notifications/read', { ids: [list[0].id] }).then(
      (r) => expect(r.status).toBe(204),
    );
    expect((await as(world.users.authorAcme, 'get', '/api/notifications')).body.unreadCount).toBe(
      1,
    );
    await as(world.users.authorAcme, 'post', '/api/notifications/read', { all: true });
    const done = (await as(world.users.authorAcme, 'get', '/api/notifications')).body;
    expect(done.unreadCount).toBe(0);
    expect(done.items.every((n: { readAt: string | null }) => n.readAt)).toBe(true);
  });

  it('validates the body, needs sign-in, and never lists more than 50', async () => {
    expect((await request(app).get('/api/notifications')).status).toBe(401);
    for (const body of [
      {},
      { ids: 'x' },
      { ids: ['not-a-uuid'] },
      { all: false },
      { ids: [], all: true, extra: 1 },
    ]) {
      expect(
        (await as(world.users.authorAcme, 'post', '/api/notifications/read', body)).status,
        JSON.stringify(body),
      ).toBe(400);
    }
    await db.notification.createMany({
      data: Array.from({ length: 60 }, () => ({
        userId: world.users.authorAcme.id,
        type: 'QUESTION_APPROVED' as const,
        questionId: world.users.authorAcme.id,
      })),
    });
    const res = await as(world.users.authorAcme, 'get', '/api/notifications');
    expect(res.body.items).toHaveLength(50);
    expect(res.body.unreadCount).toBe(60);
  });
});
