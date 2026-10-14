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
let world: World;
let ctx: ReturnType<typeof makeApp>;
let rateLimiter: { id: string };
let acmeQ: { id: string };
let globalByA: { id: string };

const RATE_LIMITER = 'How would you design a rate limiter in Node.js?';
const ACME_TEXT = 'How does Acme handle the zebrafish release rollback process?';

beforeEach(async () => {
  await resetDb(db);
  world = await buildWorld(db);
  ctx = makeApp(db);
  const { users, acme } = world;
  rateLimiter = await addQuestion(db, world, {
    text: RATE_LIMITER,
    authorId: users.authorB.id,
    tags: ['technology:nodejs', 'seniority:mid'],
  });
  globalByA = await addQuestion(db, world, {
    text: 'What is a closure in JavaScript?',
    notes: 'Lexical scope.',
    authorId: users.authorA.id,
    tags: ['technology:react'],
  });
  acmeQ = await addQuestion(db, world, {
    text: ACME_TEXT,
    authorId: users.authorAcme.id,
    clientId: acme.id,
    tags: ['technology:nodejs'],
  });
});
afterAll(() => db.$disconnect());

const as = (u: { id: string }) => cookieFor(u.id);
const post = (u: { id: string }, body: unknown) =>
  request(ctx.app)
    .post('/api/questions')
    .set('Cookie', as(u))
    .send(body as object);
const patch = (u: { id: string }, id: string, body: unknown) =>
  request(ctx.app)
    .patch(`/api/questions/${id}`)
    .set('Cookie', as(u))
    .send(body as object);
const counts = async () => ({
  questions: await db.question.count(),
  events: await db.auditEvent.count(),
});
const auditLogs = () =>
  ctx.lines
    .map(
      (l) =>
        JSON.parse(l) as {
          audit?: { type: string; actorId: string; questionId: string | null; at: string };
        },
    )
    .filter((l) => l.audit)
    .map((l) => l.audit!);

describe('POST /questions: FR-01, FR-02, FR-15', () => {
  it('creates a question with tags across categories and records who/when', async () => {
    const res = await post(world.users.authorA, {
      text: '  Explain React reconciliation  ',
      answerNotes: 'Diffing and keys.',
      tags: [
        'technology:react',
        'technology:nodejs',
        'seniority:senior',
        'seniority:mid',
        'type:technical',
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.question).toMatchObject({
      text: 'Explain React reconciliation', // trimmed
      answerNotes: 'Diffing and keys.',
      client: null,
      author: { id: world.users.authorA.id },
    });
    expect(res.body.question.tags).toHaveLength(5);

    const events = await db.auditEvent.findMany({ where: { questionId: res.body.question.id } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'QUESTION_CREATED', actorId: world.users.authorA.id });
    expect(events[0]!.at).toBeInstanceOf(Date);
  });

  it('AUD-01: emits a structured log line for the addition', async () => {
    await post(world.users.authorA, { text: 'A brand new unrelated zzz question' });
    expect(auditLogs()).toEqual([
      expect.objectContaining({ type: 'QUESTION_CREATED', actorId: world.users.authorA.id }),
    ]);
  });

  it('reviewers can add too; read-only users get 403; anonymous gets 401', async () => {
    expect(
      (await post(world.users.reviewer, { text: 'Reviewer question about Kubernetes' })).status,
    ).toBe(201);
    expect((await post(world.users.plain, { text: 'Nope' })).status).toBe(403);
    expect((await request(ctx.app).post('/api/questions').send({ text: 'x' })).status).toBe(401);
  });

  it.each([
    ['missing text', {}],
    ['empty text', { text: '' }],
    ['whitespace-only text', { text: '   ' }],
    ['text over 1000 chars', { text: 'x'.repeat(1001) }],
    ['text of the wrong type', { text: 42 }],
    ['unknown tag category', { text: 'Valid text here', tags: ['colour:red'] }],
    ['unknown tag value', { text: 'Valid text here', tags: ['technology:cobol'] }],
    ['malformed tag', { text: 'Valid text here', tags: ['react'] }],
    ['tags not an array', { text: 'Valid text here', tags: 'technology:react' }],
    ['bad clientId', { text: 'Valid text here', clientId: 'nope' }],
    ['unknown field', { text: 'Valid text here', admin: true }],
    ['notes over 10000 chars', { text: 'Valid text here', answerNotes: 'x'.repeat(10_001) }],
  ])('SEC-01: %s is a 400 and nothing is written', async (_n, body) => {
    const before = await counts();
    const res = await post(world.users.authorA, body);
    expect(res.status).toBe(400);
    expect(await counts()).toEqual(before);
  });

  it('SEC-01: invalid JSON is a 400', async () => {
    const res = await request(ctx.app)
      .post('/api/questions')
      .set('Cookie', as(world.users.authorA))
      .set('Content-Type', 'application/json')
      .send('{"text":');
    expect(res.status).toBe(400);
  });

  it('IMP-05: a client can be set only with a grant; ungranted looks like a nonexistent client', async () => {
    const ok = await post(world.users.authorAcme, {
      text: 'Acme only rollout checklist',
      clientId: world.acme.id,
    });
    expect(ok.status).toBe(201);
    expect(ok.body.question.client).toMatchObject({ id: world.acme.id });

    const denied = await post(world.users.authorA, {
      text: 'Sneaky client attach',
      clientId: world.acme.id,
    });
    const missing = await post(world.users.authorA, {
      text: 'Sneaky client attach',
      clientId: '00000000-0000-4000-8000-000000000000',
    });
    expect(denied.status).toBe(404);
    expect(denied.body).toEqual(missing.body);
  });

  it('is atomic: if the audit write fails, the question is not stored', async () => {
    await db.$executeRaw`CREATE OR REPLACE FUNCTION fail_audit() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'boom'; END $$ LANGUAGE plpgsql`;
    await db.$executeRaw`CREATE TRIGGER fail_audit_trg BEFORE INSERT ON audit_event FOR EACH ROW WHEN (NEW.type = 'QUESTION_CREATED') EXECUTE FUNCTION fail_audit()`;
    try {
      const before = await counts();
      const res = await post(world.users.authorA, { text: 'This write must roll back entirely' });
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: { code: 'INTERNAL', message: 'Internal server error' } });
      expect(await counts()).toEqual(before);
    } finally {
      await db.$executeRaw`DROP TRIGGER fail_audit_trg ON audit_event`;
      await db.$executeRaw`DROP FUNCTION fail_audit()`;
    }
  });
});

describe('duplicate detection: FR-12, FR-13, FR-14', () => {
  it.each([
    ['exact', RATE_LIMITER],
    ['different punctuation and case', 'how would you design a rate-limiter in nodejs'],
    ['reordered', 'In Node.js, how would you design a rate limiter?'],
    ['typos', 'How wuold you desing a rate limiter in Node.js?'],
  ])('%s: returns 409 with the match, stores nothing, leaves an audit trace', async (_n, text) => {
    const before = await counts();
    const res = await post(world.users.authorA, { text });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_SUSPECTED');
    expect(res.body.error.matches[0]).toMatchObject({ id: rateLimiter.id, text: RATE_LIMITER });
    expect(res.body.error.matches[0].similarity).toBeGreaterThanOrEqual(0.6);

    expect((await counts()).questions).toBe(before.questions);
    const rejected = await db.auditEvent.findMany({ where: { type: 'DUPLICATE_REJECTED' } });
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({ actorId: world.users.authorA.id, questionId: null });
    expect(auditLogs()).toEqual([
      expect.objectContaining({
        type: 'DUPLICATE_REJECTED',
        actorId: world.users.authorA.id,
        questionId: null,
      }),
    ]);
  });

  it('clearly different questions are accepted, even on the same technology', async () => {
    const res = await post(world.users.authorA, {
      text: 'Explain the event loop phases in Node.js',
    });
    expect(res.status).toBe(201);
  });

  it('false positive: the author can insist; it is stored and the override is on record', async () => {
    // Genuinely different question that still scores ~0.64 against the rate limiter one.
    const text = 'How would you design a cache in Node.js?';
    const first = await post(world.users.authorA, { text });
    expect(first.status).toBe(409);

    const forced = await post(world.users.authorA, { text, confirmNotDuplicate: true });
    expect(forced.status).toBe(201);
    const events = await db.auditEvent.findMany({
      where: { questionId: forced.body.question.id },
      orderBy: { type: 'asc' },
    });
    expect(events.map((e) => e.type).sort()).toEqual(['DUPLICATE_OVERRIDDEN', 'QUESTION_CREATED']);
    expect(events.every((e) => e.actorId === world.users.authorA.id)).toBe(true);
  });

  it('confirmNotDuplicate with no match is harmless and records no override', async () => {
    const res = await post(world.users.authorA, {
      text: 'Totally novel question xyzzy',
      confirmNotDuplicate: true,
    });
    expect(res.status).toBe(201);
    expect(await db.auditEvent.count({ where: { type: 'DUPLICATE_OVERRIDDEN' } })).toBe(0);
  });

  it('IMP-04: a user cannot see a restricted near-duplicate, so it is neither flagged nor leaked', async () => {
    const quiet = await post(world.users.authorA, { text: ACME_TEXT }); // no Acme grant
    expect(quiet.status).toBe(201);
    // No duplicate warning, and nothing in the response points at the restricted question.
    expect(quiet.body.error).toBeUndefined();
    expect(JSON.stringify(quiet.body)).not.toContain(acmeQ.id);
  });

  it('IMP-04: the permitted user IS warned about the same text', async () => {
    const res = await post(world.users.authorAcme, { text: ACME_TEXT });
    expect(res.status).toBe(409);
    expect(res.body.error.matches[0].id).toBe(acmeQ.id);
  });

  it('IMP-04: a unique-looking submission matching only restricted text is stored without any 409 (no DB unique constraint)', async () => {
    await post(world.users.authorA, { text: ACME_TEXT });
    const again = await post(world.users.authorB, { text: ACME_TEXT });
    expect(again.status).toBe(409); // now the first public copy exists and IS visible
    expect(again.body.error.matches.every((m: { id: string }) => m.id !== acmeQ.id)).toBe(true);
  });
});

describe('PATCH /questions/:id: AUTH-03 edit matrix (direct by ID)', () => {
  // [who, whose question, expected status]
  const matrix: [string, 'own' | 'other' | 'acme', number][] = [
    ['authorA', 'own', 200],
    ['authorA', 'other', 403],
    ['authorB', 'other', 403], // authorB wrote rateLimiter; edits authorA's closure question
    ['reviewer', 'other', 200],
    ['reviewer', 'acme', 200], // reviewer is granted Acme
    ['reviewerNoGrant', 'other', 200],
    ['reviewerNoGrant', 'acme', 404], // not granted: invisible, so 404 not 403
    ['plain', 'other', 403],
    ['plainAcme', 'acme', 403], // can see it, still read-only
    ['plain', 'acme', 404],
    ['authorAcme', 'acme', 200], // own, granted
    ['authorA', 'acme', 404], // no grant: invisible, even though a different author
  ];
  // "other" = a global question written by someone else (authorA's other is authorB's; everyone else's is authorA's)
  const target = (who: string, kind: 'own' | 'other' | 'acme') =>
    kind === 'acme'
      ? acmeQ.id
      : kind === 'own' || who !== 'authorA'
        ? globalByA.id
        : rateLimiter.id;

  it.each(matrix)('%s edits %s question -> %i', async (who, kind, status) => {
    const user = world.users[who as keyof World['users']];
    // "own" for authorA means the closure question; for "other" everyone but authorA edits that same one.
    const res = await patch(user, target(who, kind), { answerNotes: `edited by ${who}` });
    expect(res.status).toBe(status);
    if (status === 200) {
      expect(res.body.question.answerNotes).toBe(`edited by ${who}`);
    } else {
      expect(res.body.question).toBeUndefined();
    }
  });

  it('a rejected edit changes nothing and records nothing', async () => {
    const before = await counts();
    await patch(world.users.authorB, globalByA.id, { text: 'Hijacked' });
    await patch(world.users.plain, globalByA.id, { text: 'Hijacked' });
    expect(await counts()).toEqual(before);
    expect((await db.question.findUnique({ where: { id: globalByA.id } }))!.text).toBe(
      'What is a closure in JavaScript?',
    );
  });

  it('IMP-02: editing a restricted question you cannot see is the same 404 as a random id', async () => {
    const restricted = await patch(world.users.authorA, acmeQ.id, { text: 'Hijacked restricted' });
    const missing = await patch(world.users.authorA, '11111111-1111-4111-8111-111111111111', {
      text: 'Hijacked restricted',
    });
    expect(restricted.status).toBe(404);
    expect(restricted.body).toEqual(missing.body);
  });

  it('IMP-03: losing the grant revokes edit rights on your own client question', async () => {
    expect((await patch(world.users.authorAcme, acmeQ.id, { answerNotes: 'before' })).status).toBe(
      200,
    );
    await db.clientGrant.deleteMany({ where: { userId: world.users.authorAcme.id } });
    expect((await patch(world.users.authorAcme, acmeQ.id, { answerNotes: 'after' })).status).toBe(
      404,
    );
  });

  it('anonymous edit is 401', async () => {
    expect(
      (await request(ctx.app).patch(`/api/questions/${globalByA.id}`).send({ text: 'x' })).status,
    ).toBe(401);
  });

  it.each([
    ['empty body', {}],
    ['clientId (immutable)', { clientId: '00000000-0000-4000-8000-000000000000' }],
    ['empty text', { text: '' }],
    ['unknown tag', { tags: ['technology:cobol'] }],
    ['unknown field', { authorId: 'x' }],
  ])('SEC-01: %s is a 400 and nothing changes', async (_n, body) => {
    const before = await counts();
    const res = await patch(world.users.authorA, globalByA.id, body);
    expect(res.status).toBe(400);
    expect(await counts()).toEqual(before);
  });

  it('IMP-05: clientId cannot be changed or added by anyone, even a reviewer', async () => {
    const res = await patch(world.users.reviewer, globalByA.id, { clientId: world.acme.id });
    expect(res.status).toBe(400);
    expect((await db.question.findUnique({ where: { id: globalByA.id } }))!.clientId).toBeNull();
  });
});

describe('edits and history: FR-15, AUD-01', () => {
  it('records who/when for each real change, replaces tags, and ignores no-op edits', async () => {
    const edit = await patch(world.users.authorA, globalByA.id, {
      text: 'What is a closure in modern JavaScript?',
      tags: ['technology:nodejs', 'seniority:senior'],
    });
    expect(edit.status).toBe(200);
    expect(edit.body.question.tags).toEqual([
      { category: 'seniority', value: 'senior' },
      { category: 'technology', value: 'nodejs' },
    ]);

    const noop = await patch(world.users.authorA, globalByA.id, {
      text: 'What is a closure in modern JavaScript?',
    });
    expect(noop.status).toBe(200);

    const updates = await db.auditEvent.findMany({
      where: { questionId: globalByA.id, type: 'QUESTION_UPDATED' },
    });
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ actorId: world.users.authorA.id });
    expect(updates[0]!.payload).toMatchObject({
      changes: {
        text: {
          from: 'What is a closure in JavaScript?',
          to: 'What is a closure in modern JavaScript?',
        },
        tags: { from: ['technology:react'], to: ['seniority:senior', 'technology:nodejs'] },
      },
    });
    expect(auditLogs().filter((a) => a.type === 'QUESTION_UPDATED')).toHaveLength(1);
  });

  it('a reviewer edit is attributed to the reviewer, not the author', async () => {
    await patch(world.users.reviewerNoGrant, globalByA.id, { answerNotes: 'Reviewed.' });
    const hist = await request(ctx.app)
      .get(`/api/questions/${globalByA.id}/history`)
      .set('Cookie', as(world.users.plain));
    expect(hist.status).toBe(200);
    expect(hist.body.items.map((i: { type: string }) => i.type)).toEqual(['QUESTION_UPDATED']);
    expect(hist.body.items[0].actor).toMatchObject({
      id: world.users.reviewerNoGrant.id,
      name: 'reviewerNoGrant',
    });
    expect(hist.body.items[0].changes.answerNotes).toMatchObject({ to: 'Reviewed.' });
  });

  it('history lists creation then edits in order, with actor and time', async () => {
    const created = await post(world.users.authorA, { text: 'A history test question about Go' });
    const id = created.body.question.id;
    await patch(world.users.authorA, id, { answerNotes: 'one' });
    await patch(world.users.reviewer, id, { answerNotes: 'two' });
    const hist = await request(ctx.app)
      .get(`/api/questions/${id}/history`)
      .set('Cookie', as(world.users.authorB));
    expect(
      hist.body.items.map((i: { type: string; actor: { name: string } }) => [i.type, i.actor.name]),
    ).toEqual([
      ['QUESTION_CREATED', 'authorA'],
      ['QUESTION_UPDATED', 'authorA'],
      ['QUESTION_UPDATED', 'reviewer'],
    ]);
    for (const item of hist.body.items) expect(new Date(item.at).getTime()).not.toBeNaN();
  });

  it('IMP-01: history of a restricted question is the same 404 as a random id; requires auth', async () => {
    const restricted = await request(ctx.app)
      .get(`/api/questions/${acmeQ.id}/history`)
      .set('Cookie', as(world.users.authorA));
    const missing = await request(ctx.app)
      .get('/api/questions/11111111-1111-4111-8111-111111111111/history')
      .set('Cookie', as(world.users.authorA));
    expect(restricted.status).toBe(404);
    expect(restricted.body).toEqual(missing.body);
    expect((await request(ctx.app).get(`/api/questions/${acmeQ.id}/history`)).status).toBe(401);
  });

  it('history never exposes another question that a duplicate override pointed at', async () => {
    // authorAcme (can see the Acme question) knowingly posts a global near-duplicate of it.
    const forced = await post(world.users.authorAcme, {
      text: ACME_TEXT,
      confirmNotDuplicate: true,
    });
    expect(forced.status).toBe(201);
    // Now a user with no Acme access reads the new question's history.
    const hist = await request(ctx.app)
      .get(`/api/questions/${forced.body.question.id}/history`)
      .set('Cookie', as(world.users.authorA));
    // forced question carries a clientId? no: it is global, so authorA can read it.
    expect(hist.status).toBe(200);
    const body = JSON.stringify(hist.body);
    expect(body).not.toContain(acmeQ.id);
    expect(body).not.toMatch(/zebrafish/i);
    expect(hist.body.items.map((i: { type: string }) => i.type)).toContain('DUPLICATE_OVERRIDDEN');
  });
});
