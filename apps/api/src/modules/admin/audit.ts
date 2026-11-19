import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { validateQuery } from '../../http/validate.js';
import type { Db } from '../../db/prisma.js';
import { decodeCursor, listAudit } from '../audit/audit.repo.js';

const AUDIT_TYPES = [
  'QUESTION_CREATED',
  'QUESTION_UPDATED',
  'DUPLICATE_REJECTED',
  'DUPLICATE_OVERRIDDEN',
  'QUESTION_APPROVED',
  'QUESTION_REJECTED',
  'QUESTION_DELETED',
  'QUESTION_RESTORED',
  'USER_ROLE_CHANGED',
  'USER_CLIENTS_CHANGED',
  'USER_CREATED',
  'USER_UPDATED',
  'USER_DELETED',
  'USER_RESTORED',
  'CLIENT_CREATED',
  'CLIENT_UPDATED',
  'CLIENT_DELETED',
  'CLIENT_RESTORED',
  'TAG_ARCHIVED',
  'TAG_RESTORED',
  'TAG_CREATED',
  'TAG_UPDATED',
  'TAG_LINKED',
  'TAG_UNLINKED',
  'PASSWORD_CHANGED',
  'PASSWORD_RESET_LINK_CREATED',
  'PASSWORD_RESET_USED',
  'MFA_ENABLED',
  'MFA_DISABLED',
  'MFA_RESET',
] as const;

const date = (end: boolean) =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}(T[\d:.]+Z)?$/, 'Use a date like 2026-05-01')
    .transform((v) => new Date(v.length === 10 ? `${v}T00:00:00.000Z` : v))
    .refine((d) => !Number.isNaN(d.getTime()), 'Not a real date')
    .transform((d) => (end ? d : d));

const querySchema = z.strictObject({
  type: z.enum(AUDIT_TYPES).optional(),
  actorId: z.uuid().optional(),
  from: date(false).optional(),
  to: date(true).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z
    .string()
    .max(200)
    .transform((v, ctx) => {
      const c = decodeCursor(v);
      if (!c) ctx.addIssue({ code: 'custom', message: 'Invalid cursor' });
      return c as { at: Date; id: string };
    })
    .optional(),
});

const EXPORT_CAP = 5000;
const HEADER = ['time', 'type', 'actor', 'actor_id', 'question_id', 'details'];

/**
 * One CSV cell. Quoted always, quotes doubled. A cell that starts with = + - @ (or a tab or return) would be
 * run as a formula by a spreadsheet, so it gets a leading apostrophe: names and notes are user input.
 */
export const csvCell = (value: unknown): string => {
  let v = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return `"${v.replace(/"/g, '""')}"`;
};

type Q = z.infer<typeof querySchema>;

export function auditRoutes(db: Db) {
  const router = Router();

  router.get('/', validateQuery(querySchema), async (_req: Request, res: Response) => {
    res.json(await listAudit(db, res.locals.query as Q));
  });

  router.get('/export', validateQuery(querySchema), async (_req: Request, res: Response) => {
    const q = res.locals.query as Q;
    const rows: string[] = [HEADER.join(',')];
    let cursor = q.cursor;
    let truncated = false;
    while (rows.length - 1 < EXPORT_CAP) {
      const page = await listAudit(db, { ...q, limit: 500, cursor });
      for (const e of page.items) {
        rows.push(
          [
            e.at.toISOString(),
            e.type,
            e.actor.name,
            e.actor.id,
            e.questionId,
            JSON.stringify(e.payload),
          ]
            .map(csvCell)
            .join(','),
        );
      }
      if (!page.nextCursor) break;
      cursor = decodeCursor(page.nextCursor) ?? undefined;
      if (rows.length - 1 >= EXPORT_CAP) truncated = true;
    }
    res
      .type('text/csv')
      .set(
        'Content-Disposition',
        `attachment; filename="audit-${new Date().toISOString().slice(0, 10)}.csv"`,
      )
      .set('X-Truncated', String(truncated))
      .send(rows.join('\r\n') + '\r\n');
  });

  return router;
}
