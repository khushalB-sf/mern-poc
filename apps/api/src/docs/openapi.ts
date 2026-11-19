import { z } from 'zod';
import {
  changePasswordSchema,
  loginSchema,
  mfaCodeSchema,
  mfaDisableSchema,
  mfaVerifySchema,
  resetPasswordSchema,
} from '../modules/auth/routes.js';
import {
  createClientSchema,
  createUserSchema,
  technologyBody,
  updateClientSchema,
  updateUserSchema,
  userClientsSchema,
} from '../modules/admin/routes.js';
import { markReadSchema } from '../modules/notifications/routes.js';
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
            mfaEnabled: { type: 'boolean' },
            mfaEnrollmentRequired: {
              type: 'boolean',
              description:
                'Two-factor is required of admins and this admin has not set it up: only /auth/me and the /auth/mfa enrolment endpoints work (403 MFA_ENROLLMENT_REQUIRED).',
            },
            mustChangePassword: {
              type: 'boolean',
              description:
                'An admin set the password: only /auth/me, /auth/change-password and /auth/logout work until it is changed (403 PASSWORD_CHANGE_REQUIRED).',
            },
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
            mfaEnabled: { type: 'boolean' },
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
        MarkReadBody: bodySchema(markReadSchema),
        ChangePasswordBody: bodySchema(changePasswordSchema),
        MfaCodeBody: bodySchema(mfaCodeSchema),
        MfaDisableBody: bodySchema(mfaDisableSchema),
        MfaVerifyBody: bodySchema(mfaVerifySchema),
        ResetPasswordBody: bodySchema(resetPasswordSchema),
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
      '/health/live': {
        get: {
          tags: ['Health'],
          summary: 'Liveness: the process answers (never touches the database)',
          responses: {
            200: {
              description: 'OK',
              content: json({ type: 'object', properties: { status: { type: 'string' } } }),
            },
          },
        },
      },
      '/health/ready': {
        get: {
          tags: ['Health'],
          summary: 'Readiness: the process can reach the database',
          responses: {
            200: {
              description: 'OK',
              content: json({ type: 'object', properties: { status: { type: 'string' } } }),
            },
            503: { description: 'Database unreachable (no details are given)' },
          },
        },
      },
      '/metrics': {
        get: {
          tags: ['Health'],
          summary: 'Prometheus metrics (bearer token)',
          description:
            'Only exists when `METRICS_TOKEN` is set (404 otherwise). Send `Authorization: Bearer <token>`. Labels are method, route pattern and status, never ids or query strings.',
          responses: {
            200: {
              description: 'Prometheus text format',
              content: { 'text/plain': { schema: { type: 'string' } } },
            },
            401: R[401],
            404: { description: 'Metrics are not enabled' },
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
                'Logged in. `Set-Cookie`: `access_token` (15 min, Path=/api, bound to this session) and `refresh_token` (7 days, Path=/api/auth), both HttpOnly, SameSite=Strict. When the account has two-factor on, no cookies are set: the body is `{ mfaRequired: true, mfaToken }` and `/auth/mfa/verify` finishes the sign-in.',
              content: json({
                type: 'object',
                properties: {
                  user: ref('User'),
                  mfaRequired: { type: 'boolean' },
                  mfaToken: { type: 'string' },
                },
              }),
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
      '/auth/change-password': {
        post: {
          tags: ['Auth'],
          summary: 'Change your own password',
          description:
            'Needs the current password. The new one must be at least 12 characters, not a common password and not built from your name or email. Every other session is signed out. At most 10 attempts a minute.',
          security: secured,
          requestBody: { required: true, content: json(ref('ChangePasswordBody')) },
          responses: {
            204: { description: 'Changed' },
            400: errorResponse(
              'Wrong current password, or the new one is not acceptable',
              'WEAK_PASSWORD',
              'Use at least 12 characters.',
            ),
            401: R[401],
            429: R[429],
          },
        },
      },
      '/auth/reset-password': {
        post: {
          tags: ['Auth'],
          summary: 'Set a new password with a one-time reset link',
          description:
            'Public: the token from the link an admin created is the credential. It works once, for 24 hours; every failure (unknown, used, expired, replaced, disabled account) answers the same 400. All sessions are signed out.',
          requestBody: { required: true, content: json(ref('ResetPasswordBody')) },
          responses: {
            204: { description: 'Password set' },
            400: errorResponse(
              'Invalid link, or the new password is not acceptable',
              'INVALID_RESET_TOKEN',
              'This reset link is not valid. Ask an admin for a new one.',
            ),
            429: R[429],
          },
        },
      },
      '/auth/mfa/setup': {
        post: {
          tags: ['Auth'],
          summary: 'Start two-factor setup: a fresh secret and an otpauth link',
          description:
            'The secret is stored encrypted but is not active until `/auth/mfa/enable` confirms a code. Calling it again before enabling replaces the secret. 409 when two-factor is already on.',
          security: secured,
          responses: {
            200: {
              description: 'Secret (base32) and otpauth:// URL for an authenticator app',
              content: json({
                type: 'object',
                properties: { secret: { type: 'string' }, otpauthUrl: { type: 'string' } },
              }),
            },
            401: R[401],
            409: errorResponse('Already on', 'MFA_ALREADY_ENABLED', 'Two-factor is already on.'),
          },
        },
      },
      '/auth/mfa/enable': {
        post: {
          tags: ['Auth'],
          summary: 'Turn two-factor on with a code from the authenticator',
          description:
            'Returns eight single-use recovery codes, once. They are stored only as hashes.',
          security: secured,
          requestBody: { required: true, content: json(ref('MfaCodeBody')) },
          responses: {
            200: {
              description: 'Enabled',
              content: json({
                type: 'object',
                properties: { recoveryCodes: { type: 'array', items: { type: 'string' } } },
              }),
            },
            400: errorResponse(
              'Wrong code',
              'INVALID_MFA_CODE',
              'That code is not right. Try the next one.',
            ),
            401: R[401],
            409: errorResponse(
              'Not started, or already on',
              'MFA_NOT_STARTED',
              'Start the setup first.',
            ),
          },
        },
      },
      '/auth/mfa/disable': {
        post: {
          tags: ['Auth'],
          summary: 'Turn two-factor off (password and a current code or recovery code)',
          description:
            'Refused with 409 `MFA_REQUIRED` for admins while `MFA_REQUIRED_FOR_ADMINS` is on.',
          security: secured,
          requestBody: { required: true, content: json(ref('MfaDisableBody')) },
          responses: {
            204: { description: 'Off' },
            400: errorResponse(
              'Wrong password or code',
              'INVALID_MFA_CODE',
              'That code is not right. Try the next one.',
            ),
            401: R[401],
            409: errorResponse(
              'Required for admins',
              'MFA_REQUIRED',
              'Admins must keep two-factor on.',
            ),
          },
        },
      },
      '/auth/mfa/verify': {
        post: {
          tags: ['Auth'],
          summary: 'Second step of sign-in: the step-up token plus a code',
          description:
            'Public: the `mfaToken` returned by `/auth/login` (valid 5 minutes, its own token type) is the credential. A six-digit authenticator code works once per 30-second step; a recovery code works once. Five wrong tries lock that token out (429).',
          requestBody: { required: true, content: json(ref('MfaVerifyBody')) },
          responses: {
            200: {
              description: 'Signed in; sets the session cookies',
              content: json({ type: 'object', properties: { user: ref('User') } }),
            },
            400: R[400],
            401: errorResponse(
              'Wrong code, or the step-up token is not valid',
              'INVALID_MFA_CODE',
              'That code is not right. Try the next one.',
            ),
            429: R[429],
          },
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
              name: 'mine',
              in: 'query',
              required: false,
              schema: { type: 'string', enum: ['true'] },
              description:
                'Only the questions you wrote, at any status (still limited to what you may see). Anything but "true" is a 400.',
            },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
            },
            {
              name: 'offset',
              in: 'query',
              schema: { type: 'integer', minimum: 0, maximum: 10000, default: 0 },
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
            'Visibility is checked first (invisible = 404), then role: the AUTHOR of the question, or an ADMIN (any question), may edit it; everyone else gets 403. A real edit by an author sends the question back to `PENDING` and clears the earlier review; an admin edit leaves the status alone. `clientId` is immutable: sending it is a 400. A no-op edit records nothing. Send `expectedUpdatedAt` (the `updatedAt` you were looking at) and the save is refused with 409 `EDIT_CONFLICT` if someone changed the question since, so one edit never silently overwrites another.',
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
            409: errorResponse(
              'Changed by someone else since you opened it',
              'EDIT_CONFLICT',
              'Someone else changed this question while you were editing it. Reload to see their version.',
            ),
          },
        },
        delete: {
          tags: ['Questions'],
          summary: 'Delete a question (ADMIN, or its author until it is approved)',
          description:
            'Soft delete: the question disappears from every list and lookup (including by id and history), its audit trail is kept. Visibility first (404), then role: an ADMIN may delete any question; an author may withdraw their own while it is pending or rejected; everyone else gets 403.',
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
                properties: {
                  items: { type: 'array', items: ref('AdminUser') },
                  nextCursor: { type: ['string', 'null'] },
                },
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
      '/admin/users/{id}/mfa-reset': {
        post: {
          tags: ['Admin'],
          summary: "Clear a user's two-factor (lost device) (ADMIN)",
          description:
            'Their sessions end. Under `MFA_REQUIRED_FOR_ADMINS` an admin must enrol again.',
          security: secured,
          parameters: [idParam],
          responses: {
            204: { description: 'Cleared' },
            400: R[400],
            401: R[401],
            403: R[403],
            404: errorResponse('No such user', 'NOT_FOUND', 'User not found'),
          },
        },
      },
      '/admin/users/{id}/reset-link': {
        post: {
          tags: ['Admin'],
          summary: 'Create a one-time password reset link for a user (ADMIN)',
          description:
            'Returns the token once; only its hash is stored. Valid 24 hours, single use, and a newer link replaces an older one. Hand it over as `<web origin>/reset-password#token=...`.',
          security: secured,
          parameters: [idParam],
          responses: {
            201: {
              description: 'Created',
              content: json({
                type: 'object',
                properties: {
                  token: { type: 'string' },
                  expiresAt: { type: 'string', format: 'date-time' },
                },
              }),
            },
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
      '/admin/tag-categories': {
        get: {
          tags: ['Admin'],
          summary: 'Lists of tags other than technology, with usage counts (ADMIN)',
          description:
            'Seniority levels, question types and any other category. Technologies are managed per department.',
          security: secured,
          responses: {
            200: {
              description: 'Categories and their tags',
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
      '/admin/tag-categories/{slug}/tags': {
        post: {
          tags: ['Admin'],
          summary: 'Add a tag to a list such as seniority or type (ADMIN)',
          description:
            'A name already used in that list (case and punctuation ignored) is 409 `TAG_EXISTS`. The technology list is not managed here (404).',
          security: secured,
          parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { required: true, content: json(ref('TechnologyBody')) },
          responses: {
            201: { description: 'Created' },
            400: R[400],
            401: R[401],
            403: R[403],
            404: errorResponse('No such list', 'NOT_FOUND', 'List not found'),
            409: errorResponse('Name used', 'TAG_EXISTS', 'That name is already used in this list'),
          },
        },
      },
      '/admin/tags/{id}': {
        patch: {
          tags: ['Admin'],
          summary: 'Rename a non-technology tag (ADMIN)',
          description:
            'Changes the label only; the value never changes. Technologies are renamed with `PATCH /admin/technologies/{id}`.',
          security: secured,
          parameters: [idParam],
          requestBody: { required: true, content: json(ref('TechnologyBody')) },
          responses: {
            200: { description: 'Renamed' },
            400: R[400],
            401: R[401],
            403: R[403],
            404: errorResponse('No such tag', 'NOT_FOUND', 'Tag not found'),
            409: errorResponse('Name used', 'TAG_EXISTS', 'That name is already used in this list'),
          },
        },
      },
      '/admin/tags/{id}/archive': {
        post: {
          tags: ['Admin'],
          summary: 'Archive a non-technology tag (ADMIN)',
          description: 'Hidden from filters and new questions; kept on existing ones.',
          security: secured,
          parameters: [idParam],
          responses: {
            204: { description: 'Archived' },
            400: R[400],
            401: R[401],
            403: R[403],
            404: errorResponse('No such tag, or already archived', 'NOT_FOUND', 'Tag not found'),
          },
        },
      },
      '/admin/tags/{id}/restore': {
        post: {
          tags: ['Admin'],
          summary: 'Restore an archived non-technology tag (ADMIN)',
          security: secured,
          parameters: [idParam],
          responses: {
            204: { description: 'Restored' },
            400: R[400],
            401: R[401],
            403: R[403],
            404: errorResponse('No such tag, or not archived', 'NOT_FOUND', 'Tag not found'),
          },
        },
      },
      '/admin/audit': {
        get: {
          tags: ['Admin'],
          summary: 'The audit trail: every event, newest first (ADMIN)',
          description:
            'Filterable and paged by cursor (time, id), so events that share a timestamp are neither skipped nor repeated. Payloads are shown in full: this is admin-only.',
          security: secured,
          parameters: [
            {
              name: 'type',
              in: 'query',
              schema: { type: 'string' },
              description: 'An event type, e.g. CLIENT_DELETED.',
            },
            { name: 'actorId', in: 'query', schema: { type: 'string', format: 'uuid' } },
            {
              name: 'from',
              in: 'query',
              schema: { type: 'string', format: 'date' },
              description: 'From this date (inclusive).',
            },
            {
              name: 'to',
              in: 'query',
              schema: { type: 'string', format: 'date' },
              description: 'Until this date (exclusive).',
            },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
            },
            {
              name: 'cursor',
              in: 'query',
              schema: { type: 'string' },
              description: '`nextCursor` from the previous page.',
            },
          ],
          responses: {
            200: {
              description: 'A page of events and the cursor for the next one (null at the end)',
              content: json({
                type: 'object',
                properties: {
                  items: { type: 'array', items: { type: 'object' } },
                  nextCursor: { type: ['string', 'null'] },
                },
              }),
            },
            400: R[400],
            401: R[401],
            403: R[403],
          },
        },
      },
      '/admin/audit/export': {
        get: {
          tags: ['Admin'],
          summary: 'Download the audit trail as CSV (ADMIN)',
          description:
            'Same filters. Up to 5,000 rows (`X-Truncated: true` when there were more). Every cell is quoted, and any that would start a spreadsheet formula (= + - @) gets a leading apostrophe.',
          security: secured,
          parameters: [
            {
              name: 'type',
              in: 'query',
              schema: { type: 'string' },
              description: 'An event type, e.g. CLIENT_DELETED.',
            },
            { name: 'actorId', in: 'query', schema: { type: 'string', format: 'uuid' } },
            {
              name: 'from',
              in: 'query',
              schema: { type: 'string', format: 'date' },
              description: 'From this date (inclusive).',
            },
            {
              name: 'to',
              in: 'query',
              schema: { type: 'string', format: 'date' },
              description: 'Until this date (exclusive).',
            },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
            },
            {
              name: 'cursor',
              in: 'query',
              schema: { type: 'string' },
              description: '`nextCursor` from the previous page.',
            },
          ],
          responses: {
            200: {
              description: 'text/csv attachment',
              content: { 'text/csv': { schema: { type: 'string' } } },
            },
            400: R[400],
            401: R[401],
            403: R[403],
          },
        },
      },
      '/admin/deleted-questions': {
        get: {
          tags: ['Admin'],
          summary: 'Soft-deleted questions, newest deletion first, paged by cursor (ADMIN)',
          security: secured,
          parameters: [
            {
              name: 'limit',
              in: 'query',
              required: false,
              schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
            },
            {
              name: 'cursor',
              in: 'query',
              required: false,
              schema: { type: 'string' },
              description: '`nextCursor` from the previous page.',
            },
          ],
          responses: {
            200: {
              description: 'Up to 100 questions',
              content: json({
                type: 'object',
                properties: {
                  items: { type: 'array', items: { type: 'object' } },
                  nextCursor: { type: ['string', 'null'] },
                },
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
      '/questions/summary': {
        get: {
          tags: ['Questions'],
          summary: 'What is waiting: reviewer queue size and your own questions by status',
          description:
            'Counted through the same visibility rule as everything else. `toReview` is the pending questions a reviewer could decide (never their own; an admin may decide any); 0 for other roles.',
          security: secured,
          responses: {
            200: {
              description: 'Counts',
              content: json({
                type: 'object',
                properties: {
                  toReview: { type: 'integer' },
                  mine: {
                    type: 'object',
                    properties: {
                      pending: { type: 'integer' },
                      rejected: { type: 'integer' },
                      approved: { type: 'integer' },
                    },
                  },
                },
              }),
            },
            401: R[401],
            429: R[429],
          },
        },
      },
      '/notifications': {
        get: {
          tags: ['Notifications'],
          summary: 'Your latest notifications (50) and how many are unread',
          description:
            'Only ids and the outcome are stored. `question` carries the text only while you can still see that question, otherwise it is null.',
          security: secured,
          responses: {
            200: {
              description: 'Newest first',
              content: json({
                type: 'object',
                properties: {
                  items: { type: 'array', items: { type: 'object' } },
                  unreadCount: { type: 'integer' },
                },
              }),
            },
            401: R[401],
            429: R[429],
          },
        },
      },
      '/notifications/read': {
        post: {
          tags: ['Notifications'],
          summary: 'Mark notifications read: some ids, or all',
          description: 'Ids that are not yours match nothing and answer the same.',
          security: secured,
          requestBody: { required: true, content: json(ref('MarkReadBody')) },
          responses: { 204: { description: 'Marked' }, 400: R[400], 401: R[401], 429: R[429] },
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
