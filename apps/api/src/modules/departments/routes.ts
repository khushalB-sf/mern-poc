import { Router, type RequestHandler } from 'express';
import type { Config } from '../../config/env.js';
import type { Db } from '../../db/prisma.js';
import { requireAuth } from '../auth/middleware.js';

export function departmentRoutes(db: Db, config: Config, limit: RequestHandler) {
  const router = Router();
  router.use(requireAuth(db, config), limit);

  // Only clients the caller is granted (admins: all): other clients' existence is never disclosed.
  router.get('/', async (req, res) => {
    const clients = await db.department.findMany({
      where: {
        deletedAt: null,
        ...(req.user!.role === 'ADMIN' ? {} : { grants: { some: { userId: req.user!.id } } }),
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        technologies: {
          where: { tag: { archivedAt: null, category: { slug: 'technology' } } },
          select: { tag: { select: { value: true } } },
        },
      },
    });
    // `technologies` = values of the department's active technologies; the question form offers only these.
    res.json({
      items: clients.map((c) => ({
        id: c.id,
        name: c.name,
        technologies: c.technologies.map((t) => t.tag.value).sort(),
      })),
    });
  });
  return router;
}
