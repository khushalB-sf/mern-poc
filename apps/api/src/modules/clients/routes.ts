import { Router } from 'express';
import type { Config } from '../../config/env.js';
import type { Db } from '../../db/prisma.js';
import { requireAuth } from '../auth/middleware.js';

export function clientRoutes(db: Db, config: Config) {
  const router = Router();
  router.use(requireAuth(db, config));

  // Only clients the caller is granted: other clients' existence is never disclosed.
  router.get('/', async (req, res) => {
    const clients = await db.client.findMany({
      where: { grants: { some: { userId: req.user!.id } } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
    res.json({ items: clients });
  });
  return router;
}
