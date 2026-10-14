import { Router } from 'express';
import type { Config } from '../../config/env.js';
import type { Db } from '../../db/prisma.js';
import { requireAuth } from '../auth/middleware.js';

export function tagRoutes(db: Db, config: Config) {
  const router = Router();
  router.use(requireAuth(db, config));

  // Global taxonomy, not client-specific and without counts, so it reveals nothing about restricted questions.
  router.get('/', async (_req, res) => {
    const categories = await db.tagCategory.findMany({
      orderBy: { name: 'asc' },
      include: { tags: { orderBy: { label: 'asc' } } },
    });
    res.json({
      categories: categories.map((c) => ({
        slug: c.slug,
        name: c.name,
        tags: c.tags.map((t) => ({ value: t.value, label: t.label })),
      })),
    });
  });
  return router;
}
