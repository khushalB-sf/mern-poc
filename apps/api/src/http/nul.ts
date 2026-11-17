import type { RequestHandler } from 'express';
import { AppError } from './errors.js';

/** Postgres text cannot hold a NUL byte; left alone it surfaces as an unhandled database error (500). */
const hasNul = (v: unknown): boolean => {
  if (typeof v === 'string') return v.includes('\u0000');
  if (Array.isArray(v)) return v.some(hasNul);
  if (v && typeof v === 'object') {
    return Object.entries(v).some(([k, x]) => k.includes('\u0000') || hasNul(x));
  }
  return false;
};

/** One gate for every string in the body and query, so no individual schema can forget it. */
export const rejectNul: RequestHandler = (req, _res, next) => {
  if (hasNul(req.body) || hasNul(req.query)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid request');
  }
  next();
};
