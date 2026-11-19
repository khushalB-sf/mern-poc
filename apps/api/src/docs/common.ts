import { z } from 'zod';

// Request bodies come straight from the Zod schemas the API validates with, so they cannot drift.
export const bodySchema = (schema: z.ZodType) => {
  const out = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Record<
    string,
    unknown
  >;
  delete out.$schema;
  return out;
};

export const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
export const json = (schema: object) => ({ 'application/json': { schema } });
export const errorResponse = (description: string, code: string, message: string) => ({
  description,
  content: {
    'application/json': { schema: ref('Error'), example: { error: { code, message } } },
  },
});

export const R = {
  400: errorResponse(
    'Validation failed (before any business logic runs)',
    'VALIDATION_ERROR',
    'Invalid request',
  ),
  401: errorResponse('No valid access cookie', 'UNAUTHENTICATED', 'Authentication required'),
  403: errorResponse(
    'Authenticated, but your role may not do this',
    'FORBIDDEN',
    'You are not allowed to do this',
  ),
  '404Question': errorResponse(
    'Question does not exist OR you are not permitted to see it. The two cases are deliberately identical (same status, headers and body).',
    'NOT_FOUND',
    'Question not found',
  ),
  429: errorResponse('Rate limited', 'RATE_LIMITED', 'Too many requests, slow down'),
};

export const idParam = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
};
export const tagIdParam = {
  name: 'tagId',
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
};
export const secured = [{ cookieAuth: [] }];
