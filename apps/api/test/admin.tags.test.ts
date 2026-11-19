/** Seniority levels and question types are administered like technologies, minus the department link. */
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildWorld, cookieFor, makeApp, makeDb, resetDb, type World } from './helpers.js';

const db = makeDb();
const { app } = makeApp(db);
let world: World;
beforeEach(async () => {
  await resetDb(db);
  world = await buildWorld(db);
});
afterAll(() => db.$disconnect());

type Method = 'get' | 'post' | 'patch';
const admin = () => cookieFor(world.users.admin.id);
const call = (method: Method, path: string, body?: object, cookie = admin()) =>
  request(app)[method](path).set('Cookie', cookie).send(body);
const mid = () => world.tags.get('seniority:mid')!;
const react = () => world.tags.get('technology:react')!;

describe('listing', () => {
  it('shows every category except technology (those live in departments), with usage counts', async () => {
    await db.question.create({
      data: {
        text: 'q',
        authorId: world.users.authorA.id,
        status: 'APPROVED',
        tags: { create: [{ tagId: mid() }] },
      },
    });
    const res = await call('get', '/api/admin/tag-categories');
    expect(res.status).toBe(200);
    expect(res.body.items.map((c: { slug: string }) => c.slug).sort()).toEqual([
      'seniority',
      'type',
    ]);
    const seniority = res.body.items.find((c: { slug: string }) => c.slug === 'seniority');
    expect(seniority.tags.find((t: { id: string }) => t.id === mid())).toMatchObject({
      label: 'mid',
      archived: false,
      questionCount: 1,
    });
  });

  it('is admin-only', async () => {
    for (const [m, p] of [
      ['get', '/api/admin/tag-categories'],
      ['post', '/api/admin/tag-categories/seniority/tags'],
      ['patch', `/api/admin/tags/${mid()}`],
      ['post', `/api/admin/tags/${mid()}/archive`],
      ['post', `/api/admin/tags/${mid()}/restore`],
    ] as const) {
      expect((await request(app)[m](p).send({})).status).toBe(401);
      for (const u of [world.users.plain, world.users.authorAcme, world.users.reviewer]) {
        expect((await call(m, p, {}, cookieFor(u.id))).status, `${m} ${p}`).toBe(403);
      }
    }
  });
});

describe('adding', () => {
  it('creates a tag in the category with a safe value, audited', async () => {
    const res = await call('post', '/api/admin/tag-categories/seniority/tags', {
      label: 'Staff engineer',
    });
    expect(res.status).toBe(201);
    const tag = await db.tag.findUniqueOrThrow({
      where: { id: res.body.tag.id },
      include: { category: true },
    });
    expect(tag).toMatchObject({ value: 'staff-engineer', label: 'Staff engineer' });
    expect(tag.category.slug).toBe('seniority');
    expect(await db.auditEvent.count({ where: { type: 'TAG_CREATED' } })).toBe(1);
    // and a question can use it
    const q = await call(
      'post',
      '/api/questions',
      { text: 'A staff level question', tags: ['seniority:staff-engineer'] },
      cookieFor(world.users.authorA.id),
    );
    expect(q.status).toBe(201);
  });

  it('refuses a name that already exists in that category (case and punctuation ignored), but allows it in another', async () => {
    const dup = await call('post', '/api/admin/tag-categories/seniority/tags', { label: 'MID' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('TAG_EXISTS');
    expect(
      (await call('post', '/api/admin/tag-categories/seniority/tags', { label: 'm-i-d' })).status,
    ).toBe(409);
    expect(
      (await call('post', '/api/admin/tag-categories/type/tags', { label: 'Mid' })).status,
    ).toBe(201);
  });

  it('technology is not managed here, unknown categories are 404, and the label is validated', async () => {
    expect(
      (await call('post', '/api/admin/tag-categories/technology/tags', { label: 'Rust' })).status,
    ).toBe(404);
    expect((await call('post', '/api/admin/tag-categories/nope/tags', { label: 'X' })).status).toBe(
      404,
    );
    for (const body of [
      {},
      { label: '' },
      { label: '   ' },
      { label: '+++' },
      { label: 'x'.repeat(51) },
      { label: 'ok', extra: 1 },
    ]) {
      expect(
        (await call('post', '/api/admin/tag-categories/seniority/tags', body)).status,
        JSON.stringify(body),
      ).toBe(400);
    }
  });
});

describe('renaming', () => {
  it('changes the label, never the value, and refuses a clash', async () => {
    expect((await call('patch', `/api/admin/tags/${mid()}`, { label: 'Mid-level' })).status).toBe(
      200,
    );
    expect(await db.tag.findUniqueOrThrow({ where: { id: mid() } })).toMatchObject({
      value: 'mid',
      label: 'Mid-level',
    });
    const clash = await call('patch', `/api/admin/tags/${mid()}`, { label: 'SENIOR' });
    expect(clash.status).toBe(409);
    expect(await db.auditEvent.count({ where: { type: 'TAG_UPDATED' } })).toBe(1);
  });

  it('technologies cannot be renamed through this route', async () => {
    expect((await call('patch', `/api/admin/tags/${react()}`, { label: 'ReactJS' })).status).toBe(
      404,
    );
  });
});

describe('archiving', () => {
  it('hides it from filters and new questions, keeps it on old ones, and can be restored', async () => {
    const q = await db.question.create({
      data: {
        text: 'old',
        authorId: world.users.authorA.id,
        status: 'APPROVED',
        tags: { create: [{ tagId: mid() }] },
      },
    });
    expect((await call('post', `/api/admin/tags/${mid()}/archive`)).status).toBe(204);
    expect((await call('post', `/api/admin/tags/${mid()}/archive`)).status).toBe(404); // already archived

    const filter = await call(
      'get',
      '/api/tags?for=filter',
      undefined,
      cookieFor(world.users.authorA.id),
    );
    const seniority = filter.body.categories.find((c: { slug: string }) => c.slug === 'seniority');
    expect(seniority.tags.map((t: { value: string }) => t.value)).not.toContain('mid');
    const attach = await call(
      'post',
      '/api/questions',
      { text: 'Fresh question here', tags: ['seniority:mid'] },
      cookieFor(world.users.authorA.id),
    );
    expect(attach.body.error.code).toBe('TAG_ARCHIVED');
    const old = await call(
      'get',
      `/api/questions/${q.id}`,
      undefined,
      cookieFor(world.users.authorA.id),
    );
    expect(old.body.question.tags.map((t: { value: string }) => t.value)).toContain('mid');

    expect((await call('post', `/api/admin/tags/${mid()}/restore`)).status).toBe(204);
    expect((await call('post', `/api/admin/tags/${mid()}/restore`)).status).toBe(404); // not archived
    expect(
      await db.auditEvent.count({ where: { type: { in: ['TAG_ARCHIVED', 'TAG_RESTORED'] } } }),
    ).toBe(2);
  });

  it('technologies are archived from their department, not here', async () => {
    expect((await call('post', `/api/admin/tags/${react()}/archive`)).status).toBe(404);
    expect((await call('post', `/api/admin/tags/${react()}/restore`)).status).toBe(404);
  });
});
