import { Router, type RequestHandler } from 'express';
import { ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import type { Config } from '../../config/env.js';
import type { Db } from '../../db/prisma.js';
import { AppError, unauthorized } from '../../http/errors.js';
import { limiter, perIpLimit, perKeyLimit, perUserLimit } from '../../http/rateLimit.js';
import { validateBody } from '../../http/validate.js';
import { REFRESH_COOKIE, clearAuthCookies, setAuthCookies } from './cookies.js';
import { changePassword, resetPassword } from './credentials.js';
import { createMfa } from './mfa.js';
import { verifyMfaToken } from './mfaCrypto.js';
import { requireAuth } from './middleware.js';
import { createAuthService } from './service.js';

export const changePasswordSchema = z.strictObject({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(1).max(200),
});
export const resetPasswordSchema = z.strictObject({
  token: z.string().min(1).max(200),
  newPassword: z.string().min(1).max(200),
});

export const mfaCodeSchema = z.strictObject({ code: z.string().min(1).max(32) });
export const mfaDisableSchema = z.strictObject({
  password: z.string().min(1).max(200),
  code: z.string().min(1).max(32),
});
export const mfaVerifySchema = z.strictObject({
  mfaToken: z.string().min(1).max(2000),
  code: z.string().min(1).max(32),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  // Upper bound keeps Argon2 from being used as a CPU-exhaustion lever.
  password: z.string().min(1).max(200),
});

export function authRoutes(db: Db, config: Config) {
  const router = Router();
  const service = createAuthService(db, config);

  const tooMany: RequestHandler = (_req, res) => {
    res
      .status(429)
      .json({ error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again later' } });
  };

  const loginLimiter = limiter({
    windowMs: 60_000,
    limit: config.RATE_LIMIT_LOGIN_PER_MIN,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? '')}|${req.body?.email ?? ''}`,
    handler: tooMany,
  });

  // Per IP regardless of email: the per-email limit alone is bypassed by trying a different email each time.
  const ipLimiter = limiter({
    windowMs: 60_000,
    limit: config.RATE_LIMIT_LOGIN_IP_PER_MIN,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(req.ip ?? ''),
    handler: tooMany,
  });

  // No user is known yet when these are called, so the allowance is per client address.
  const sessionLimit = perIpLimit(config.RATE_LIMIT_AUTH_PER_MIN);

  router.post('/login', ipLimiter, validateBody(loginSchema), loginLimiter, async (req, res) => {
    const result = await service.login(req.body.email, req.body.password);
    if ('mfaRequired' in result) {
      res.json(result); // no cookies yet: the step-up token only lets them send a code
      return;
    }
    setAuthCookies(res, config, result.access, result.refresh); // tokens travel only in cookies, never the body
    res.json({ user: result.user });
  });

  // Second step of a two-factor sign-in. The IP limit is shared with refresh/logout; on top of that a
  // step-up token gets a handful of tries, so a six-digit code cannot be brute-forced inside its window.
  const mfa = createMfa(db, config);
  const mfaTokenOwner: RequestHandler = (req, res, next) => {
    const claims = verifyMfaToken(config.JWT_REFRESH_SECRET, req.body.mfaToken);
    if (!claims) throw unauthorized('Sign in again');
    res.locals.mfaUserId = claims.userId;
    next();
  };
  router.post(
    '/mfa/verify',
    sessionLimit,
    validateBody(mfaVerifySchema),
    mfaTokenOwner,
    perKeyLimit(5, 5 * 60_000, (req) => String(req.body.mfaToken).slice(-32)),
    async (req, res) => {
      const userId = res.locals.mfaUserId as string;
      // The code is checked first, but a disabled or deleted account still gets nothing.
      if (!(await mfa.checkCode(db, userId, req.body.code))) {
        throw new AppError(401, 'INVALID_MFA_CODE', 'That code is not right. Try the next one.');
      }
      const { user, access, refresh } = await service.loginAfterMfa(userId);
      setAuthCookies(res, config, access, refresh);
      res.json({ user });
    },
  );

  const enrolment = requireAuth(db, config, {
    allowPasswordChange: true,
    allowMfaEnrollment: true,
  });
  router.post('/mfa/setup', enrolment, async (req, res) => {
    res.json(await mfa.setup(req.user!));
  });
  router.post('/mfa/enable', enrolment, validateBody(mfaCodeSchema), async (req, res) => {
    res.json({ recoveryCodes: await mfa.enable(req.log, req.user!, req.body.code) });
  });
  router.post(
    '/mfa/disable',
    requireAuth(db, config),
    perUserLimit(10, 'Too many attempts, try again later'),
    validateBody(mfaDisableSchema),
    async (req, res) => {
      await mfa.disable(req.log, req.user!, req.body);
      res.status(204).end();
    },
  );

  router.post('/refresh', sessionLimit, async (req, res) => {
    const { access, refresh } = await service.refresh(req.cookies?.[REFRESH_COOKIE]);
    setAuthCookies(res, config, access, refresh);
    res.status(204).end();
  });

  router.post('/logout', sessionLimit, async (req, res) => {
    await service.logout(req.cookies?.[REFRESH_COOKIE]);
    clearAuthCookies(res, config);
    res.status(204).end();
  });

  // Guessing the current password with a stolen session must not be quick.
  const changeLimit = perUserLimit(10, 'Too many attempts, try again later');
  router.post(
    '/change-password',
    requireAuth(db, config, { allowPasswordChange: true, allowMfaEnrollment: true }),
    changeLimit,
    validateBody(changePasswordSchema),
    async (req, res) => {
      await changePassword(db, req.log, req.user!, req.sessionId!, req.body);
      res.status(204).end();
    },
  );

  // Public (the person cannot sign in), so it is limited per address and every failure looks alike.
  router.post(
    '/reset-password',
    sessionLimit,
    validateBody(resetPasswordSchema),
    async (req, res) => {
      await resetPassword(db, req.log, req.body);
      res.status(204).end();
    },
  );

  router.get(
    '/me',
    requireAuth(db, config, { allowPasswordChange: true, allowMfaEnrollment: true }),
    (req, res) => {
      res.json({ user: req.user });
    },
  );

  return router;
}
