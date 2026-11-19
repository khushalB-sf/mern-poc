import { R, errorResponse, idParam, json, ref, secured, tagIdParam } from './common.js';

export const adminPaths = {
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
      description: 'With `deleted=true`, the soft-deleted users instead (so one can be restored).',
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
              technologies: {
                type: 'integer',
                description: 'Technologies only this department uses (they are archived with it)',
              },
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
            properties: { items: { type: 'array', items: ref('TagCategory') } },
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
              items: { type: 'array', items: ref('AuditEventItem') },
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
              items: { type: 'array', items: ref('DeletedQuestion') },
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
              active: { type: 'array', items: ref('ManagedTechnology') },
              archived: { type: 'array', items: ref('ManagedTechnology') },
              available: {
                type: 'array',
                description: 'Technologies that could be added to this department',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    label: { type: 'string' },
                  },
                },
              },
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
              active: { type: 'array', items: ref('ManagedTechnology') },
              archived: { type: 'array', items: ref('ManagedTechnology') },
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
};
