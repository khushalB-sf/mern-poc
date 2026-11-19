/** Two people editing the same question: the second save must not silently overwrite the first. */
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

const patch = (id: string, body: object, as = world.users.authorA) =>
  request(app).patch(`/api/questions/${id}`).set('Cookie', cookieFor(as.id)).send(body);
const fetchQ = async (id: string) =>
  (await request(app).get(`/api/questions/${id}`).set('Cookie', cookieFor(world.users.admin.id)))
    .body.question;

describe('PATCH /questions/:id with expectedUpdatedAt', () => {
  it('saves when nobody changed it since you opened it, and the new updatedAt differs', async () => {
    const q = await addQuestion(db, world, {
      text: 'Original text here',
      authorId: world.users.authorA.id,
    });
    const before = (await fetchQ(q.id)).updatedAt;
    const res = await patch(q.id, { text: 'First edit', expectedUpdatedAt: before });
    expect(res.status).toBe(200);
    expect(res.body.question.updatedAt).not.toBe(before);
  });

  it("refuses with 409 when it changed in between, and keeps the other person's work", async () => {
    const q = await addQuestion(db, world, {
      text: 'Original text here',
      authorId: world.users.authorA.id,
    });
    const opened = (await fetchQ(q.id)).updatedAt; // both people open the form now
    await patch(q.id, { text: 'Their edit, saved first', expectedUpdatedAt: opened }).expect(200);

    const mine = await patch(q.id, { text: 'My edit, saved second', expectedUpdatedAt: opened });
    expect(mine.status).toBe(409);
    expect(mine.body.error.code).toBe('EDIT_CONFLICT');
    expect((await fetchQ(q.id)).text).toBe('Their edit, saved first');
    // reloading gives the new version, and then saving works
    const fresh = (await fetchQ(q.id)).updatedAt;
    expect(
      (await patch(q.id, { text: 'My edit, after reloading', expectedUpdatedAt: fresh })).status,
    ).toBe(200);
  });

  it('an admin and the author racing is also caught', async () => {
    const q = await addQuestion(db, world, {
      text: 'Original text here',
      authorId: world.users.authorA.id,
    });
    const opened = (await fetchQ(q.id)).updatedAt;
    await patch(
      q.id,
      { answerNotes: 'admin notes', expectedUpdatedAt: opened },
      world.users.admin,
    ).expect(200);
    expect((await patch(q.id, { text: 'author text', expectedUpdatedAt: opened })).status).toBe(
      409,
    );
  });

  it('is optional, so existing clients keep working, and a bad value is a 400', async () => {
    const q = await addQuestion(db, world, {
      text: 'Original text here',
      authorId: world.users.authorA.id,
    });
    expect((await patch(q.id, { text: 'No version sent' })).status).toBe(200);
    for (const v of ['yesterday', 123, '', null]) {
      expect(
        (await patch(q.id, { text: 'Bad version', expectedUpdatedAt: v })).status,
        String(v),
      ).toBe(400);
    }
    // the version alone is not an edit
    expect((await patch(q.id, { expectedUpdatedAt: (await fetchQ(q.id)).updatedAt })).status).toBe(
      400,
    );
  });

  it('visibility and role still come first: no oracle about whether a question changed', async () => {
    const q = await addQuestion(db, world, {
      text: 'Acme only',
      authorId: world.users.authorAcme.id,
      clientId: world.acme.id,
    });
    const stale = '2000-01-01T00:00:00.000Z';
    const hidden = await patch(
      q.id,
      { text: 'x', expectedUpdatedAt: stale },
      world.users.authorGlobex,
    );
    expect(hidden.status).toBe(404);
    const other = await addQuestion(db, world, {
      text: 'Someone elses',
      authorId: world.users.authorB.id,
    });
    expect(
      (await patch(other.id, { text: 'x', expectedUpdatedAt: stale }, world.users.authorA)).status,
    ).toBe(403); // visible but not theirs: the role answer, not a conflict
  });
});
