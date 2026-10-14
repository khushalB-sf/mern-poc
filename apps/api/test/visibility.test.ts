import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
let acmeQuestionId: string;

// Layout: global questions use react+mid. Acme-restricted ones use nodejs+senior, so a nodejs or senior
// filter matches ONLY Acme-restricted rows. Globex has its own restricted question (react+mid).
beforeAll(async () => {
  await resetDb(db);
  world = await buildWorld(db);
  const { users, acme, globex } = world;
  await addQuestion(db, world, {
    text: 'What is a closure in JavaScript?',
    notes: 'Lexical scope.',
    authorId: users.authorA.id,
    tags: ['technology:react', 'seniority:mid'],
  });
  await addQuestion(db, world, {
    text: 'Explain hooks in React',
    notes: 'Rules of hooks.',
    authorId: users.authorA.id,
    tags: ['technology:react', 'seniority:mid'],
  });
  acmeQuestionId = (
    await addQuestion(db, world, {
      text: 'How does Acme use the zebrafish pipeline?',
      notes: 'Deploys nightly.',
      authorId: users.authorAcme.id,
      clientId: acme.id,
      tags: ['technology:nodejs', 'seniority:senior'],
    })
  ).id;
  await addQuestion(db, world, {
    text: 'Describe the Acme release train',
    notes: 'Mentions the quokka rollout.', // keyword only in the notes
    authorId: users.authorAcme.id,
    clientId: acme.id,
    tags: ['technology:nodejs', 'seniority:senior'],
  });
  await addQuestion(db, world, {
    text: 'What changed in the Globex narwhal billing flow?',
    notes: 'Invoices.',
    authorId: users.authorGlobex.id,
    clientId: globex.id,
    tags: ['technology:react', 'seniority:mid'],
  });
});
afterAll(() => db.$disconnect());

const as = (userId: string) => (path: string) =>
  request(app).get(path).set('Cookie', cookieFor(userId));

/** Response parts that must not differ between "hidden" and "genuinely absent". */
const shape = (res: request.Response) => {
  const headers = { ...res.headers };
  delete headers.date;
  delete headers['x-request-id'];
  return { status: res.status, headers, body: res.body };
};

// [label, query hitting only restricted rows, control query that genuinely matches nothing at all]
const cases = (acmeId: string) =>
  [
    ['keyword in question text', 'q=zebrafish', 'q=qqqqnomatch'],
    ['keyword only in answer notes', 'q=quokka', 'q=qqqqnomatch'],
    [
      'tag filter matching only restricted rows',
      'tags=technology:nodejs',
      'tags=technology:react,seniority:senior',
    ],
    [
      'keyword + tag filter',
      'q=zebrafish&tags=technology:nodejs',
      'q=qqqqnomatch&tags=technology:nodejs',
    ],
    ['clientId filter', `clientId=${acmeId}`, 'clientId=00000000-0000-4000-8000-000000000000'],
    ['offset past the end', 'q=zebrafish&offset=50', 'q=qqqqnomatch&offset=50'],
    [
      'multi-category tag filter + paging',
      'tags=technology:nodejs,seniority:senior&limit=1&offset=1',
      'tags=technology:react,seniority:senior&limit=1&offset=1',
    ],
  ] as const;

describe('SEC-04: users without client permission cannot tell restricted questions exist', () => {
  for (const [name, hidden, control] of cases('PLACEHOLDER')) {
    it(`${name}: unpermitted response is indistinguishable from a genuine zero-match`, async () => {
      const q = (s: string) => s.replace('PLACEHOLDER', world.acme.id);
      for (const user of [
        world.users.authorA,
        world.users.plain,
        world.users.reviewerNoGrant,
        world.users.authorGlobex,
      ]) {
        const hiddenRes = await as(user.id)(`/api/questions?${q(hidden)}`);
        const controlRes = await as(user.id)(`/api/questions?${q(control)}`);
        expect(hiddenRes.status).toBe(200);
        expect(hiddenRes.body.items).toEqual([]);
        expect(hiddenRes.body.page.total).toBe(0);
        expect(shape(hiddenRes)).toEqual(shape(controlRes));
      }
    });
  }

  it('positive control: a permitted user DOES see the keyword matches (so the zeros above are not vacuous)', async () => {
    for (const user of [world.users.authorAcme, world.users.reviewer, world.users.plainAcme]) {
      const byText = await as(user.id)('/api/questions?q=zebrafish');
      expect(byText.body.items.map((i: { id: string }) => i.id)).toEqual([acmeQuestionId]);
      expect(byText.body.page.total).toBe(1);
      expect((await as(user.id)('/api/questions?q=quokka')).body.page.total).toBe(1);
      expect((await as(user.id)('/api/questions?tags=technology:nodejs')).body.page.total).toBe(
        3 - 1,
      ); // Acme's two only
      expect((await as(user.id)(`/api/questions?clientId=${world.acme.id}`)).body.page.total).toBe(
        2,
      );
    }
  });

  it('totals and results cover only visible rows: unpermitted sees just the global questions', async () => {
    const res = await as(world.users.authorA.id)('/api/questions');
    expect(res.body.page.total).toBe(2);
    expect(res.body.items.map((i: { text: string }) => i.text).sort()).toEqual([
      'Explain hooks in React',
      'What is a closure in JavaScript?',
    ]);
  });

  it('a user granted for one client sees that client plus global, never the other client', async () => {
    const res = await as(world.users.authorGlobex.id)('/api/questions?limit=50');
    expect(res.body.page.total).toBe(3); // 2 global + Globex's own
    expect(res.body.items.map((i: { text: string }) => i.text)).toContain(
      'What changed in the Globex narwhal billing flow?',
    );
    expect(
      (await as(world.users.authorGlobex.id)('/api/questions?q=narwhal')).body.page.total,
    ).toBe(1);
    expect(
      (await as(world.users.authorGlobex.id)('/api/questions?q=zebrafish')).body.page.total,
    ).toBe(0);
    // and the Acme-only user the other way round
    expect((await as(world.users.authorAcme.id)('/api/questions?q=narwhal')).body.page.total).toBe(
      0,
    );
  });
});

describe('IMP-02: a restricted question by ID looks exactly like a nonexistent one', () => {
  it('GET /questions/:id is the same 404 for restricted and random ids', async () => {
    const randomId = '11111111-1111-4111-8111-111111111111';
    for (const user of [
      world.users.authorA,
      world.users.plain,
      world.users.reviewerNoGrant,
      world.users.authorGlobex,
    ]) {
      const restricted = await as(user.id)(`/api/questions/${acmeQuestionId}`);
      const missing = await as(user.id)(`/api/questions/${randomId}`);
      expect(restricted.status).toBe(404);
      expect(shape(restricted)).toEqual(shape(missing));
    }
  });

  it('permitted users get the question', async () => {
    const res = await as(world.users.reviewer.id)(`/api/questions/${acmeQuestionId}`);
    expect(res.status).toBe(200);
    expect(res.body.question.client).toMatchObject({ id: world.acme.id });
  });

  it('a malformed id is a 400 for everyone, regardless of existence', async () => {
    expect((await as(world.users.authorA.id)('/api/questions/not-a-uuid')).status).toBe(400);
  });
});

describe('authentication and validation (SEC-01, SEC-02)', () => {
  it('search and get require authentication', async () => {
    expect((await request(app).get('/api/questions')).status).toBe(401);
    expect((await request(app).get(`/api/questions/${acmeQuestionId}`)).status).toBe(401);
  });

  it.each([
    ['unknown tag category', 'tags=colour:red'],
    ['unknown tag value in a known category', 'tags=technology:cobol'],
    ['malformed tag', 'tags=react'],
    ['bad clientId', 'clientId=nope'],
    ['limit too large', 'limit=51'],
    ['limit zero', 'limit=0'],
    ['negative offset', 'offset=-1'],
    ['keyword too long', `q=${'x'.repeat(201)}`],
    ['unknown parameter', 'bogus=1'],
  ])('400 for %s', async (_n, qs) => {
    const res = await as(world.users.authorA.id)(`/api/questions?${qs}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toMatch(/VALIDATION_ERROR|UNKNOWN_TAG/);
  });
});

describe('FR-03..FR-06, FR-17: filter, keyword, pagination (as a user who sees everything)', () => {
  const all = () => as(world.users.authorAcme.id);

  it('keyword matches question text and answer notes', async () => {
    expect((await all()('/api/questions?q=lexical')).body.page.total).toBe(1); // notes only
    expect((await all()('/api/questions?q=closure')).body.page.total).toBe(1); // text only
  });

  it('keyword uses stemming (hooks ~ hook)', async () => {
    expect((await all()('/api/questions?q=hook')).body.page.total).toBe(1);
  });

  it('OR within a category, AND across categories', async () => {
    const t = async (qs: string) => (await all()(`/api/questions?${qs}`)).body.page.total;
    expect(await t('tags=technology:react')).toBe(2);
    expect(await t('tags=technology:react,technology:nodejs')).toBe(4); // authorAcme: 2 global + 2 Acme
    expect(await t('tags=technology:react,technology:nodejs,seniority:mid')).toBe(2);
    expect(await t('tags=technology:react,technology:nodejs,seniority:senior')).toBe(2);
    expect(await t('tags=technology:react,seniority:senior')).toBe(0); // nothing is both
  });

  it('keyword and filters intersect', async () => {
    const t = async (qs: string) => (await all()(`/api/questions?${qs}`)).body.page.total;
    expect(await t('q=hooks&tags=technology:react')).toBe(1);
    expect(await t('q=hooks&tags=technology:nodejs')).toBe(0);
  });

  it('pages are stable, non-overlapping, and total is the full count', async () => {
    const page = async (offset: number) =>
      (await all()(`/api/questions?limit=2&offset=${offset}`)).body;
    const [p1, p2, p3] = [await page(0), await page(2), await page(4)];
    expect(p1.page).toEqual({ limit: 2, offset: 0, total: 4 });
    expect(p3.items).toEqual([]);
    const ids = [...p1.items, ...p2.items].map((i: { id: string }) => i.id);
    expect(new Set(ids).size).toBe(4);
  });

  it('item shape carries tags, author and client', async () => {
    const res = await all()('/api/questions?q=zebrafish');
    expect(res.body.items[0]).toMatchObject({
      text: 'How does Acme use the zebrafish pipeline?',
      answerNotes: 'Deploys nightly.',
      client: { id: world.acme.id, name: 'Acme' },
      author: { name: 'authorAcme' },
    });
    expect(res.body.items[0].tags).toEqual(
      expect.arrayContaining([
        { category: 'technology', value: 'nodejs' },
        { category: 'seniority', value: 'senior' },
      ]),
    );
  });
});

describe('IMP-01: supporting endpoints do not disclose restricted data', () => {
  it('GET /clients lists only the clients the caller is granted', async () => {
    const names = async (userId: string) =>
      (await as(userId)('/api/clients')).body.items.map((c: { name: string }) => c.name);
    expect(await names(world.users.authorA.id)).toEqual([]);
    expect(await names(world.users.authorAcme.id)).toEqual(['Acme']);
    expect(await names(world.users.authorGlobex.id)).toEqual(['Globex']);
  });

  it('GET /tags is the same global taxonomy for everyone and carries no counts', async () => {
    const a = await as(world.users.authorA.id)('/api/tags');
    const b = await as(world.users.authorAcme.id)('/api/tags');
    expect(a.status).toBe(200);
    expect(a.body).toEqual(b.body);
    expect(JSON.stringify(a.body)).not.toMatch(/count|total/i);
    expect(a.body.categories.map((c: { slug: string }) => c.slug).sort()).toEqual([
      'seniority',
      'technology',
      'type',
    ]);
  });

  it('both require authentication', async () => {
    expect((await request(app).get('/api/clients')).status).toBe(401);
    expect((await request(app).get('/api/tags')).status).toBe(401);
  });
});
