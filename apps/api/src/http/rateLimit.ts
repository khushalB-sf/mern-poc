import type { RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit, type Options, type Store } from 'express-rate-limit';

// Counters live in memory (per process) unless server.ts hands in a shared store (REDIS_URL), so that several
// API processes count together. Each limiter needs its own key prefix; they are numbered in creation order,
// which is the same on every app built from the same code.
let makeStore: ((prefix: string) => Store) | undefined;
let seq = 0;
export function useRateLimitStore(factory: ((prefix: string) => Store) | undefined) {
  makeStore = factory;
}
/** Called when an app starts building its limiters, so the numbering starts at 0 for every app. */
export const restartLimiterNumbering = () => {
  seq = 0;
};

/** express-rate-limit with the shared store when there is one. If the store is down, requests pass (fail open). */
export const limiter = (opts: Partial<Options>) =>
  rateLimit(
    makeStore ? { ...opts, store: makeStore(`rl:${seq++}:`), passOnStoreError: true } : opts,
  );

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
  limiter({ ...options(limit, message), keyGenerator: (req) => req.user!.id });

/** Per client address, for endpoints where nobody is signed in yet. */
export const perIpLimit = (limit: number, message = 'Too many requests, slow down') =>
  limiter({ ...options(limit, message), keyGenerator: (req) => ipKeyGenerator(req.ip ?? '') });

/** A custom key and window, for things like "5 wrong codes per step-up token". */
export const perKeyLimit = (
  limit: number,
  windowMs: number,
  key: (req: Parameters<RequestHandler>[0]) => string,
  message = 'Too many attempts, try again later',
) => limiter({ ...options(limit, message), windowMs, keyGenerator: key });
