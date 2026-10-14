import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { MANIFEST, PASSWORD, buildWorld, makeApp, makeDb, resetDb } from './helpers.js';

const db = makeDb();
const { app } = makeApp(db);
afterAll(() => db.$disconnect());

type Spec = {
  openapi: string;
  servers: { url: string }[];
  paths: Record<string, Record<string, { responses: Record<string, unknown> }>>;
  components: {
    schemas: Record<string, { properties?: Record<string, unknown>; required?: string[] }>;
  };
};
const getSpec = async () => (await request(app).get('/api/openapi.json')).body as Spec;

// "/api/questions/<uuid>/history" -> "/questions/{id}/history", relative to the spec's server url (/api)
const toSpecPath = (p: string) =>
  p.replace(/^\/api/, '').replace(/[0-9a-f]{8}-[0-9a-f-]{27}/, '{id}');

describe('OpenAPI document', () => {
  it('is served as OpenAPI 3.1 JSON', async () => {
    const res = await request(app).get('/api/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.1.0');
    expect(res.body.servers).toEqual([{ url: '/api' }]);
  });

  it('documents every API route and nothing that does not exist', async () => {
    const spec = await getSpec();
    const documented = Object.entries(spec.paths)
      .flatMap(([path, ops]) => Object.keys(ops).map((m) => `${m} ${path}`))
      .sort();
    const apiRoutes = MANIFEST.filter(
      ([, p]) => !p.startsWith('/api/docs') && p !== '/api/openapi.json',
    )
      .map(([m, p]) => `${m} ${toSpecPath(p)}`)
      .sort();
    expect(documented).toEqual(apiRoutes);
  });

  it('request bodies are generated from the validation schemas (no drift)', async () => {
    const { schemas } = (await getSpec()).components;
    expect(schemas.CreateQuestionBody!.required).toEqual(['text']);
    expect(Object.keys(schemas.CreateQuestionBody!.properties!)).toEqual(
      expect.arrayContaining(['text', 'answerNotes', 'clientId', 'tags', 'confirmNotDuplicate']),
    );
    // clientId is immutable, so it must not be editable through PATCH
    expect(Object.keys(schemas.PatchQuestionBody!.properties!)).toEqual([
      'text',
      'answerNotes',
      'tags',
    ]);
    expect(schemas.LoginBody!.properties).toHaveProperty('password');
  });

  it('documents the security-relevant responses', async () => {
    const { paths } = await getSpec();
    expect(Object.keys(paths['/questions']!.post!.responses)).toEqual(
      expect.arrayContaining(['201', '400', '401', '403', '404', '409']),
    );
    expect(Object.keys(paths['/questions/{id}']!.patch!.responses)).toEqual(
      expect.arrayContaining(['200', '400', '401', '403', '404']),
    );
  });

  it('contains no credentials or secrets', async () => {
    const text = JSON.stringify(await getSpec());
    expect(text).not.toContain(PASSWORD);
    expect(text).not.toMatch(/passw0rd|secret/i);
  });
});

describe('Swagger UI', () => {
  it('serves the page with no inline script (compatible with the CSP)', async () => {
    const res = await request(app).get('/api/docs');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toContain('swagger-ui-bundle.js');
    expect(res.text).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/); // every <script> has a src
    expect(res.headers['content-security-policy']).toContain("script-src 'self'");
  });

  it('serves its assets and init script from the same origin', async () => {
    expect((await request(app).get('/api/docs/assets/swagger-ui-bundle.js')).status).toBe(200);
    expect((await request(app).get('/api/docs/assets/swagger-ui.css')).status).toBe(200);
    const init = await request(app).get('/api/docs/init.js');
    expect(init.status).toBe(200);
    expect(init.text).toContain('/api/openapi.json');
  });

  it('can be switched off', async () => {
    const { app: off } = makeApp(db, { DOCS_ENABLED: 'false' });
    expect((await request(off).get('/api/docs')).status).toBe(404);
    expect((await request(off).get('/api/openapi.json')).status).toBe(404);
  });
});

describe('Try-it-out from the docs page (same-origin cookie login)', () => {
  it('a POST whose Origin is the API itself is accepted; a foreign Origin is still rejected', async () => {
    await resetDb(db);
    await buildWorld(db);
    const body = { email: 'authora@test.dev', password: PASSWORD };
    const own = await request(app)
      .post('/api/auth/login')
      .set('Host', 'localhost:4000')
      .set('Origin', 'http://localhost:4000')
      .send(body);
    expect(own.status).toBe(200);
    const evil = await request(app)
      .post('/api/auth/login')
      .set('Host', 'localhost:4000')
      .set('Origin', 'https://evil.example')
      .send(body);
    expect(evil.status).toBe(403);
  });
});
