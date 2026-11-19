/**
 * The OpenAPI document and the real responses must agree: every call below is made for real, then its status
 * must be a documented one and its JSON body must match the documented schema, with no field the document
 * does not mention (so a leaked or renamed field fails here, not in production).
 */
import { Ajv } from 'ajv';
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
type Schema = {
  $ref?: string;
  type?: string | string[];
  oneOf?: Schema[];
  anyOf?: Schema[];
  items?: Schema;
  properties?: Record<string, Schema>;
  additionalProperties?: unknown;
};
type Doc = {
  components: { schemas: Record<string, Schema> };
  paths: Record<
    string,
    Record<string, { responses: Record<string, { content?: Record<string, { schema: Schema }> }> }>
  >;
};
let spec: Doc;
let ajv: Ajv;
beforeAll(async () => {
  await resetDb(db);
  world = await buildWorld(db);
  spec = (await request(app).get('/api/openapi.json')).body;
  ajv = new Ajv({ strict: false, validateFormats: false, allErrors: true });
  ajv.addSchema({ ...spec, $id: 'spec' });
});
afterAll(() => db.$disconnect());

const resolve = (s: Schema | undefined): Schema | undefined => {
  if (s?.$ref) return resolve(spec.components.schemas[String(s.$ref).split('/').pop()!]);
  // "null or an object": the object side is the one whose fields can be checked
  const alt = (s?.oneOf ?? s?.anyOf)?.find((a) => a.type !== 'null');
  return alt ? resolve(alt) : s;
};

/** Paths of keys in `value` that `schema` does not declare. */
function undeclared(schema: Schema | undefined, value: unknown, at = '$'): string[] {
  const s = resolve(schema);
  if (!s || value === null || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap((v, i) => undeclared(s.items, v, `${at}[${i}]`));
  const props = s.properties ?? {};
  return Object.entries(value).flatMap(([k, v]) =>
    k in props
      ? undeclared(props[k], v, `${at}.${k}`)
      : s.additionalProperties
        ? []
        : [`${at}.${k}`],
  );
}

type Actor = { id: string };
const problems: string[] = [];
afterAll(() => expect(problems).toEqual([]));
async function call(
  method: 'get' | 'post' | 'patch' | 'put' | 'delete',
  path: string,
  actor: Actor,
  opts: { body?: object; spec?: string } = {},
) {
  const res = await request(app)[method](path).set('Cookie', cookieFor(actor.id)).send(opts.body);
  const specPath = (opts.spec ?? path.split('?')[0]!).replace(/^\/api/, '');
  const label = `${method} ${specPath} -> ${res.status}`;
  const doc = spec.paths[specPath]?.[method]?.responses[String(res.status)];
  if (!doc) {
    problems.push(`${label}: not documented (${JSON.stringify(res.body).slice(0, 120)})`);
    return res;
  }
  const schema = doc.content?.['application/json']?.schema;
  if (schema && Object.keys(res.body).length) {
    const ref = `spec#/paths/${specPath.replace(/\//g, '~1')}/${method}/responses/${res.status}/content/application~1json/schema`;
    const check = ajv.compile({ $ref: ref });
    if (!check(res.body)) problems.push(`${label}: ${ajv.errorsText(check.errors)}`);
    for (const u of undeclared(schema, res.body))
      problems.push(`${label}: undocumented field ${u}`);
  }
  return res;
}

describe('responses match the OpenAPI document', () => {
  it('signed-in basics', async () => {
    const admin = world.users.admin;
    await call('get', '/api/auth/me', admin);
    await call('get', '/api/tags', admin);
    await call('get', '/api/clients', admin);
    await call('get', '/api/notifications', admin);
  });

  it('questions: create, list, read, history, edit, review, delete, summary', async () => {
    const author = world.users.authorAcme;
    const created = await call('post', '/api/questions', author, {
      body: {
        text: 'What is a closure in JavaScript?',
        answerNotes: 'A function plus its scope.',
        clientId: world.acme.id,
        tags: ['technology:react', 'seniority:mid'],
      },
    });
    expect(created.status).toBe(201);
    const id = created.body.question.id;
    await call('get', '/api/questions?limit=5', author);
    await call('get', '/api/questions/summary', author);
    await call('get', `/api/questions/${id}`, author, { spec: '/questions/{id}' });
    await call('get', `/api/questions/${id}/history`, author, { spec: '/questions/{id}/history' });
    await call('patch', `/api/questions/${id}`, author, {
      spec: '/questions/{id}',
      body: { text: 'What is a closure in JavaScript, exactly?' },
    });
    const reviewed = await call('post', `/api/questions/${id}/review`, world.users.reviewer, {
      spec: '/questions/{id}/review',
      body: { decision: 'REJECTED', note: 'Needs an example' },
    });
    expect(reviewed.status).toBe(200);
    await call('get', '/api/notifications', author);
    await call('post', '/api/notifications/read', author, { body: { all: true } });
    await call('delete', `/api/questions/${id}`, author, { spec: '/questions/{id}' });
  });

  it('error bodies: not found, validation, unauthenticated, forbidden', async () => {
    const u = world.users.authorA;
    const missing = '22222222-2222-4222-8222-222222222222';
    await call('get', `/api/questions/${missing}`, u, { spec: '/questions/{id}' });
    await call('post', '/api/questions', u, { body: { text: '' } });
    await call('get', '/api/admin/users', u);
    const anon = await request(app).get('/api/questions');
    expect(anon.status).toBe(401);
  });

  it('admin: users, departments, technologies, tags, audit, deleted questions', async () => {
    const admin = world.users.admin;
    await call('get', '/api/admin/users', admin);
    const user = await call('post', '/api/admin/users', admin, {
      body: {
        email: 'new.person@test.dev',
        name: 'New Person',
        password: 'a-long-password-1',
        role: 'USER',
        clientIds: [world.acme.id],
      },
    });
    const uid = user.body.user.id;
    await call('patch', `/api/admin/users/${uid}`, admin, {
      spec: '/admin/users/{id}',
      body: { name: 'Renamed' },
    });
    await call('put', `/api/admin/users/${uid}/clients`, admin, {
      spec: '/admin/users/{id}/clients',
      body: { clientIds: [world.globex.id] },
    });
    await call('delete', `/api/admin/users/${uid}`, admin, { spec: '/admin/users/{id}' });
    await call('post', `/api/admin/users/${uid}/restore`, admin, {
      spec: '/admin/users/{id}/restore',
    });

    await call('get', '/api/admin/clients', admin);
    const dept = await call('post', '/api/admin/clients', admin, {
      body: { name: 'Initech', description: 'TPS' },
    });
    const did = dept.body.client.id;
    await call('patch', `/api/admin/clients/${did}`, admin, {
      spec: '/admin/clients/{id}',
      body: { description: 'Reports' },
    });
    await call('get', `/api/admin/clients/${did}/impact`, admin, {
      spec: '/admin/clients/{id}/impact',
    });
    const tech = await call('post', `/api/admin/clients/${did}/technologies`, admin, {
      spec: '/admin/clients/{id}/technologies',
      body: { label: 'Rust' },
    });
    await call('get', `/api/admin/clients/${did}/technologies`, admin, {
      spec: '/admin/clients/{id}/technologies',
    });
    await call('get', '/api/admin/technologies/other', admin);
    const tid = tech.body.technology?.id ?? tech.body.tag?.id;
    if (tid)
      await call('patch', `/api/admin/technologies/${tid}`, admin, {
        spec: '/admin/technologies/{id}',
        body: { label: 'Rust lang' },
      });
    await call('delete', `/api/admin/clients/${did}`, admin, { spec: '/admin/clients/{id}' });
    await call('post', `/api/admin/clients/${did}/restore`, admin, {
      spec: '/admin/clients/{id}/restore',
    });

    await call('get', '/api/admin/tag-categories', admin);
    await call('post', '/api/admin/tag-categories/seniority/tags', admin, {
      spec: '/admin/tag-categories/{slug}/tags',
      body: { label: 'Staff' },
    });
    const q = await addQuestion(db, world, {
      text: 'Deleted one',
      authorId: world.users.authorA.id,
    });
    await call('delete', `/api/questions/${q.id}`, admin, { spec: '/questions/{id}' });
    await call('get', '/api/admin/deleted-questions', admin);
    await call('post', `/api/admin/questions/${q.id}/restore`, admin, {
      spec: '/admin/questions/{id}/restore',
    });
    await call('get', '/api/admin/audit?limit=5', admin);
  });
});
