import { Router, type RequestHandler } from 'express';
import type { Config } from '../../config/env.js';
import type { Db } from '../../db/prisma.js';
import { requireAuth } from '../auth/middleware.js';
import { filterTechnologyIds, orphanTagIds } from './tags.js';

export function tagRoutes(db: Db, config: Config, limit: RequestHandler) {
  const router = Router();
  router.use(requireAuth(db, config), limit);

  // Global taxonomy, not client-specific and without counts, so it reveals nothing about restricted questions.
  router.get('/', async (req, res) => {
    const categories = await db.tagCategory.findMany({
      orderBy: { name: 'asc' },
      include: { tags: { orderBy: { label: 'asc' } } },
    });

    // ?for=filter: archived tags are dropped, and Technology is narrowed to the caller's departments
    // (admins: all), so a Python/AI-ML reviewer is not offered React.
    if (req.query.for === 'filter') {
      const allowed = await filterTechnologyIds(db, req.user!);
      for (const c of categories) {
        c.tags = c.tags.filter(
          (t) => !t.archivedAt && (c.slug !== 'technology' || !allowed || allowed.has(t.id)),
        );
      }
    }
    const other = await orphanTagIds(db);
    res.json({
      categories: categories.map((c) => ({
        slug: c.slug,
        name: c.name,
        tags: c.tags.map((t) => ({
          value: t.value,
          label: t.label,
          archived: t.archivedAt !== null,
          // Active technology no department uses: shown under "Other".
          ...(other.has(t.id) && { other: true }),
        })),
      })),
    });
  });
  return router;
}
