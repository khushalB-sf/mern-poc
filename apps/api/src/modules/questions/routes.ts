import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { Config } from '../../config/env.js';
import type { Db } from '../../db/prisma.js';
import { notFound } from '../../http/errors.js';
import { validateBody, validateParams, validateQuery } from '../../http/validate.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { resolveTagGroups, tagListParam, tagString } from '../tags/tags.js';
import { getVisibleQuestion, searchQuestions } from './question.repo.js';
import {
  createQuestion,
  questionHistory,
  updateQuestion,
  type CreateInput,
  type PatchInput,
} from './service.js';

// strictObject: unknown parameters are rejected rather than silently ignored.
const searchSchema = z.strictObject({
  q: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => v || undefined),
  tags: tagListParam.optional(),
  clientId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

const idParams = z.object({ id: z.uuid() });

const text = z.string().trim().min(1).max(1000);
const answerNotes = z.string().max(10_000);
const tags = z.array(tagString).max(30);

const createSchema = z.strictObject({
  text,
  answerNotes: answerNotes.default(''),
  clientId: z.uuid().optional(),
  tags: tags.default([]),
  confirmNotDuplicate: z.boolean().default(false),
});

// No clientId here on purpose: a question's client is fixed at creation (IMP-05).
const patchSchema = z
  .strictObject({
    text: text.optional(),
    answerNotes: answerNotes.optional(),
    tags: tags.optional(),
  })
  .refine((o) => Object.keys(o).length > 0, 'At least one field is required');

export function questionRoutes(db: Db, config: Config) {
  const router = Router();
  router.use(requireAuth(db, config));
  // ponytail: in-memory, per process. Rate-limit headers are off on purpose: a decrementing
  // `RateLimit-Remaining` would make hidden and genuinely-empty search responses differ (SEC-04).
  router.use(
    rateLimit({
      windowMs: 60_000,
      limit: config.RATE_LIMIT_API_PER_MIN,
      standardHeaders: false,
      legacyHeaders: false,
      keyGenerator: (req) => req.user!.id,
      handler: (_req, res) => {
        res
          .status(429)
          .json({ error: { code: 'RATE_LIMITED', message: 'Too many requests, slow down' } });
      },
    }),
  );

  router.get('/', validateQuery(searchSchema), async (req, res) => {
    const f = res.locals.query as z.infer<typeof searchSchema>;
    const tagGroups = await resolveTagGroups(db, f.tags ?? []);
    const { items, total } = await searchQuestions(db, req.user!, { ...f, tagGroups });
    res.json({ items, page: { limit: f.limit, offset: f.offset, total } });
  });

  router.get('/:id', validateParams(idParams), async (req, res) => {
    const { id } = res.locals.params as z.infer<typeof idParams>;
    const question = await getVisibleQuestion(db, req.user!, id);
    // Invisible and nonexistent are the same 404 (IMP-02).
    if (!question) throw notFound('Question not found');
    res.json({ question });
  });

  router.get('/:id/history', validateParams(idParams), async (req, res) => {
    const { id } = res.locals.params as z.infer<typeof idParams>;
    res.json({ items: await questionHistory(db, req.user!, id) });
  });

  // Role gate and validation both run before the service (SEC-01).
  router.post(
    '/',
    requireRole('AUTHOR', 'REVIEWER'),
    validateBody(createSchema),
    async (req, res) => {
      const question = await createQuestion(db, req.log, req.user!, req.body as CreateInput);
      res.status(201).json({ question });
    },
  );

  router.patch('/:id', validateParams(idParams), validateBody(patchSchema), async (req, res) => {
    const { id } = res.locals.params as z.infer<typeof idParams>;
    const question = await updateQuestion(db, req.log, req.user!, id, req.body as PatchInput);
    res.json({ question });
  });

  return router;
}
