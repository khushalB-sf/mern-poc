import { Router } from 'express';
import type { Config } from '../../config/env.js';
import type { Db } from '../../db/prisma.js';
import { requireAuth } from '../auth/middleware.js';
import { departmentTagIds } from '../questions/question.repo.js';

export function tagRoutes(db: Db, config: Config) {
  const router = Router();
  router.use(requireAuth(db, config));

  // Global taxonomy, not client-specific and without counts, so it reveals nothing about restricted questions.
  router.get('/', async (req, res) => {
    const categories = await db.tagCategory.findMany({
      orderBy: { name: 'asc' },
      include: { tags: { orderBy: { label: 'asc' } } },
    });

    // ?for=filter narrows Technology to what the caller's departments actually cover, so a Python/AI-ML
    // reviewer is not offered React. Admins get every department; a caller with no grants gets the
    // technologies on global (department-less) questions. Other categories stay global.
    if (req.query.for === 'filter') {
      const usedIds = await departmentTagIds(db, req.user!);
      for (const c of categories) {
        if (c.slug === 'technology') c.tags = c.tags.filter((t) => usedIds.has(t.id));
      }
    }
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
