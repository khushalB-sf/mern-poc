import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';

/**
 * Validation runs before any handler logic (SEC-01). A failure throws ZodError, which the
 * error handler turns into a 400; the handler and service behind it never run.
 */
export const validateBody =
  (schema: ZodType): RequestHandler =>
  (req, _res, next) => {
    req.body = schema.parse(req.body);
    next();
  };

// Express 5 makes req.query read-only, so parsed query/params go to res.locals.
export const validateQuery =
  (schema: ZodType): RequestHandler =>
  (req, res, next) => {
    res.locals.query = schema.parse(req.query);
    next();
  };

export const validateParams =
  (schema: ZodType): RequestHandler =>
  (req, res, next) => {
    res.locals.params = schema.parse(req.params);
    next();
  };
