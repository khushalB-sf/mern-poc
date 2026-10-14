import { Router } from 'express';
import { z } from 'zod';
import type { Config } from '../../config/env.js';
import type { Db } from '../../db/prisma.js';
import { notFound } from '../../http/errors.js';
import { validateParams, validateQuery } from '../../http/validate.js';
import { requireAuth } from '../auth/middleware.js';
import { resolveTagGroups, tagListParam } from '../tags/tags.js';
import { getVisibleQuestion, searchQuestions } from './question.repo.js';

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

export function questionRoutes(db: Db, config: Config) {
  const router = Router();
  router.use(requireAuth(db, config));

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

  return router;
}
