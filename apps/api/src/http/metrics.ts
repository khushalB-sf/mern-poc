import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';
import client from 'prom-client';
import { unauthorized } from './errors.js';

/**
 * The matched route pattern ("/api/questions/:id"), never the URL: ids and search terms must not become
 * labels. Express forgets `req.baseUrl` once a router has finished, so each router records it as the
 * request enters (see `recordBase`) and the label is put together from that and the matched route.
 */
const routeLabel = (req: Request, res: Response) => {
  const base = (res.locals.routeBase as string | undefined) ?? '';
  const path = req.route?.path;
  if (typeof path === 'string') return `${base}${path}`.replace(/\/+$/, '') || 'unmatched';
  // Stopped by a router-level gate (auth, rate limit) before any route matched: the router is still known.
  return base && base !== '/api' ? base : 'unmatched';
};

/** Mount this in front of a router: it notes where the router lives, for the metrics label. */
export const recordBase: RequestHandler = (req, res, next) => {
  res.locals.routeBase = req.baseUrl;
  next();
};

const AUTH_ROUTES = new Set(['/api/auth/login', '/api/auth/refresh']);

const digest = (s: string) => createHash('sha256').update(s).digest();

/** One registry per app (tests build many). Labels are method, route pattern and status: low cardinality by design. */
export function createMetrics(token: string | undefined) {
  const registry = new client.Registry();
  client.collectDefaultMetrics({ register: registry });
  const labelNames = ['method', 'route', 'status'];
  const requests = new client.Counter({
    name: 'http_requests_total',
    help: 'HTTP requests by method, route pattern and status',
    labelNames,
    registers: [registry],
  });
  const duration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames,
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [registry],
  });
  const authFailures = new client.Counter({
    name: 'auth_failures_total',
    help: 'Failed sign-in, second-factor and refresh attempts',
    labelNames: ['route'],
    registers: [registry],
  });
  const rateLimited = new client.Counter({
    name: 'rate_limited_total',
    help: 'Requests refused by a rate limit',
    labelNames: ['route'],
    registers: [registry],
  });

  const middleware: RequestHandler = (req, res, next) => {
    const stop = duration.startTimer();
    res.on('finish', () => {
      const route = routeLabel(req, res);
      const labels = { method: req.method, route, status: String(res.statusCode) };
      requests.inc(labels);
      stop(labels);
      if (res.statusCode === 429) rateLimited.inc({ route });
      if (res.statusCode === 401 && AUTH_ROUTES.has(route)) authFailures.inc({ route });
    });
    next();
  };

  /** Bearer token, compared in constant time. Anything else is the same 401. */
  const handler: RequestHandler = async (req, res, next) => {
    if (!token) return next(); // not configured: the endpoint does not exist
    const given = /^Bearer (.+)$/.exec(req.get('authorization') ?? '')?.[1] ?? '';
    if (!timingSafeEqual(digest(given), digest(token))) throw unauthorized();
    res.type(registry.contentType).send(await registry.metrics());
  };

  return { middleware, handler };
}
