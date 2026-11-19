import { z } from 'zod';
import { loginSchema } from '../modules/auth/routes.js';
import {
  createClientSchema,
  createUserSchema,
  technologyBody,
  updateClientSchema,
  updateUserSchema,
  userClientsSchema,
} from '../modules/admin/routes.js';
import { createSchema, patchSchema, reviewSchema } from '../modules/questions/routes.js';

// Request bodies come straight from the Zod schemas the API validates with, so they cannot drift.
const bodySchema = (schema: z.ZodType) => {
  const out = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Record<
    string,
    unknown
  >;
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

const idParam = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
};
const tagIdParam = {
  name: 'tagId',
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
        'Shared question bank with department-restricted visibility and a review workflow. (A department is called a "client" in field and path names.)',
        '',
        '**Authenticating in this page:** call `POST /auth/login` below with "Try it out". The server sets two httpOnly cookies (`access_token`, `refresh_token`); the browser then sends them automatically on every later "Try it out" call. Tokens never appear in response bodies. Use `POST /auth/logout` to end the session.',
        '',
        '**Visibility guarantee:** a question tied to a client is visible only to users granted that client. The rule is part of the SQL query itself, so a user without the grant gets results indistinguishable from a genuine zero-match, and the same `404` for that question by ID as for a nonexistent one. Counts, tags, history and duplicate matches obey the same rule.',
        '',
        '**Roles:** `USER` read-only (approved questions only); `AUTHOR` adds questions and edits their own (an edit sends it back for review); `REVIEWER` approves or rejects pending questions with a note; `ADMIN` does everything: manages users and departments, and adds, edits, reviews and deletes any question (admin-made questions are approved immediately). Only `ADMIN` bypasses department grants. **Deletes are soft:** a deleted user, department or question disappears from every list and lookup, and its history is kept.',
        '',
        '**Review workflow:** new and edited questions are `PENDING`. Users see only `APPROVED` questions; authors also see their own at any status; reviewers see every status within their departments.',
      ].join('\n'),
    },
    servers: [{ url: '/api' }],
    tags: [
      { name: 'Auth' },
      { name: 'Questions' },
      { name: 'Reference data' },
      { name: 'Admin', description: 'ADMIN role only' },
      { name: 'System' },
    ],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'access_token',
          description: 'httpOnly cookie set by /auth/login',
        },
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
            role: { enum: ['USER', 'AUTHOR', 'REVIEWER', 'ADMIN'] },
          },
        },
        AdminUser: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            name: { type: 'string' },
            role: { enum: ['USER', 'AUTHOR', 'REVIEWER', 'ADMIN'] },
            active: { type: 'boolean' },
            clients: { type: 'array', items: ref('ClientRef') },
          },
        },
        ClientRef: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' }, name: { type: 'string' } },
        },
        Department: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            description: { type: ['string', 'null'] },
            userCount: { type: 'integer', description: 'Users granted this department' },
          },
        },
        TagRef: {
          type: 'object',
          properties: {
            category: { type: 'string', example: 'technology' },
            value: { type: 'string', example: 'react' },
          },
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
                {
                  type: 'object',
                  properties: { id: { type: 'string', format: 'uuid' }, name: { type: 'string' } },
                },
              ],
            },
            tags: { type: 'array', items: ref('TagRef') },
            author: {
              type: 'object',
              properties: { id: { type: 'string', format: 'uuid' }, name: { type: 'string' } },
            },
            status: { enum: ['PENDING', 'APPROVED', 'REJECTED'] },
            review: {
              description:
                'Latest reviewer decision; null while PENDING (cleared when the author edits again)',
              oneOf: [
                { type: 'null' },
                {
                  type: 'object',
                  properties: {
                    note: { type: ['string', 'null'] },
                    reviewer: ref('ClientRef'),
                    at: { type: 'string', format: 'date-time' },
                  },
                },
              ],
            },
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
              properties: {
                limit: { type: 'integer' },
                offset: { type: 'integer' },
                total: { type: 'integer' },
              },
            },
          },
        },
        HistoryItem: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            type: {
              enum: [
                'QUESTION_CREATED',
                'QUESTION_UPDATED',
                'DUPLICATE_OVERRIDDEN',
                'QUESTION_APPROVED',
                'QUESTION_REJECTED',
              ],
            },
            at: { type: 'string', format: 'date-time' },
            actor: {
              type: 'object',
              properties: { id: { type: 'string', format: 'uuid' }, name: { type: 'string' } },
            },
            changes: {
              type: 'object',
              description: 'Only on QUESTION_UPDATED: { field: { from, to } }',
              additionalProperties: true,
            },
            note: {
              type: ['string', 'null'],
              description: 'Only on QUESTION_APPROVED / QUESTION_REJECTED',
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
                  description:
                    'Similar questions the caller can see (trigram similarity >= 0.6), best first, max 5',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', format: 'uuid' },
                      text: { type: 'string' },
                      similarity: { type: 'number' },
                    },
                  },
                },
              },
            },
          },
        },
        LoginBody: bodySchema(loginSchema),
        CreateQuestionBody: bodySchema(createSchema),
        PatchQuestionBody: bodySchema(patchSchema),
        ReviewBody: bodySchema(reviewSchema),
        CreateUserBody: bodySchema(createUserSchema),
        UpdateUserBody: bodySchema(updateUserSchema),
        UserClientsBody: bodySchema(userClientsSchema),
        CreateClientBody: bodySchema(createClientSchema),
        UpdateClientBody: bodySchema(updateClientSchema),
        TechnologyBody: bodySchema(technologyBody),
      },
    },
    paths: {
      '/health': {
        get: {
          tags: ['System'],
          summary: 'Liveness and database check',
          responses: {
            200: {
              description: 'Database reachable',
              content: json({ type: 'object', properties: { status: { const: 'ok' } } }),
            },
            503: {
              description: 'Database unreachable',
              content: json({ type: 'object', properties: { status: { const: 'unavailable' } } }),
            },
          },
        },
      },
      '/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Log in (sets httpOnly cookies)',
          description:
            'Unknown email, wrong password and disabled account all return the same 401. Rate limited per IP + email.',
          requestBody: { required: true, content: json(ref('LoginBody')) },
          responses: {
            200: {
              description:
                'Logged in. `Set-Cookie`: `access_token` (15 min, Path=/api) and `refresh_token` (7 days, Path=/api/auth), both HttpOnly, SameSite=Strict.',
              content: json({ type: 'object', properties: { user: ref('User') } }),
            },
            400: R[400],
            401: errorResponse(
              'Invalid email or password',
              'UNAUTHENTICATED',
              'Invalid email or password',
            ),
            429: R[429],
          },
        },
      },
      '/auth/refresh': {
        post: {
          tags: ['Auth'],
          summary: 'Rotate the refresh token (uses the refresh_token cookie)',
          description:
            'Each refresh token works once. Replaying a used token revokes that whole login chain.',
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
        get: {
          tags: ['Auth'],
          summary: 'Current user',
          security: secured,
          responses: {
            200: {
              description: 'OK',
              content: json({ type: 'object', properties: { user: ref('User') } }),
            },
            401: R[401],
          },
        },
      },
      '/tags': {
        get: {
          tags: ['Reference data'],
          summary: 'Tag categories and values (global taxonomy, no counts)',
          description:
            "With `for=filter`, the Technology category is narrowed to technologies used by the caller's departments.",
          security: secured,
          parameters: [
            {
              name: 'for',
              in: 'query',
              required: false,
              schema: { type: 'string', enum: ['filter'] },
            },
          ],
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
                        tags: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              value: { type: 'string' },
                              label: { type: 'string' },
                              archived: { type: 'boolean' },
                              other: { type: 'boolean' },
                            },
                          },
                        },
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
          summary: 'Departments you are granted (ADMIN: all). Others are never disclosed',
          security: secured,
          responses: {
            200: {
              description: 'OK',
              content: json({
                type: 'object',
                properties: {
                  items: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string', format: 'uuid' },
                        name: { type: 'string' },
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
      '/questions': {
        get: {
          tags: ['Questions'],
          summary: 'Search and filter questions',
          description:
            "One database query applies visibility, keyword search, tag filters, counting and paging. **Filters:** values within a category are OR'd, categories are AND'ed, e.g. `tags=technology:react,technology:nodejs,seniority:senior` means (React OR Node) AND Senior. **Keyword:** Postgres full-text search over question text and answer notes (English stemming, `websearch` syntax). Ordered by relevance when `q` is given, otherwise newest first. A user without a client grant gets results identical to a genuine zero-match for anything matching only that client's questions.",
          security: secured,
          parameters: [
            {
              name: 'q',
              in: 'query',
              schema: { type: 'string', maxLength: 200 },
              description: 'Keyword(s)',
            },
            {
              name: 'tags',
              in: 'query',
              schema: {
                type: 'string',
                example: 'technology:react,technology:nodejs,seniority:senior',
              },
              description: 'Comma-separated `category:value`. Unknown category or value is a 400.',
            },
            {
              name: 'clientId',
              in: 'query',
              schema: { type: 'string', format: 'uuid' },
              description:
                'Only questions of this department (zero results if you are not granted it)',
            },
            {
              name: 'status',
              in: 'query',
              schema: { enum: ['PENDING', 'APPROVED', 'REJECTED'] },
              description:
                "Only questions in this review status (e.g. the reviewers' queue). A status you may not see simply yields zero results.",
            },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
            },
            {
              name: 'offset',
              in: 'query',
              schema: { type: 'integer', minimum: 0, maximum: 100000, default: 0 },
            },
          ],
          responses: {
            200: { description: 'OK', content: json(ref('QuestionPage')) },
            400: R[400],
            401: R[401],
            429: R[429],
          },
        },
        post: {
          tags: ['Questions'],
          summary: 'Add a question (AUTHOR starts PENDING; ADMIN is approved at once)',
          description:
            'Near-duplicates (trigram similarity >= 0.6, compared only against questions you can see) return **409** with the matches and store nothing. If it genuinely differs, resubmit with `confirmNotDuplicate: true`; the override is recorded. `clientId` requires a grant for that client and cannot be changed later.',
          security: secured,
          requestBody: { required: true, content: json(ref('CreateQuestionBody')) },
          responses: {
            201: {
              description: 'Created',
              content: json({ type: 'object', properties: { question: ref('Question') } }),
            },
            400: R[400],
            401: R[401],
            403: R[403],
            404: errorResponse(
              '`clientId` unknown or not granted to you (identical)',
              'NOT_FOUND',
              'Client not found',
            ),
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
          responses: {
            200: {
              description: 'OK',
              content: json({ type: 'object', properties: { question: ref('Question') } }),
            },
            400: R[400],
            401: R[401],
            404: R['404Question'],
          },
        },
        patch: {
          tags: ['Questions'],
          summary: 'Edit a question',
          description:
            'Visibility is checked first (invisible = 404), then role: the AUTHOR of the question, or an ADMIN (any question), may edit it; everyone else gets 403. A real edit by an author sends the question back to `PENDING` and clears the earlier review; an admin edit leaves the status alone. `clientId` is immutable: sending it is a 400. A no-op edit records nothing.',
          security: secured,
          parameters: [idParam],
          requestBody: { required: true, content: json(ref('PatchQuestionBody')) },
          responses: {
            200: {
              description: 'Updated (or unchanged)',
              content: json({ type: 'object', properties: { question: ref('Question') } }),
            },
            400: R[400],
            401: R[401],
            403: R[403],
            404: R['404Question'],
          },
        },
        delete: {
          tags: ['Questions'],
          summary: 'Delete a question (ADMIN)',
          description:
            'Soft delete: the question disappears from every list and lookup (including by id and history), its audit trail is kept. Visibility first (404), then role (403 for anyone but ADMIN).',
          security: secured,
          parameters: [idParam],
          responses: {
            204: { description: 'Deleted' },
            400: R[400],
            401: R[401],
            403: R[403],
            404: R['404Question'],
          },
        },
      },
      '/questions/{id}/review': {
        post: {
          tags: ['Questions'],
          summary: 'Approve or reject a question (REVIEWER: pending only; ADMIN: any status)',
          description:
            'Checked in order: visibility (invisible = 404), role (403, also for a reviewer reviewing their own question), state (409 `NOT_PENDING` if already decided; an ADMIN may overturn an earlier decision). A note is required when rejecting.',
          security: secured,
          parameters: [idParam],
          requestBody: { required: true, content: json(ref('ReviewBody')) },
          responses: {
            200: {
              description: 'Decision recorded',
              content: json({ type: 'object', properties: { question: ref('Question') } }),
            },
            400: R[400],
            401: R[401],
            403: R[403],
            404: R['404Question'],
            409: errorResponse(
              'Not pending: already approved or rejected',
              'NOT_PENDING',
              'This question has already been reviewed',
            ),
          },
        },
      },
      '/admin/users': {
        post: {
          tags: ['Admin'],
          summary: 'Add a user with an initial password (ADMIN)',
          description:
            'Choose the role (including REVIEWER) and the departments they may access. The email must be unused, including by a deleted account.',
          security: secured,
          requestBody: { required: true, content: json(ref('CreateUserBody')) },
          responses: {
            201: {
              description: 'Created',
              content: json({ type: 'object', properties: { user: ref('AdminUser') } }),
            },
            400: R[400],
            401: R[401],
            403: R[403],
            409: errorResponse(
              'Email already used',
              'EMAIL_EXISTS',
              'An account with this email already exists',
            ),
          },
        },
        get: {
          tags: ['Admin'],
          summary: 'All users with role and departments (ADMIN)',
          description:
            'With `deleted=true`, the soft-deleted users instead (so one can be restored).',
          security: secured,
          parameters: [
            {
              name: 'deleted',
              in: 'query',
              required: false,
              schema: { type: 'string', enum: ['true'] },
            },
          ],
          responses: {
            200: {
              description: 'OK',
              content: json({
                type: 'object',
                properties: { items: { type: 'array', items: ref('AdminUser') } },
              }),
            },
            401: R[401],
            403: R[403],
          },
        },
      },
      '/admin/users/{id}': {
        patch: {
          tags: ['Admin'],
          summary: 'Edit a user: name, email, role, active, password (ADMIN)',
          description:
            "Takes effect on the user's next request. Setting a password, or active=false, also signs the user out everywhere. You cannot change your own role or deactivate yourself.",
          security: secured,
          parameters: [idParam],
          requestBody: { required: true, content: json(ref('UpdateUserBody')) },
          responses: {
            200: {
              description: 'Updated (or unchanged)',
              content: json({ type: 'object', properties: { user: ref('AdminUser') } }),
            },
            400: R[400],
            401: R[401],
            403: R[403],
            404: errorResponse('No such user', 'NOT_FOUND', 'User not found'),
            409: errorResponse(
              'Email already used',
              'EMAIL_EXISTS',
              'An account with this email already exists',
            ),
          },
        },
        delete: {
          tags: ['Admin'],
          summary: 'Delete a user (ADMIN)',
          description:
            'Soft delete: the account is deactivated, signed out everywhere and removed from lists. The questions and history it made are kept. You cannot delete yourself.',
          security: secured,
          parameters: [idParam],
          responses: {
            204: { description: 'Deleted' },
            400: R[400],
            401: R[401],
            403: R[403],
            404: errorResponse('No such user', 'NOT_FOUND', 'User not found'),
          },
        },
      },
      '/admin/users/{id}/restore': {
        post: {
          tags: ['Admin'],
          summary: 'Restore a deleted user (ADMIN)',
          description:
            'The account returns switched off (inactive) with its role and department grants; sessions signed out by the delete stay signed out. Set it active to let the person in again.',
          security: secured,
          parameters: [idParam],
          responses: {
            200: {
              description: 'Restored (inactive)',
              content: json({ type: 'object', properties: { user: ref('AdminUser') } }),
            },
            400: R[400],
            401: R[401],
            403: R[403],
            404: errorResponse('Not deleted', 'NOT_FOUND', 'Deleted user not found'),
          },
        },
      },
      '/admin/users/{id}/clients': {
        put: {
          tags: ['Admin'],
          summary: 'Replace the departments a user may access (ADMIN)',
          security: secured,
          parameters: [idParam],
          requestBody: { required: true, content: json(ref('UserClientsBody')) },
          responses: {
            200: {
              description: 'Updated',
              content: json({ type: 'object', properties: { user: ref('AdminUser') } }),
            },
            400: R[400],
            401: R[401],
            403: R[403],
            404: errorResponse('No such user', 'NOT_FOUND', 'User not found'),
          },
        },
      },
      '/admin/clients': {
        get: {
          tags: ['Admin'],
          summary: 'All departments with user counts (ADMIN)',
          security: secured,
          responses: {
            200: {
              description: 'OK',
              content: json({
                type: 'object',
                properties: { items: { type: 'array', items: ref('Department') } },
              }),
            },
            401: R[401],
            403: R[403],
          },
        },
        post: {
          tags: ['Admin'],
          summary: 'Add a department with an optional description (ADMIN)',
          security: secured,
          requestBody: { required: true, content: json(ref('CreateClientBody')) },
          responses: {
            201: {
              description: 'Created',
              content: json({ type: 'object', properties: { client: ref('Department') } }),
            },
            400: R[400],
            401: R[401],
            403: R[403],
            409: errorResponse(
              'Name already taken',
              'DEPARTMENT_EXISTS',
              'A department with this name already exists',
            ),
          },
        },
      },
      '/admin/clients/{id}': {
        patch: {
          tags: ['Admin'],
          summary: "Edit a department's name or description (ADMIN)",
          security: secured,
          parameters: [idParam],
          requestBody: { required: true, content: json(ref('UpdateClientBody')) },
          responses: {
            200: {
              description: 'Updated (or unchanged)',
              content: json({ type: 'object', properties: { client: ref('Department') } }),
            },
            400: R[400],
            401: R[401],
            403: R[403],
            404: errorResponse('No such department', 'NOT_FOUND', 'Department not found'),
            409: errorResponse(
              'Name already taken',
              'DEPARTMENT_EXISTS',
              'A department with this name already exists',
            ),
          },
        },
        delete: {
          tags: ['Admin'],
          summary: 'Delete a department (ADMIN)',
          description:
            'Soft delete: the department and every question in it disappear from every list and lookup. Grants and history are kept. The name stays reserved.',
          security: secured,
          parameters: [idParam],
          responses: {
            204: { description: 'Deleted' },
            400: R[400],
            401: R[401],
            403: R[403],
            404: errorResponse('No such department', 'NOT_FOUND', 'Department not found'),
          },
        },
      },
      '/admin/clients/{id}/impact': {
        get: {
          tags: ['Admin'],
          summary: 'What deleting a department would hide (ADMIN)',
          security: secured,
          parameters: [idParam],
          responses: {
            200: {
              description: 'Live question count, how many are pending review, users with access',
              content: json({
                type: 'object',
                properties: {
                  questions: { type: 'integer' },
                  pending: { type: 'integer' },
                  users: { type: 'integer' },
                },
              }),
            },
            400: R[400],
            401: R[401],
            403: R[403],
            404: errorResponse('No such department', 'NOT_FOUND', 'Department not found'),
          },
        },
      },
      '/admin/clients/{id}/restore': {
        post: {
          tags: ['Admin'],
          summary: 'Restore a deleted department (ADMIN)',
          description: 'Its questions and grants come back exactly as they were.',
          security: secured,
          parameters: [idParam],
          responses: {
            200: {
              description: 'Restored',
              content: json({ type: 'object', properties: { client: ref('Department') } }),
            },
            400: R[400],
            401: R[401],
            403: R[403],
            404: errorResponse('Not deleted', 'NOT_FOUND', 'Deleted department not found'),
          },
        },
      },
      '/admin/deleted-questions': {
        get: {
          tags: ['Admin'],
          summary: 'Soft-deleted questions, newest deletion first (ADMIN)',
          security: secured,
          responses: {
            200: {
              description: 'Up to 100 questions',
              content: json({
                type: 'object',
                properties: { items: { type: 'array', items: { type: 'object' } } },
              }),
            },
            401: R[401],
            403: R[403],
          },
        },
      },
      '/admin/questions/{id}/restore': {
        post: {
          tags: ['Admin'],
          summary: 'Restore a deleted question (ADMIN)',
          description: "Refused with 409 while the question's department is itself deleted.",
          security: secured,
          parameters: [idParam],
          responses: {
            204: { description: 'Restored' },
            400: R[400],
            401: R[401],
            403: R[403],
            404: errorResponse('Not deleted', 'NOT_FOUND', 'Deleted question not found'),
            409: errorResponse(
              'Department deleted',
              'DEPARTMENT_DELETED',
              'Restore the Acme department first',
            ),
          },
        },
      },
      '/admin/clients/{id}/technologies': {
        get: {
          tags: ['Admin'],
          summary: "A department's technologies (ADMIN)",
          description:
            'Active and archived technologies of the department, plus the active ones it does not have yet (for the add box). `shared` means another live department uses it too.',
          security: secured,
          parameters: [idParam],
          responses: {
            200: {
              description: 'OK',
              content: json({
                type: 'object',
                properties: {
                  active: { type: 'array', items: { type: 'object' } },
                  archived: { type: 'array', items: { type: 'object' } },
                  available: { type: 'array', items: { type: 'object' } },
                },
              }),
            },
            400: R[400],
            401: R[401],
            403: R[403],
            404: errorResponse('No such department', 'NOT_FOUND', 'Department not found'),
          },
        },
        post: {
          tags: ['Admin'],
          summary: 'Add a technology to a department (ADMIN)',
          description:
            'Links the existing technology when the name matches ("Node.js" = "nodejs"), un-archiving it if needed; otherwise creates it.',
          security: secured,
          parameters: [idParam],
          requestBody: { required: true, content: json(ref('TechnologyBody')) },
          responses: {
            201: { description: 'Linked or created' },
            400: R[400],
            401: R[401],
            403: R[403],
            404: errorResponse('No such department', 'NOT_FOUND', 'Department not found'),
          },
        },
      },
      '/admin/clients/{id}/technologies/{tagId}': {
        delete: {
          tags: ['Admin'],
          summary: 'Remove a technology from a department (ADMIN)',
          description:
            'A technology another live department also uses is unlinked from this one. Otherwise it is archived (hidden from pickers and filters, kept on existing questions) and can be restored.',
          security: secured,
          parameters: [idParam, tagIdParam],
          responses: {
            204: { description: 'Removed' },
            400: R[400],
            401: R[401],
            403: R[403],
            404: errorResponse(
              'Not in this department',
              'NOT_FOUND',
              'Technology not found in this department',
            ),
          },
        },
      },
      '/admin/clients/{id}/technologies/{tagId}/restore': {
        post: {
          tags: ['Admin'],
          summary: 'Restore an archived technology of a department (ADMIN)',
          security: secured,
          parameters: [idParam, tagIdParam],
          responses: {
            204: { description: 'Restored' },
            400: R[400],
            401: R[401],
            403: R[403],
            404: errorResponse(
              'Not archived here',
              'NOT_FOUND',
              'Archived technology not found in this department',
            ),
          },
        },
      },
      '/admin/technologies/other': {
        get: {
          tags: ['Admin'],
          summary: 'Technologies no department uses, the "Other" group (ADMIN)',
          security: secured,
          responses: {
            200: {
              description: 'Active and archived',
              content: json({
                type: 'object',
                properties: {
                  active: { type: 'array', items: { type: 'object' } },
                  archived: { type: 'array', items: { type: 'object' } },
                },
              }),
            },
            401: R[401],
            403: R[403],
          },
        },
      },
      '/admin/technologies/{id}/archive': {
        post: {
          tags: ['Admin'],
          summary: 'Archive an "Other" technology (ADMIN)',
          description: 'Only for a technology no live department uses; otherwise 409.',
          security: secured,
          parameters: [idParam],
          responses: {
            204: { description: 'Archived' },
            400: R[400],
            401: R[401],
            403: R[403],
            404: errorResponse('No such technology', 'NOT_FOUND', 'Technology not found'),
            409: errorResponse(
              'Belongs to a department',
              'TECHNOLOGY_IN_DEPARTMENT',
              'This technology belongs to a department. Manage it from there.',
            ),
          },
        },
      },
      '/admin/technologies/{id}/restore': {
        post: {
          tags: ['Admin'],
          summary: 'Restore an archived "Other" technology (ADMIN)',
          security: secured,
          parameters: [idParam],
          responses: {
            204: { description: 'Restored' },
            400: R[400],
            401: R[401],
            403: R[403],
            404: errorResponse('No such technology', 'NOT_FOUND', 'Technology not found'),
            409: errorResponse(
              'Belongs to a department',
              'TECHNOLOGY_IN_DEPARTMENT',
              'This technology belongs to a department. Manage it from there.',
            ),
          },
        },
      },
      '/admin/technologies/{id}': {
        patch: {
          tags: ['Admin'],
          summary: 'Rename a technology (ADMIN)',
          description: 'Changes the label everywhere it is used. The value (slug) never changes.',
          security: secured,
          parameters: [idParam],
          requestBody: { required: true, content: json(ref('TechnologyBody')) },
          responses: {
            200: { description: 'Renamed' },
            400: R[400],
            401: R[401],
            403: R[403],
            404: errorResponse('No such technology', 'NOT_FOUND', 'Technology not found'),
            409: errorResponse(
              'Name already taken',
              'TECHNOLOGY_EXISTS',
              'A technology with this name already exists',
            ),
          },
        },
      },
      '/questions/{id}/history': {
        get: {
          tags: ['Questions'],
          summary: 'Change history: who added/edited and when',
          description:
            'Only for questions you can see. Duplicate-override details are not exposed.',
          security: secured,
          parameters: [idParam],
          responses: {
            200: {
              description: 'Oldest first',
              content: json({
                type: 'object',
                properties: { items: { type: 'array', items: ref('HistoryItem') } },
              }),
            },
            400: R[400],
            401: R[401],
            404: R['404Question'],
          },
        },
      },
    },
  };
}
