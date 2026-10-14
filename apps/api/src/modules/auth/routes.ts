import { Router } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { Config } from '../../config/env.js';
import type { Db } from '../../db/prisma.js';
import { validateBody } from '../../http/validate.js';
import { REFRESH_COOKIE, clearAuthCookies, setAuthCookies } from './cookies.js';
import { requireAuth } from './middleware.js';
import { createAuthService } from './service.js';

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  // Upper bound keeps Argon2 from being used as a CPU-exhaustion lever.
  password: z.string().min(1).max(200),
});

export function authRoutes(db: Db, config: Config) {
  const router = Router();
  const service = createAuthService(db, config);

  // ponytail: in-memory store, so limits are per process. Use a shared store (Redis) if the API scales out.
  const loginLimiter = rateLimit({
    windowMs: 60_000,
    limit: config.RATE_LIMIT_LOGIN_PER_MIN,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? '')}|${req.body?.email ?? ''}`,
    handler: (_req, res) => {
      res
        .status(429)
        .json({ error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again later' } });
    },
  });

  router.post('/login', validateBody(loginSchema), loginLimiter, async (req, res) => {
    const { user, access, refresh } = await service.login(req.body.email, req.body.password);
    setAuthCookies(res, config, access, refresh); // tokens travel only in cookies, never the body
    res.json({ user });
  });

  router.post('/refresh', async (req, res) => {
    const { access, refresh } = await service.refresh(req.cookies?.[REFRESH_COOKIE]);
    setAuthCookies(res, config, access, refresh);
    res.status(204).end();
  });

  router.post('/logout', async (req, res) => {
    await service.logout(req.cookies?.[REFRESH_COOKIE]);
    clearAuthCookies(res, config);
    res.status(204).end();
  });

  router.get('/me', requireAuth(db, config), (req, res) => {
    res.json({ user: req.user });
  });

  return router;
}
