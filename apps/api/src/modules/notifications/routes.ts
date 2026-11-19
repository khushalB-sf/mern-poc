import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { Config } from '../../config/env.js';
import type { Db } from '../../db/prisma.js';
import { validateBody } from '../../http/validate.js';
import { requireAuth } from '../auth/middleware.js';
import { visibleQuestionTexts } from '../questions/question.repo.js';

const LIMIT = 50;

export const markReadSchema = z
  .strictObject({
    ids: z.array(z.uuid()).min(1).max(100).optional(),
    all: z.literal(true).optional(),
  })
  .refine((b) => (b.ids === undefined) !== (b.all === undefined), 'Send either ids or all');

export function notificationRoutes(db: Db, config: Config, limit: RequestHandler) {
  const router = Router();
  router.use(requireAuth(db, config), limit);

  router.get('/', async (req, res) => {
    const me = req.user!;
    const [rows, unreadCount] = await Promise.all([
      db.notification.findMany({
        where: { userId: me.id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: LIMIT,
      }),
      db.notification.count({ where: { userId: me.id, readAt: null } }),
    ]);
    // Only ids are stored. The text is looked up now, through the visibility rule: lose the right to see
    // the question (a grant removed, the question deleted) and the notification no longer carries it.
    const texts = await visibleQuestionTexts(
      db,
      me,
      rows.map((r) => r.questionId),
    );
    res.json({
      items: rows.map((r) => ({
        id: r.id,
        type: r.type,
        questionId: r.questionId,
        at: r.createdAt,
        readAt: r.readAt,
        question: texts.get(r.questionId) ?? null,
      })),
      unreadCount,
    });
  });

  // Someone else's ids simply match nothing: the answer is the same either way.
  router.post('/read', validateBody(markReadSchema), async (req, res) => {
    await db.notification.updateMany({
      where: {
        userId: req.user!.id,
        readAt: null,
        ...(req.body.ids ? { id: { in: req.body.ids as string[] } } : {}),
      },
      data: { readAt: new Date() },
    });
    res.status(204).end();
  });

  return router;
}
