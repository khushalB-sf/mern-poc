import {
  createClientSchema,
  createUserSchema,
  technologyBody,
  updateClientSchema,
  updateUserSchema,
  userClientsSchema,
} from '../modules/admin/routes.js';
import { loginSchema } from '../modules/auth/routes.js';
import { markReadSchema } from '../modules/notifications/routes.js';
import { createSchema, patchSchema, reviewSchema } from '../modules/questions/routes.js';
import { bodySchema, ref } from './common.js';

export const schemas = {
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
  ManagedTechnology: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      value: { type: 'string', example: 'react' },
      label: { type: 'string', example: 'React' },
      archived: { type: 'boolean' },
      questionCount: { type: 'integer', description: 'Live questions tagged with it' },
      shared: { type: 'boolean', description: 'Another live department uses it too' },
    },
  },
  TechnologyGroups: {
    type: 'object',
    properties: {
      active: { type: 'array', items: ref('ManagedTechnology') },
      archived: { type: 'array', items: ref('ManagedTechnology') },
    },
  },
  Notification: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      type: { enum: ['QUESTION_APPROVED', 'QUESTION_REJECTED'] },
      questionId: { type: 'string', format: 'uuid' },
      at: { type: 'string', format: 'date-time' },
      readAt: { type: ['string', 'null'], format: 'date-time' },
      question: {
        description: 'Null once you can no longer see the question',
        oneOf: [
          { type: 'null' },
          {
            type: 'object',
            properties: { id: { type: 'string', format: 'uuid' }, text: { type: 'string' } },
          },
        ],
      },
    },
  },
  AuditEventItem: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      type: { type: 'string', example: 'QUESTION_DELETED' },
      at: { type: 'string', format: 'date-time' },
      actor: { oneOf: [{ type: 'null' }, ref('ClientRef')] },
      questionId: { type: ['string', 'null'], format: 'uuid' },
      payload: {
        type: 'object',
        description: 'Event details. Never contains passwords or tokens.',
        additionalProperties: true,
      },
    },
  },
  DeletedQuestion: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      text: { type: 'string' },
      status: { enum: ['PENDING', 'APPROVED', 'REJECTED'] },
      deletedAt: { type: 'string', format: 'date-time' },
      author: ref('ClientRef'),
      department: { oneOf: [{ type: 'null' }, ref('ClientRef')] },
      departmentDeleted: {
        type: 'boolean',
        description: 'Its department is deleted too: restore that first',
      },
    },
  },
  TagCategory: {
    type: 'object',
    properties: {
      slug: { type: 'string' },
      name: { type: 'string' },
      tags: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            value: { type: 'string' },
            label: { type: 'string' },
            archived: { type: 'boolean' },
            questionCount: { type: 'integer' },
          },
        },
      },
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
};
