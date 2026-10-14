import express from 'express';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../src/http/app.js';
import { AppError, errorHandler } from '../src/http/errors.js';
import { createDb } from '../src/db/prisma.js';
import { captureLogger, makeDb, testConfig } from './helpers.js';

const db = makeDb();
// Nothing listens on port 1, so every query against this client fails.
const deadDb = createDb('postgresql://x:y@127.0.0.1:1/z');

const build = (useDb = db) => {
  const { logger, lines } = captureLogger();
  return { app: createApp({ config: testConfig(), logger, db: useDb }), lines };
};

describe('app foundation', () => {
  afterAll(() => db.$disconnect());

  it('GET /api/health is 200 when the db answers', async () => {
    const res = await request(build().app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /api/health is 503 when the db is down, without leaking the reason', async () => {
    const res = await request(build(deadDb).app).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'unavailable' });
  });

  it('unknown routes return the uniform JSON 404', async () => {
    const res = await request(build().app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found' } });
  });

  it('malformed JSON is a 400, not a 500', async () => {
    const res = await request(build().app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"a":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  it('sets its own X-Request-Id and ignores a client-supplied one', async () => {
    const res = await request(build().app).get('/api/health').set('X-Request-Id', 'forged');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('sets security headers and hides x-powered-by', async () => {
    const res = await request(build().app).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
  });

  it('never logs cookie or authorization header values', async () => {
    const { app, lines } = build();
    await request(app)
      .get('/api/health')
      .set('Cookie', 'access_token=SECRET-COOKIE-VALUE')
      .set('Authorization', 'Bearer SECRET-BEARER');
    const out = lines.join('');
    expect(out).toContain('"msg"'); // something was logged
    expect(out).not.toContain('SECRET-COOKIE-VALUE');
    expect(out).not.toContain('SECRET-BEARER');
  });
});

describe('errorHandler', () => {
  const mini = (thrower: () => never) => {
    const { logger, lines } = captureLogger();
    const app = express();
    app.get('/x', () => thrower());
    app.use(errorHandler(logger));
    return { app, lines };
  };

  it('maps AppError to its status/code/message', async () => {
    const { app } = mini(() => {
      throw new AppError(409, 'CONFLICT', 'nope', { hint: 1 });
    });
    const res = await request(app).get('/x');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: { code: 'CONFLICT', message: 'nope', hint: 1 } });
  });

  it('maps ZodError to 400 with issues', async () => {
    const { app } = mini(() => {
      z.object({ text: z.string().min(1) }).parse({ text: '' });
      throw new Error('unreachable');
    });
    const res = await request(app).get('/x');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.issues[0].path).toBe('text');
  });

  it('turns unknown errors into a generic 500: no message, no stack, logged server-side', async () => {
    const { app, lines } = mini(() => {
      throw new Error('relation "question" does not exist');
    });
    const res = await request(app).get('/x');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: { code: 'INTERNAL', message: 'Internal server error' } });
    expect(JSON.stringify(res.body)).not.toMatch(/relation|stack/);
    expect(lines.join('')).toContain('relation \\"question\\" does not exist');
  });
});
