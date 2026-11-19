import { R, errorResponse, idParam, json, ref, secured } from './common.js';

export const paths = {
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
            'Logged in. `Set-Cookie`: `access_token` (15 min, Path=/api, bound to this session) and `refresh_token` (7 days, Path=/api/auth), both HttpOnly, SameSite=Strict.',
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
                    technologies: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Technology values the department offers',
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
          description: 'Only questions of this department (zero results if you are not granted it)',
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
              items: { type: 'array', items: ref('Notification') },
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
      description: 'Only for questions you can see. Duplicate-override details are not exposed.',
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
};
