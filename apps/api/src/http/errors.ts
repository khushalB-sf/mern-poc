import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { Logger } from 'pino';
import { ZodError } from 'zod';

/** Error that is safe to show to the client. Anything else becomes a generic 500. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export const badRequest = (message: string, extra?: Record<string, unknown>) =>
  new AppError(400, 'BAD_REQUEST', message, extra);
export const unauthorized = (message = 'Authentication required') =>
  new AppError(401, 'UNAUTHENTICATED', message);
export const forbidden = (message = 'You are not allowed to do this') =>
  new AppError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Not found') => new AppError(404, 'NOT_FOUND', message);

type Body = { error: { code: string; message: string } & Record<string, unknown> };

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } } satisfies Body);
};

export function errorHandler(logger: Logger): ErrorRequestHandler {
  // Express identifies error handlers by arity, so `_next` must stay.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (err, req, res, _next) => {
    if (res.headersSent) return;
    const send = (status: number, error: Body['error']) => res.status(status).json({ error });

    if (err instanceof AppError) {
      return send(err.status, { code: err.code, message: err.message, ...err.extra });
    }
    if (err instanceof ZodError) {
      const issues = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      return send(400, { code: 'VALIDATION_ERROR', message: 'Invalid request', issues });
    }
    // body-parser errors carry a `type`
    const type = (err as { type?: string }).type;
    if (type === 'entity.parse.failed') {
      return send(400, { code: 'INVALID_JSON', message: 'Request body is not valid JSON' });
    }
    if (type === 'entity.too.large') {
      return send(413, { code: 'PAYLOAD_TOO_LARGE', message: 'Request body too large' });
    }

    // Unknown error: log the detail server-side, tell the client nothing.
    (req.log ?? logger).error({ err }, 'unhandled error');
    return send(500, { code: 'INTERNAL', message: 'Internal server error' });
  };
}
