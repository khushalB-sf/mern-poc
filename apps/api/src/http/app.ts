import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import express, { type Express, type RequestHandler } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import type { Config } from '../config/env.js';
import type { Db } from '../db/prisma.js';
import { adminRoutes } from '../modules/admin/routes.js';
import { authRoutes } from '../modules/auth/routes.js';
import { clientRoutes } from '../modules/clients/routes.js';
import { notificationRoutes } from '../modules/notifications/routes.js';
import { questionRoutes } from '../modules/questions/routes.js';
import { tagRoutes } from '../modules/tags/routes.js';
import { docsRoutes } from '../docs/routes.js';
import { originCheck } from './csrf.js';
import { createMetrics, recordBase } from './metrics.js';
import { perUserLimit, restartLimiterNumbering } from './rateLimit.js';
import { rejectNul } from './nul.js';
import { errorHandler, notFoundHandler } from './errors.js';

export interface AppDeps {
  config: Config;
  logger: Logger;
  db: Db;
}

export function createApp({ config, logger, db }: AppDeps): Express {
  restartLimiterNumbering();
  const app = express();
  const metrics = createMetrics(config.METRICS_TOKEN);
  app.use(metrics.middleware);

  // Take the client IP from X-Forwarded-For only for as many proxy hops as are configured. The default
  // is none: trusting the header when the API is reachable directly lets a client pick its own
  // rate-limit key. Docker sets 1 (nginx).
  app.set('trust proxy', config.TRUST_PROXY);

  app.use(
    pinoHttp({
      logger,
      // Always generate our own id; never trust a client-supplied one (log forging).
      genReqId: (_req, res) => {
        const id = randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      redact: {
        paths: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
        censor: '[redacted]',
      },
      quietReqLogger: true,
    }),
  );
  app.use(helmet());
  // Authenticated, per-user JSON must not be stored by browsers or shared caches (back button after
  // logout, shared proxies). The Swagger page is static and left alone.
  app.use('/api', (req, res, next) => {
    if (!req.path.startsWith('/docs') && req.path !== '/openapi.json') {
      res.setHeader('Cache-Control', 'no-store');
    }
    next();
  });
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(rejectNul);
  app.use(originCheck(config.ALLOWED_ORIGINS));

  const api = express.Router();
  api.use(recordBase);
  // Liveness: the process answers. Readiness (and the original /health): it can also reach the database.
  api.get('/health/live', (_req, res) => {
    res.json({ status: 'ok' });
  });
  const ready: RequestHandler = async (_req, res) => {
    try {
      await db.$queryRaw`SELECT 1`;
      res.json({ status: 'ok' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  };
  api.get('/health', ready);
  api.get('/health/ready', ready);
  api.get('/metrics', metrics.handler); // 404 unless METRICS_TOKEN is set
  if (config.DOCS_ENABLED) api.use(docsRoutes());
  api.use('/auth', recordBase, authRoutes(db, config));
  api.use('/questions', recordBase, questionRoutes(db, config));
  // One allowance per signed-in user for everything that is not the questions API (which has its own).
  const otherLimit = perUserLimit(config.RATE_LIMIT_OTHER_PER_MIN);
  api.use('/tags', recordBase, tagRoutes(db, config, otherLimit));
  api.use('/clients', recordBase, clientRoutes(db, config, otherLimit));
  api.use('/notifications', recordBase, notificationRoutes(db, config, otherLimit));
  api.use('/admin', recordBase, adminRoutes(db, config, otherLimit));
  app.use('/api', api);

  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}
