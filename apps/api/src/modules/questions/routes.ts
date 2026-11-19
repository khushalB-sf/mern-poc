import { Router } from 'express';
import { z } from 'zod';
import type { Config } from '../../config/env.js';
import type { Db } from '../../db/prisma.js';
import { notFound } from '../../http/errors.js';
import { perUserLimit } from '../../http/rateLimit.js';
import { validateBody, validateParams, validateQuery } from '../../http/validate.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { resolveTagGroups, tagListParam, tagString } from '../tags/tags.js';
import { getVisibleQuestion, reviewSummary, searchQuestions } from './question.repo.js';
import {
  createQuestion,
  deleteQuestion,
  questionHistory,
  updateQuestion,
  type CreateInput,
  reviewQuestion,
  type PatchInput,
  type ReviewInput,
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
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  // Only your own questions. Anything but "true" is a 400, so the flag cannot be misread.
  mine: z
    .literal('true')
    .transform(() => true)
    .optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  // Offset paging gets slower the deeper it goes, and nobody reads 500 pages: refine the search instead.
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});

const idParams = z.object({ id: z.uuid() });

const text = z.string().trim().min(1).max(1000);
const answerNotes = z.string().max(10_000);
const tags = z.array(tagString).max(30);

export const createSchema = z.strictObject({
  text,
  answerNotes: answerNotes.default(''),
  clientId: z.uuid().optional(),
  tags: tags.default([]),
  confirmNotDuplicate: z.boolean().default(false),
});

// No clientId here on purpose: a question's client is fixed at creation (IMP-05).
export const patchSchema = z
  .strictObject({
    text: text.optional(),
    answerNotes: answerNotes.optional(),
    tags: tags.optional(),
    // The updatedAt you were looking at when you opened the form. If the question changed since, the save
    // is refused (409) instead of silently overwriting the other person's edit. Optional.
    expectedUpdatedAt: z.iso.datetime().optional(),
    // Like on create: save even though it looks like another question.
    confirmNotDuplicate: z.boolean().optional(),
  })
  .refine(
    (o) => Object.keys(o).some((k) => k !== 'expectedUpdatedAt' && k !== 'confirmNotDuplicate'),
    'At least one field is required',
  );

export const reviewSchema = z
  .strictObject({
    decision: z.enum(['APPROVED', 'REJECTED']),
    note: z.string().trim().max(2000).default(''),
  })
  .refine((o) => o.decision === 'APPROVED' || o.note.length > 0, {
    message: 'A note is required when rejecting',
    path: ['note'],
  });

export function questionRoutes(db: Db, config: Config) {
  const router = Router();
  router.use(requireAuth(db, config));
  router.use(perUserLimit(config.RATE_LIMIT_API_PER_MIN));

  // Before '/:id', or "summary" would be taken for an id.
  router.get('/summary', async (req, res) => {
    res.json(await reviewSummary(db, req.user!));
  });

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
  router.post('/', requireRole('AUTHOR', 'ADMIN'), validateBody(createSchema), async (req, res) => {
    const question = await createQuestion(db, req.log, req.user!, req.body as CreateInput);
    res.status(201).json({ question });
  });

  router.patch('/:id', validateParams(idParams), validateBody(patchSchema), async (req, res) => {
    const { id } = res.locals.params as z.infer<typeof idParams>;
    const question = await updateQuestion(db, req.log, req.user!, id, req.body as PatchInput);
    res.json({ question });
  });

  router.delete('/:id', validateParams(idParams), async (req, res) => {
    const { id } = res.locals.params as z.infer<typeof idParams>;
    await deleteQuestion(db, req.log, req.user!, id);
    res.status(204).end();
  });

  router.post(
    '/:id/review',
    validateParams(idParams),
    validateBody(reviewSchema),
    async (req, res) => {
      const { id } = res.locals.params as z.infer<typeof idParams>;
      const question = await reviewQuestion(db, req.log, req.user!, id, req.body as ReviewInput);
      res.json({ question });
    },
  );

  return router;
}
