import { z } from 'zod';
import { loginSchema } from '../modules/auth/routes.js';
import { createSchema, patchSchema } from '../modules/questions/routes.js';

// Request bodies come straight from the Zod schemas the API validates with, so they cannot drift.
const bodySchema = (schema: z.ZodType) => {
  const out = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
  delete out.$schema;
  return out;
};

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: object) => ({ 'application/json': { schema } });
const errorResponse = (description: string, code: string, message: string) => ({
  description,
  content: {
    'application/json': { schema: ref('Error'), example: { error: { code, message } } },
  },
});

const R = {
  400: errorResponse('Validation failed (before any business logic runs)', 'VALIDATION_ERROR', 'Invalid request'),
  401: errorResponse('No valid access cookie', 'UNAUTHENTICATED', 'Authentication required'),
  403: errorResponse('Authenticated, but your role may not do this', 'FORBIDDEN', 'You are not allowed to do this'),
  '404Question': errorResponse(
    'Question does not exist OR you are not permitted to see it. The two cases are deliberately identical (same status, headers and body).',
    'NOT_FOUND',
    'Question not found',
  ),
  429: errorResponse('Rate limited', 'RATE_LIMITED', 'Too many requests, slow down'),
};

const idParam = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
};
const secured = [{ cookieAuth: [] }];

export function buildOpenApi() {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Interview Question Bank API',
      version: '0.1.0',
      description: [
        'Shared question bank with client-restricted visibility.',
        '',
        '**Authenticating in this page:** call `POST /auth/login` below with "Try it out". The server sets two httpOnly cookies (`access_token`, `refresh_token`); the browser then sends them automatically on every later "Try it out" call. Tokens never appear in response bodies. Use `POST /auth/logout` to end the session.',
        '',
        '**Visibility guarantee:** a question tied to a client is visible only to users granted that client. The rule is part of the SQL query itself, so a user without the grant gets results indistinguishable from a genuine zero-match, and the same `404` for that question by ID as for a nonexistent one. Counts, tags, history and duplicate matches obey the same rule.',
        '',
        '**Roles:** `USER` read-only; `AUTHOR` can add and edit own questions; `REVIEWER` can add and edit any visible question. Roles never bypass client grants.',
      ].join('\n'),
    },
    servers: [{ url: '/api' }],
    tags: [
      { name: 'Auth' },
      { name: 'Questions' },
      { name: 'Reference data' },
      { name: 'System' },
    ],
    components: {
      securitySchemes: {
        cookieAuth: { type: 'apiKey', in: 'cookie', name: 'access_token', description: 'httpOnly cookie set by /auth/login' },
      },
      schemas: {
        Error: {
          type: 'object',
          required: ['error'],
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message'],
              properties: { code: { type: 'string' }, message: { type: 'string' } },
              additionalProperties: true,
            },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            name: { type: 'string' },
            role: { enum: ['USER', 'AUTHOR', 'REVIEWER'] },
          },
        },
        TagRef: {
          type: 'object',
          properties: { category: { type: 'string', example: 'technology' }, value: { type: 'string', example: 'react' } },
        },
        Question: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            text: { type: 'string' },
            answerNotes: { type: 'string' },
            client: {
              oneOf: [
                { type: 'null' },
                { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, name: { type: 'string' } } },
              ],
            },
            tags: { type: 'array', items: ref('TagRef') },
            author: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, name: { type: 'string' } } },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        QuestionPage: {
          type: 'object',
          properties: {
            items: { type: 'array', items: ref('Question') },
            page: {
              type: 'object',
              properties: { limit: { type: 'integer' }, offset: { type: 'integer' }, total: { type: 'integer' } },
            },
          },
        },
        HistoryItem: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            type: { enum: ['QUESTION_CREATED', 'QUESTION_UPDATED', 'DUPLICATE_OVERRIDDEN'] },
            at: { type: 'string', format: 'date-time' },
            actor: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, name: { type: 'string' } } },
            changes: {
              type: 'object',
              description: 'Only on QUESTION_UPDATED: { field: { from, to } }',
              additionalProperties: true,
            },
          },
        },
        DuplicateError: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: { const: 'DUPLICATE_SUSPECTED' },
                message: { type: 'string' },
                matches: {
                  type: 'array',
                  description: 'Similar questions the caller can see (trigram similarity >= 0.6), best first, max 5',
                  items: {
                    type: 'object',
                    properties: { id: { type: 'string', format: 'uuid' }, text: { type: 'string' }, similarity: { type: 'number' } },
                  },
                },
              },
            },
          },
        },
        LoginBody: bodySchema(loginSchema),
        CreateQuestionBody: bodySchema(createSchema),
        PatchQuestionBody: bodySchema(patchSchema),
      },
    },
    paths: {
      '/health': {
        get: {
          tags: ['System'],
          summary: 'Liveness and database check',
          responses: {
            200: { description: 'Database reachable', content: json({ type: 'object', properties: { status: { const: 'ok' } } }) },
            503: { description: 'Database unreachable', content: json({ type: 'object', properties: { status: { const: 'unavailable' } } }) },
          },
        },
      },
      '/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Log in (sets httpOnly cookies)',
          description: 'Unknown email, wrong password and disabled account all return the same 401. Rate limited per IP + email.',
          requestBody: { required: true, content: json(ref('LoginBody')) },
          responses: {
            200: {
              description: 'Logged in. `Set-Cookie`: `access_token` (15 min, Path=/api) and `refresh_token` (7 days, Path=/api/auth), both HttpOnly, SameSite=Strict.',
              content: json({ type: 'object', properties: { user: ref('User') } }),
            },
            400: R[400],
            401: errorResponse('Invalid email or password', 'UNAUTHENTICATED', 'Invalid email or password'),
            429: R[429],
          },
        },
      },
      '/auth/refresh': {
        post: {
          tags: ['Auth'],
          summary: 'Rotate the refresh token (uses the refresh_token cookie)',
          description: 'Each refresh token works once. Replaying a used token revokes that whole login chain.',
          responses: { 204: { description: 'New cookies set' }, 401: R[401] },
        },
      },
      '/auth/logout': {
        post: {
          tags: ['Auth'],
          summary: 'Log out: revoke the refresh-token family and clear cookies',
          responses: { 204: { description: 'Always succeeds (idempotent)' } },
        },
      },
      '/auth/me': {
        get: { tags: ['Auth'], summary: 'Current user', security: secured, responses: { 200: { description: 'OK', content: json({ type: 'object', properties: { user: ref('User') } }) }, 401: R[401] } },
      },
      '/tags': {
        get: {
          tags: ['Reference data'],
          summary: 'Tag categories and values (global taxonomy, no counts)',
          security: secured,
          responses: {
            200: {
              description: 'OK',
              content: json({
                type: 'object',
                properties: {
                  categories: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        slug: { type: 'string' },
                        name: { type: 'string' },
                        tags: { type: 'array', items: { type: 'object', properties: { value: { type: 'string' }, label: { type: 'string' } } } },
                      },
                    },
                  },
                },
              }),
            },
            401: R[401],
          },
        },
      },
      '/clients': {
        get: {
          tags: ['Reference data'],
          summary: 'Clients you are granted (others are never disclosed)',
          security: secured,
          responses: {
            200: {
              description: 'OK',
              content: json({ type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, name: { type: 'string' } } } } } }),
            },
            401: R[401],
          },
        },
      },
      '/questions': {
        get: {
          tags: ['Questions'],
          summary: 'Search and filter questions',
          description:
            'One database query applies visibility, keyword search, tag filters, counting and paging. **Filters:** values within a category are OR\'d, categories are AND\'ed, e.g. `tags=technology:react,technology:nodejs,seniority:senior` means (React OR Node) AND Senior. **Keyword:** Postgres full-text search over question text and answer notes (English stemming, `websearch` syntax). Ordered by relevance when `q` is given, otherwise newest first. A user without a client grant gets results identical to a genuine zero-match for anything matching only that client\'s questions.',
          security: secured,
          parameters: [
            { name: 'q', in: 'query', schema: { type: 'string', maxLength: 200 }, description: 'Keyword(s)' },
            { name: 'tags', in: 'query', schema: { type: 'string', example: 'technology:react,technology:nodejs,seniority:senior' }, description: 'Comma-separated `category:value`. Unknown category or value is a 400.' },
            { name: 'clientId', in: 'query', schema: { type: 'string', format: 'uuid' }, description: 'Only questions of this client (zero results if you are not granted it)' },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', minimum: 0, maximum: 100000, default: 0 } },
          ],
          responses: { 200: { description: 'OK', content: json(ref('QuestionPage')) }, 400: R[400], 401: R[401], 429: R[429] },
        },
        post: {
          tags: ['Questions'],
          summary: 'Add a question (AUTHOR or REVIEWER)',
          description:
            'Near-duplicates (trigram similarity >= 0.6, compared only against questions you can see) return **409** with the matches and store nothing. If it genuinely differs, resubmit with `confirmNotDuplicate: true`; the override is recorded. `clientId` requires a grant for that client and cannot be changed later.',
          security: secured,
          requestBody: { required: true, content: json(ref('CreateQuestionBody')) },
          responses: {
            201: { description: 'Created', content: json({ type: 'object', properties: { question: ref('Question') } }) },
            400: R[400],
            401: R[401],
            403: R[403],
            404: errorResponse('`clientId` unknown or not granted to you (identical)', 'NOT_FOUND', 'Client not found'),
            409: { description: 'Suspected duplicate', content: json(ref('DuplicateError')) },
            429: R[429],
          },
        },
      },
      '/questions/{id}': {
        get: {
          tags: ['Questions'],
          summary: 'One question',
          security: secured,
          parameters: [idParam],
          responses: { 200: { description: 'OK', content: json({ type: 'object', properties: { question: ref('Question') } }) }, 400: R[400], 401: R[401], 404: R['404Question'] },
        },
        patch: {
          tags: ['Questions'],
          summary: 'Edit a question',
          description:
            'Visibility is checked first (invisible = 404), then role: REVIEWER may edit any visible question, AUTHOR only their own, USER none (403). `clientId` is immutable: sending it is a 400. A no-op edit records nothing.',
          security: secured,
          parameters: [idParam],
          requestBody: { required: true, content: json(ref('PatchQuestionBody')) },
          responses: {
            200: { description: 'Updated (or unchanged)', content: json({ type: 'object', properties: { question: ref('Question') } }) },
            400: R[400],
            401: R[401],
            403: R[403],
            404: R['404Question'],
          },
        },
      },
      '/questions/{id}/history': {
        get: {
          tags: ['Questions'],
          summary: 'Change history: who added/edited and when',
          description: 'Only for questions you can see. Duplicate-override details are not exposed.',
          security: secured,
          parameters: [idParam],
          responses: { 200: { description: 'Oldest first', content: json({ type: 'object', properties: { items: { type: 'array', items: ref('HistoryItem') } } }) }, 400: R[400], 401: R[401], 404: R['404Question'] },
        },
      },
    },
  };
}
