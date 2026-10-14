import type { RequestHandler } from 'express';
import { AppError } from './errors.js';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Second CSRF layer on top of SameSite=Strict cookies (ADR-006): a browser always sends Origin on
 * cross-origin unsafe requests, so reject any whose Origin is not allow-listed. A missing Origin
 * means a non-browser client (curl, tests), which cannot be CSRF'd with our cookies.
 */
export const originCheck =
  (allowed: string[]): RequestHandler =>
  (req, _res, next) => {
    const origin = req.get('origin');
    if (!SAFE.has(req.method) && origin && !allowed.includes(origin)) {
      throw new AppError(403, 'BAD_ORIGIN', 'Origin not allowed');
    }
    next();
  };
