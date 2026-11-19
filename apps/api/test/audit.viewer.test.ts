/** The admin audit trail: every event, filterable, paged by cursor, exportable as safe CSV. */
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

const admin = () => cookieFor(world.users.admin.id);
const get = (path: string, cookie = admin()) => request(app).get(path).set('Cookie', cookie);
const seed = async (
  n: number,
  over: Partial<{ type: 'USER_UPDATED' | 'CLIENT_CREATED'; actorId: string; at: Date }> = {},
) => {
  const base = Date.parse('2026-01-01T00:00:00Z');
  for (let i = 0; i < n; i++) {
    await db.auditEvent.create({
      data: {
        type: over.type ?? 'USER_UPDATED',
        actorId: over.actorId ?? world.users.admin.id,
        at: over.at ?? new Date(base + i * 1000),
        payload: { n: i },
      },
    });
  }
};

describe('GET /admin/audit', () => {
  it('is admin-only', async () => {
    expect((await request(app).get('/api/admin/audit')).status).toBe(401);
    for (const u of [world.users.plain, world.users.authorAcme, world.users.reviewer]) {
      expect((await get('/api/admin/audit', cookieFor(u.id))).status).toBe(403);
      expect((await get('/api/admin/audit/export', cookieFor(u.id))).status).toBe(403);
    }
  });

  it('lists events newest first with who did it and what', async () => {
    await seed(3);
    const res = await get('/api/admin/audit');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(3);
    expect(res.body.items[0]).toMatchObject({
      type: 'USER_UPDATED',
      actor: { id: world.users.admin.id, name: 'admin' },
      payload: { n: 2 },
    });
    expect(res.body.items.map((i: { payload: { n: number } }) => i.payload.n)).toEqual([2, 1, 0]);
    expect(res.body.nextCursor).toBeNull();
  });

  it('pages by cursor without gaps or repeats, even when events share a timestamp', async () => {
    const same = new Date('2026-02-02T00:00:00Z');
    await seed(7, { at: same });
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const res: request.Response = await get(
        `/api/admin/audit?limit=3${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      );
      expect(res.status).toBe(200);
      seen.push(...res.body.items.map((i: { id: string }) => i.id));
      cursor = res.body.nextCursor;
      pages++;
    } while (cursor && pages < 10);
    expect(pages).toBe(3);
    expect(seen).toHaveLength(7);
    expect(new Set(seen).size).toBe(7);
  });

  it('filters by type, by actor and by date range', async () => {
    await seed(2, { type: 'CLIENT_CREATED', actorId: world.users.admin.id });
    await seed(2, {
      type: 'USER_UPDATED',
      actorId: world.users.authorA.id,
      at: new Date('2026-06-01T00:00:00Z'),
    });
    const types = (await get('/api/admin/audit?type=CLIENT_CREATED')).body.items;
    expect(types).toHaveLength(2);
    expect(types.every((i: { type: string }) => i.type === 'CLIENT_CREATED')).toBe(true);
    const byActor = (await get(`/api/admin/audit?actorId=${world.users.authorA.id}`)).body.items;
    expect(byActor).toHaveLength(2);
    const range = (await get('/api/admin/audit?from=2026-05-01&to=2026-07-01')).body.items;
    expect(range).toHaveLength(2);
    expect(
      range.every((i: { actor: { id: string } }) => i.actor.id === world.users.authorA.id),
    ).toBe(true);
    expect(
      (await get('/api/admin/audit?type=CLIENT_CREATED&actorId=' + world.users.authorA.id)).body
        .items,
    ).toEqual([]);
  });

  it('rejects bad input: unknown type, bad ids, dates, cursor, limits and unknown parameters', async () => {
    for (const qs of [
      'type=NOPE',
      'actorId=x',
      'from=yesterday',
      'to=2026-13-45',
      'cursor=garbage',
      'limit=0',
      'limit=101',
      'limit=abc',
      'extra=1',
      'cursor=' + Buffer.from('a|b').toString('base64url'),
    ]) {
      expect((await get(`/api/admin/audit?${qs}`)).status, qs).toBe(400);
    }
  });

  it('shows the real events other admin actions leave behind, and no secrets', async () => {
    await request(app)
      .post('/api/admin/users')
      .set('Cookie', admin())
      .send({ email: 'n@test.dev', name: 'N', password: 'temp-pass-123', role: 'USER' });
    await request(app)
      .post(`/api/admin/clients/${world.acme.id}/technologies`)
      .set('Cookie', admin())
      .send({ label: 'Rust' });
    const res = await get('/api/admin/audit');
    const types = res.body.items.map((i: { type: string }) => i.type);
    expect(types).toEqual(expect.arrayContaining(['USER_CREATED', 'TAG_CREATED', 'TAG_LINKED']));
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('temp-pass-123');
    expect(text).not.toMatch(/passwordHash|tokenHash/);
  });
});

describe('GET /admin/audit/export', () => {
  it('is a CSV download with a header row and one line per event', async () => {
    await seed(3);
    const res = await get('/api/admin/audit/export');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="audit-.*\.csv"/);
    const lines = res.text.trim().split('\r\n');
    expect(lines[0]).toBe('time,type,actor,actor_id,question_id,details');
    expect(lines).toHaveLength(4);
    expect(lines[1]).toContain('USER_UPDATED');
  });

  it('quotes commas, quotes and line breaks, and neutralises spreadsheet formulas', async () => {
    const payload = { note: 'says "hi", then\nbreaks', formula: '=HYPERLINK("http://evil")' };
    await db.auditEvent.create({
      data: { type: 'USER_UPDATED', actorId: world.users.admin.id, payload },
    });
    await db.appUser.update({
      where: { id: world.users.admin.id },
      data: { name: "=cmd|' /C calc'!A0" },
    });
    const res = await get('/api/admin/audit/export');

    // a small RFC 4180 reader: if the file is quoted correctly this round-trips
    const rows: string[][] = [];
    let cell = '';
    let row: string[] = [];
    let quoted = false;
    const text = res.text;
    for (let i = 0; i < text.length; i++) {
      const c = text[i]!;
      if (quoted) {
        if (c === '"' && text[i + 1] === '"') {
          cell += '"';
          i++;
        } else if (c === '"') quoted = false;
        else cell += c;
      } else if (c === '"') quoted = true;
      else if (c === ',') {
        row.push(cell);
        cell = '';
      } else if (c === '\r' && text[i + 1] === '\n') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
        i++;
      } else cell += c;
    }
    expect(rows).toHaveLength(2);
    const [, data] = rows;
    expect(data).toHaveLength(6);
    // the actor name was a formula: it now starts with an apostrophe, so a spreadsheet shows text
    expect(data![2]).toBe("'=cmd|' /C calc'!A0");
    // the details cell is JSON; the formula inside it is not at the start of any cell
    expect(JSON.parse(data![5]!)).toEqual(payload);
    for (const v of data!) expect(v).not.toMatch(/^[=+\-@\t\r]/);
  });

  it('honours the same filters and caps the rows', async () => {
    await seed(2, { type: 'CLIENT_CREATED' });
    await seed(2, { type: 'USER_UPDATED' });
    const res = await get('/api/admin/audit/export?type=CLIENT_CREATED');
    expect(res.text.trim().split('\r\n')).toHaveLength(3);
    expect(res.headers['x-truncated']).toBe('false');
  });
});
