/** Admin lists are searchable and paged by cursor; deep question paging is capped. */
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

const get = (path: string, cookie = cookieFor(world.users.admin.id)) =>
  request(app).get(path).set('Cookie', cookie);

async function allPages(path: string, limit: number) {
  const items: { id: string }[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const res: request.Response = await get(
      `${path}${path.includes('?') ? '&' : '?'}limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    );
    expect(res.status).toBe(200);
    items.push(...res.body.items);
    cursor = res.body.nextCursor;
    pages++;
  } while (cursor && pages < 30);
  return { items, pages };
}

describe('GET /admin/users', () => {
  it('pages through everyone once, in name order, with a cursor', async () => {
    const { items, pages } = await allPages('/api/admin/users', 4);
    expect(items).toHaveLength(9); // the world has nine users
    expect(new Set(items.map((i) => i.id)).size).toBe(9);
    expect(pages).toBe(3);
    const names = items.map((i) => (i as unknown as { name: string }).name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it('a small list is one page with no cursor', async () => {
    const res = await get('/api/admin/users');
    expect(res.body.items).toHaveLength(9);
    expect(res.body.nextCursor).toBeNull();
  });

  it('searches name and email, ignoring case, and pages the matches', async () => {
    const byName = await get('/api/admin/users?q=AUTHOR');
    expect(byName.body.items.map((u: { name: string }) => u.name).sort()).toEqual([
      'authorA',
      'authorAcme',
      'authorB',
      'authorGlobex',
    ]);
    const byEmail = await get('/api/admin/users?q=reviewer%40');
    expect(byEmail.body.items.map((u: { email: string }) => u.email)).toEqual([
      'reviewer@test.dev',
    ]);
    const { items } = await allPages('/api/admin/users?q=author', 2);
    expect(items).toHaveLength(4);
    expect((await get('/api/admin/users?q=nobody-by-that-name')).body.items).toEqual([]);
  });

  it('filters by role, by status and by department, alone or together, with the search', async () => {
    const names = (r: request.Response) => r.body.items.map((u: { name: string }) => u.name).sort();

    expect(names(await get('/api/admin/users?role=REVIEWER'))).toEqual([
      'reviewer',
      'reviewerNoGrant',
    ]);
    expect(names(await get('/api/admin/users?role=ADMIN'))).toEqual(['admin']);

    await db.appUser.update({ where: { id: world.users.plain.id }, data: { active: false } });
    expect(names(await get('/api/admin/users?active=false'))).toEqual(['plain']);
    expect((await get('/api/admin/users?active=true')).body.items).toHaveLength(8);

    // a department: the people granted it (an admin has no grants but sees everything, so is not listed)
    expect(names(await get(`/api/admin/users?clientId=${world.acme.id}`))).toEqual([
      'authorAcme',
      'plainAcme',
      'reviewer',
    ]);

    expect(
      names(await get(`/api/admin/users?clientId=${world.acme.id}&role=AUTHOR&q=acme`)),
    ).toEqual(['authorAcme']);

    // the filters page with the cursor like everything else
    const { items } = await allPages('/api/admin/users?role=AUTHOR', 2);
    expect(items).toHaveLength(4);
  });

  it('rejects an unknown role, status or department id', async () => {
    for (const qs of ['role=OWNER', 'active=maybe', 'clientId=not-a-uuid', 'role=A&role=B']) {
      expect((await get(`/api/admin/users?${qs}`)).status, qs).toBe(400);
    }
  });

  it('takes % and _ literally, so a search cannot widen itself', async () => {
    expect((await get('/api/admin/users?q=%25')).body.items).toEqual([]);
    expect((await get('/api/admin/users?q=_')).body.items).toEqual([]);
    expect((await get("/api/admin/users?q='%20OR%201%3D1%20--")).body.items).toEqual([]);
  });

  it('pages the deleted users the same way', async () => {
    for (const u of [world.users.authorA, world.users.authorB, world.users.plain]) {
      await db.appUser.update({
        where: { id: u.id },
        data: { deletedAt: new Date(), active: false },
      });
    }
    const { items, pages } = await allPages('/api/admin/users?deleted=true', 2);
    expect(items).toHaveLength(3);
    expect(pages).toBe(2);
  });

  it('rejects a bad cursor, bad limits and unknown parameters', async () => {
    for (const qs of [
      'cursor=garbage',
      `cursor=${Buffer.from('[1,2]').toString('base64url')}`,
      'limit=0',
      'limit=101',
      'limit=x',
      'extra=1',
      `q=${'a'.repeat(101)}`,
      'deleted=maybe',
    ]) {
      expect((await get(`/api/admin/users?${qs}`)).status, qs).toBe(400);
    }
  });
});

describe('GET /admin/deleted-questions', () => {
  it('pages by cursor, newest deletion first, without gaps or repeats', async () => {
    const stamp = new Date('2026-03-03T00:00:00Z');
    for (let i = 0; i < 5; i++) {
      const q = await addQuestion(db, world, {
        text: `Deleted ${i}`,
        authorId: world.users.authorA.id,
      });
      await db.question.update({ where: { id: q.id }, data: { deletedAt: stamp } }); // all at the same instant
    }
    const { items, pages } = await allPages('/api/admin/deleted-questions', 2);
    expect(items).toHaveLength(5);
    expect(new Set(items.map((i) => i.id)).size).toBe(5);
    expect(pages).toBe(3);
    expect((await get('/api/admin/deleted-questions?cursor=garbage')).status).toBe(400);
    expect((await get('/api/admin/deleted-questions?limit=101')).status).toBe(400);
  });
});

describe('searching questions deep into the result set', () => {
  it('stops at offset 10,000: nobody pages 500 deep, and the cost grows with the offset', async () => {
    expect((await get('/api/questions?limit=1&offset=10000')).status).toBe(200);
    expect((await get('/api/questions?limit=1&offset=10001')).status).toBe(400);
  });
});
