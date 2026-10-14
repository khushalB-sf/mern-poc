import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import type { Config } from '../config/env.js';
import type { Db } from '../db/prisma.js';
import { authRoutes } from '../modules/auth/routes.js';
import { clientRoutes } from '../modules/clients/routes.js';
import { questionRoutes } from '../modules/questions/routes.js';
import { tagRoutes } from '../modules/tags/routes.js';
import { originCheck } from './csrf.js';
import { errorHandler, notFoundHandler } from './errors.js';

export interface AppDeps {
  config: Config;
  logger: Logger;
  db: Db;
}

export function createApp({ config, logger, db }: AppDeps): Express {
  const app = express();

  // Behind nginx: take the client IP from X-Forwarded-For (one hop) so rate limits key on it.
  app.set('trust proxy', 1);

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
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(originCheck(config.ALLOWED_ORIGINS));

  const api = express.Router();
  api.get('/health', async (_req, res) => {
    try {
      await db.$queryRaw`SELECT 1`;
      res.json({ status: 'ok' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });
  api.use('/auth', authRoutes(db, config));
  api.use('/questions', questionRoutes(db, config));
  api.use('/tags', tagRoutes(db, config));
  api.use('/clients', clientRoutes(db, config));
  app.use('/api', api);

  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}
