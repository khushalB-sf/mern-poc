import type { RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';

// ponytail: in-memory store, so limits are per process. Use a shared store (Redis) if the API scales out.
// Rate-limit headers are off on purpose: a decrementing `RateLimit-Remaining` would make a hidden search
// result and a genuinely empty one look different (SEC-04).
const options = (limit: number, message: string) => ({
  windowMs: 60_000,
  limit,
  standardHeaders: false as const,
  legacyHeaders: false,
  handler: ((_req, res) => {
    res.status(429).json({ error: { code: 'RATE_LIMITED', message } });
  }) as RequestHandler,
});

/** Per signed-in user. Mount after `requireAuth`. */
export const perUserLimit = (limit: number, message = 'Too many requests, slow down') =>
  rateLimit({ ...options(limit, message), keyGenerator: (req) => req.user!.id });

/** Per client address, for endpoints where nobody is signed in yet. */
export const perIpLimit = (limit: number, message = 'Too many requests, slow down') =>
  rateLimit({ ...options(limit, message), keyGenerator: (req) => ipKeyGenerator(req.ip ?? '') });
