/**
 * Red-team tests for authorization (BOLA/IDOR/BFLA), information leakage and logic flaws.
 * Each test asserts the SECURE behaviour; a failure is a confirmed finding.
 */
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  MANIFEST,
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

type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';
const as = (u: { id: string }, method: Method, path: string, body?: object) =>
  request(app)[method](path).set('Cookie', cookieFor(u.id)).send(body);
const RANDOM = '99999999-9999-4999-8999-999999999999';

describe('B1 every admin route is ADMIN-only (BFLA sweep over the whole route manifest)', () => {
  const adminRoutes = MANIFEST.filter(([, p]) => p.startsWith('/api/admin/'));
  it('the manifest really contains the admin routes', () => {
    expect(adminRoutes.length).toBeGreaterThanOrEqual(20);
  });

  it.each(adminRoutes)(
    '%s %s: anonymous 401, every non-admin role 403, admin gets past the gate',
    async (method, path) => {
      expect((await request(app)[method](path).send({})).status).toBe(401);
      for (const u of [
        world.users.plain,
        world.users.plainAcme,
        world.users.authorAcme,
        world.users.reviewer,
        world.users.reviewerNoGrant,
      ]) {
        const res = await as(u, method, path, {});
        expect(res.status, `${u.id}`).toBe(403);
      }
      const admin = await as(world.users.admin, method, path, {});
      expect([401, 403]).not.toContain(admin.status);
      expect(admin.status).toBeLessThan(500);
    },
  );
});

describe('B2 question routes: role gates', () => {
  it('only authors and admins can create; nobody else, reviewers included', async () => {
    for (const u of [world.users.plain, world.users.plainAcme, world.users.reviewer]) {
      expect((await as(u, 'post', '/api/questions', { text: 'Can I add this?' })).status).toBe(403);
    }
    expect(
      (await as(world.users.authorA, 'post', '/api/questions', { text: 'Yes you can' })).status,
    ).toBe(201);
  });

  it("an author cannot edit or delete another author's question, even one they can see", async () => {
    const q = await addQuestion(db, world, {
      text: 'Acme B question',
      authorId: world.users.authorB.id,
      clientId: world.acme.id,
    });
    const edit = await as(world.users.authorAcme, 'patch', `/api/questions/${q.id}`, {
      text: 'hijacked',
    });
    expect(edit.status).toBe(403);
    expect((await as(world.users.authorAcme, 'delete', `/api/questions/${q.id}`)).status).toBe(403);
    expect((await db.question.findUniqueOrThrow({ where: { id: q.id } })).text).toBe(
      'Acme B question',
    );
  });

  it('only a reviewer or admin can review, never the author or a plain user; never your own question', async () => {
    const q = await addQuestion(db, world, {
      text: 'Pending in Acme',
      authorId: world.users.authorAcme.id,
      clientId: world.acme.id,
      status: 'PENDING',
    });
    const review = { decision: 'APPROVED' };
    for (const u of [world.users.plainAcme, world.users.authorAcme]) {
      expect([403, 404]).toContain(
        (await as(u, 'post', `/api/questions/${q.id}/review`, review)).status,
      );
    }
    // a reviewer who is also the author of the question may not approve it
    await db.appUser.update({
      where: { id: world.users.authorAcme.id },
      data: { role: 'REVIEWER' },
    });
    expect(
      (await as(world.users.authorAcme, 'post', `/api/questions/${q.id}/review`, review)).status,
    ).toBe(403);
    expect((await db.question.findUniqueOrThrow({ where: { id: q.id } })).status).toBe('PENDING');
  });

  it('privilege escalation through the admin API is closed: nobody promotes themselves', async () => {
    for (const u of [world.users.plain, world.users.authorAcme, world.users.reviewer]) {
      expect((await as(u, 'patch', `/api/admin/users/${u.id}`, { role: 'ADMIN' })).status).toBe(
        403,
      );
      expect(
        (await as(u, 'put', `/api/admin/users/${u.id}/clients`, { clientIds: [world.globex.id] }))
          .status,
      ).toBe(403);
    }
    expect((await db.appUser.findUniqueOrThrow({ where: { id: world.users.plain.id } })).role).toBe(
      'USER',
    );
  });
});

describe('B3 no existence oracle: "not allowed" looks exactly like "does not exist"', () => {
  const same = (a: request.Response, b: request.Response) => {
    expect(a.status).toBe(b.status);
    expect(a.body).toEqual(b.body);
  };

  it('a restricted question and a random id answer identically on every by-id route', async () => {
    const acme = await addQuestion(db, world, {
      text: 'Acme secret roadmap',
      authorId: world.users.authorAcme.id,
      clientId: world.acme.id,
    });
    const intruder = world.users.authorGlobex;
    const probes: [Method, (id: string) => string, object?][] = [
      ['get', (id) => `/api/questions/${id}`],
      ['get', (id) => `/api/questions/${id}/history`],
      ['patch', (id) => `/api/questions/${id}`, { text: 'x' }],
      ['delete', (id) => `/api/questions/${id}`],
      ['post', (id) => `/api/questions/${id}/review`, { decision: 'APPROVED' }],
    ];
    for (const [method, path, body] of probes) {
      same(
        await as(intruder, method, path(acme.id), body),
        await as(intruder, method, path(RANDOM), body),
      );
    }
    const reviewer = world.users.reviewerNoGrant;
    same(
      await as(reviewer, 'get', `/api/questions/${acme.id}`),
      await as(reviewer, 'get', `/api/questions/${RANDOM}`),
    );
  });

  it('creating in a department you are not granted looks like a department that does not exist', async () => {
    const body = (clientId: string) => ({ text: 'Probe for departments', clientId });
    same(
      await as(world.users.authorGlobex, 'post', '/api/questions', body(world.acme.id)),
      await as(world.users.authorGlobex, 'post', '/api/questions', body(RANDOM)),
    );
  });

  it('searching by a department you cannot see looks like searching a department with no questions', async () => {
    await addQuestion(db, world, {
      text: 'Acme only thing',
      authorId: world.users.authorAcme.id,
      clientId: world.acme.id,
    });
    const probe = (client: string) =>
      as(world.users.authorGlobex, 'get', `/api/questions?clientId=${client}`);
    const real = await probe(world.acme.id);
    expect(real.status).toBe(200); // a valid search, not a 400 that would make the comparison vacuous
    same(real, await probe(RANDOM));
  });

  it('the duplicate check never reveals a question you cannot see', async () => {
    await addQuestion(db, world, {
      text: 'How does Acme price enterprise renewals?',
      authorId: world.users.authorAcme.id,
      clientId: world.acme.id,
    });
    const res = await as(world.users.authorGlobex, 'post', '/api/questions', {
      text: 'How does Acme price enterprise renewals?',
      clientId: world.globex.id,
    });
    expect(res.status).toBe(201); // no 409 DUPLICATE_SUSPECTED: that would confirm the restricted question exists
    expect(res.body).not.toHaveProperty('matches');
    expect(res.body.question.client.name).toBe('Globex'); // created in the caller's own department
  });

  it('departments and their technologies of other teams are never listed', async () => {
    const res = await as(world.users.authorGlobex, 'get', '/api/clients');
    expect(res.body.items).toMatchObject([{ name: 'Globex', technologies: ['react'] }]);
    expect(JSON.stringify(res.body)).not.toMatch(/Acme|nodejs/);
  });

  it('read-only and reviewer accounts without a grant see nothing of a restricted department anywhere', async () => {
    const q = await addQuestion(db, world, {
      text: 'Restricted Acme material',
      authorId: world.users.authorAcme.id,
      clientId: world.acme.id,
    });
    for (const u of [world.users.plain, world.users.reviewerNoGrant, world.users.authorGlobex]) {
      const list = await as(u, 'get', '/api/questions?q=Restricted');
      expect(list.body.items).toEqual([]);
      expect(list.body.page.total).toBe(0);
      expect(JSON.stringify((await as(u, 'get', '/api/tags?for=filter')).body)).not.toContain(
        'Restricted',
      );
      expect((await as(u, 'get', `/api/questions/${q.id}/history`)).status).toBe(404);
    }
  });

  it('a read-only user granted the department still sees only APPROVED questions, never pending or rejected ones', async () => {
    const pending = await addQuestion(db, world, {
      text: 'Awaiting review one',
      authorId: world.users.authorAcme.id,
      clientId: world.acme.id,
      status: 'PENDING',
    });
    const rejected = await addQuestion(db, world, {
      text: 'Rejected one here',
      authorId: world.users.authorAcme.id,
      clientId: world.acme.id,
      status: 'REJECTED',
    });
    for (const id of [pending.id, rejected.id]) {
      expect((await as(world.users.plainAcme, 'get', `/api/questions/${id}`)).status).toBe(404);
    }
    const all = await as(world.users.plainAcme, 'get', '/api/questions?status=PENDING');
    expect(all.body.items).toEqual([]);
  });
});

describe('B4 mass assignment: unknown or privileged fields are rejected, not silently honoured', () => {
  const evil = {
    status: 'APPROVED',
    authorId: RANDOM,
    id: RANDOM,
    deletedAt: null,
    reviewedById: RANDOM,
    createdAt: '2000-01-01',
    client: { id: RANDOM },
  };
  it.each(Object.entries(evil))('POST /questions with %s is a 400', async (key, value) => {
    const res = await as(world.users.authorAcme, 'post', '/api/questions', {
      text: 'Mass assignment probe',
      [key]: value,
    });
    expect(res.status).toBe(400);
  });

  it('PATCH /questions cannot move a question to another department or change its status', async () => {
    const q = await addQuestion(db, world, {
      text: 'Stays put',
      authorId: world.users.authorAcme.id,
      clientId: world.acme.id,
    });
    for (const patch of [
      { clientId: world.globex.id },
      { status: 'APPROVED' },
      { authorId: world.users.admin.id },
    ]) {
      expect(
        (await as(world.users.authorAcme, 'patch', `/api/questions/${q.id}`, patch)).status,
      ).toBe(400);
    }
    expect((await db.question.findUniqueOrThrow({ where: { id: q.id } })).departmentId).toBe(
      world.acme.id,
    );
  });

  it('admin bodies reject unknown fields too', async () => {
    const admin = world.users.admin;
    expect(
      (
        await as(admin, 'post', '/api/admin/users', {
          email: 'x@test.dev',
          name: 'X',
          password: 'long-enough-pw',
          role: 'USER',
          id: RANDOM,
        })
      ).status,
    ).toBe(400);
    expect(
      (await as(admin, 'post', '/api/admin/clients', { name: 'Zed', deletedAt: '2020-01-01' }))
        .status,
    ).toBe(400);
    expect(
      (
        await as(admin, 'patch', `/api/admin/technologies/${world.tags.get('technology:react')}`, {
          label: 'X',
          archivedAt: null,
        })
      ).status,
    ).toBe(400);
  });
});

describe('B5 soft-deleted and archived things stay gone, for everyone including admins', () => {
  it('a deleted question is 404 on every route and absent from search, even for the admin who deleted it', async () => {
    const q = await addQuestion(db, world, {
      text: 'Delete me please',
      authorId: world.users.authorA.id,
    });
    await as(world.users.admin, 'delete', `/api/questions/${q.id}`).expect(204);
    for (const [m, p, b] of [
      ['get', `/api/questions/${q.id}`],
      ['get', `/api/questions/${q.id}/history`],
      ['patch', `/api/questions/${q.id}`, { text: 'revived?' }],
      ['post', `/api/questions/${q.id}/review`, { decision: 'APPROVED' }],
      ['delete', `/api/questions/${q.id}`],
    ] as [Method, string, object?][]) {
      expect((await as(world.users.admin, m, p, b)).status, `${m} ${p}`).toBe(404);
    }
    expect((await as(world.users.admin, 'get', '/api/questions?q=Delete')).body.items).toEqual([]);
  });

  it('a deleted department cannot be granted, edited, or used for new questions', async () => {
    await as(world.users.admin, 'delete', `/api/admin/clients/${world.acme.id}`).expect(204);
    expect(
      (
        await as(world.users.admin, 'put', `/api/admin/users/${world.users.plain.id}/clients`, {
          clientIds: [world.acme.id],
        })
      ).status,
    ).toBeGreaterThanOrEqual(400);
    expect(
      (
        await as(world.users.admin, 'patch', `/api/admin/clients/${world.acme.id}`, {
          name: 'Zombie',
        })
      ).status,
    ).toBe(404);
    expect(
      (await as(world.users.admin, 'get', `/api/admin/clients/${world.acme.id}/technologies`))
        .status,
    ).toBe(404);
    expect(
      (
        await as(world.users.admin, 'post', '/api/questions', {
          text: 'Into a deleted dept',
          clientId: world.acme.id,
        })
      ).status,
    ).toBe(404);
    // the department's own users no longer see it
    expect((await as(world.users.authorAcme, 'get', '/api/clients')).body.items).toEqual([]);
  });

  it("a deleted user's existing session stops working and the account cannot be edited", async () => {
    await as(world.users.admin, 'delete', `/api/admin/users/${world.users.authorB.id}`).expect(204);
    expect((await as(world.users.authorB, 'get', '/api/auth/me')).status).toBe(401);
    expect(
      (
        await as(world.users.admin, 'patch', `/api/admin/users/${world.users.authorB.id}`, {
          active: true,
        })
      ).status,
    ).toBe(404);
  });

  it('an archived technology cannot be attached to a new question', async () => {
    await db.tag.update({
      where: { id: world.tags.get('technology:react')! },
      data: { archivedAt: new Date() },
    });
    const res = await as(world.users.authorAcme, 'post', '/api/questions', {
      text: 'Uses an archived tag',
      clientId: world.acme.id,
      tags: ['technology:react'],
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('TAG_ARCHIVED');
  });

  it("a technology outside the question's department cannot be attached, on create or on edit", async () => {
    const create = await as(world.users.authorGlobex, 'post', '/api/questions', {
      text: 'Node in Globex',
      clientId: world.globex.id,
      tags: ['technology:nodejs'],
    });
    expect(create.body.error?.code).toBe('TAG_NOT_IN_DEPARTMENT');
    const q = await addQuestion(db, world, {
      text: 'Globex question',
      authorId: world.users.authorGlobex.id,
      clientId: world.globex.id,
      tags: ['technology:react'],
    });
    const edit = await as(world.users.authorGlobex, 'patch', `/api/questions/${q.id}`, {
      tags: ['technology:react', 'technology:nodejs'],
    });
    expect(edit.body.error?.code).toBe('TAG_NOT_IN_DEPARTMENT');
  });
});

describe('B6 restore routes cannot be abused', () => {
  it('only an admin can restore, and only things that are actually deleted', async () => {
    const q = await addQuestion(db, world, {
      text: 'Not deleted at all',
      authorId: world.users.authorA.id,
    });
    expect(
      (await as(world.users.admin, 'post', `/api/admin/questions/${q.id}/restore`)).status,
    ).toBe(404);
    expect(
      (await as(world.users.admin, 'post', `/api/admin/clients/${world.acme.id}/restore`)).status,
    ).toBe(404);
    await as(world.users.admin, 'delete', `/api/questions/${q.id}`).expect(204);
    expect(
      (await as(world.users.authorA, 'post', `/api/admin/questions/${q.id}/restore`)).status,
    ).toBe(403);
    expect(
      (await as(world.users.admin, 'post', `/api/admin/questions/${q.id}/restore`)).status,
    ).toBe(204);
  });

  it("restoring a department does not widen anyone's access beyond the grants they already had", async () => {
    await as(world.users.admin, 'delete', `/api/admin/clients/${world.acme.id}`).expect(204);
    await as(world.users.admin, 'post', `/api/admin/clients/${world.acme.id}/restore`).expect(200);
    expect(
      (await as(world.users.authorGlobex, 'get', '/api/clients')).body.items.map(
        (c: { name: string }) => c.name,
      ),
    ).toEqual(['Globex']);
    expect((await as(world.users.plain, 'get', '/api/clients')).body.items).toEqual([]);
  });
});
