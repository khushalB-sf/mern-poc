import type { Logger } from 'pino';
import type { Queryable } from '../../db/prisma.js';
import type { AuditType } from '../../generated/prisma/enums.js';
import type { InputJsonValue } from '../../generated/prisma/internal/prismaNamespace.js';

export interface AuditInput {
  type: AuditType;
  actorId: string;
  questionId?: string | undefined;
  payload?: InputJsonValue;
}

/**
 * Writes the audit row (ADR-008) and a structured log line. Pass the transaction client so the
 * event commits or rolls back together with the change it describes.
 */
export async function recordAudit(db: Queryable, log: Logger, e: AuditInput) {
  const row = await db.auditEvent.create({
    data: {
      type: e.type,
      actorId: e.actorId,
      questionId: e.questionId ?? null,
      payload: e.payload ?? {},
    },
  });
  log.info(
    { audit: { type: e.type, actorId: e.actorId, questionId: e.questionId ?? null, at: row.at } },
    'audit',
  );
  return row;
}

export interface HistoryItem {
  id: string;
  type: AuditType;
  at: Date;
  actor: { id: string; name: string };
  changes?: unknown;
  /** Reviewer's note on QUESTION_APPROVED / QUESTION_REJECTED. */
  note?: string | null;
}

/**
 * History of one question. Callers must have checked the question is visible to the requester.
 * Payloads are NOT exposed wholesale: a DUPLICATE_OVERRIDDEN payload names other questions the
 * author could see, which this viewer may not be allowed to see. Only edit diffs and review notes
 * (both about this question itself) are returned.
 */
export async function listHistory(db: Queryable, questionId: string): Promise<HistoryItem[]> {
  const rows = await db.auditEvent.findMany({
    where: { questionId },
    orderBy: [{ at: 'asc' }, { id: 'asc' }],
    include: { actor: { select: { id: true, name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    at: r.at,
    actor: r.actor,
    ...(r.type === 'QUESTION_UPDATED'
      ? { changes: (r.payload as { changes?: unknown }).changes ?? {} }
      : {}),
    ...(r.type === 'QUESTION_APPROVED' || r.type === 'QUESTION_REJECTED'
      ? { note: (r.payload as { note?: string | null }).note ?? null }
      : {}),
  }));
}

export interface AuditFilters {
  type?: AuditType | undefined;
  actorId?: string | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  limit: number;
  cursor?: { at: Date; id: string } | undefined;
}

const encodeCursor = (c: { at: Date; id: string }) =>
  Buffer.from(`${c.at.toISOString()}|${c.id}`).toString('base64url');

/** The cursor is "<iso time>|<uuid>"; anything else is rejected rather than guessed at. */
export function decodeCursor(raw: string): { at: Date; id: string } | null {
  const [at, id, ...rest] = Buffer.from(raw, 'base64url').toString().split('|');
  if (rest.length > 0 || !at || !id) return null;
  const date = new Date(at);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return Number.isNaN(date.getTime()) || !uuid.test(id) || date.toISOString() !== at
    ? null
    : { at: date, id };
}

/**
 * Every event, newest first, paged by a (time, id) cursor so events that share a timestamp are neither
 * skipped nor repeated. Admin-only: payloads here are not trimmed the way a question's history is.
 */
export async function listAudit(db: Queryable, f: AuditFilters) {
  const rows = await db.auditEvent.findMany({
    where: {
      ...(f.type && { type: f.type }),
      ...(f.actorId && { actorId: f.actorId }),
      ...((f.from || f.to) && {
        at: { ...(f.from && { gte: f.from }), ...(f.to && { lt: f.to }) },
      }),
      ...(f.cursor && {
        OR: [{ at: { lt: f.cursor.at } }, { at: f.cursor.at, id: { lt: f.cursor.id } }],
      }),
    },
    orderBy: [{ at: 'desc' }, { id: 'desc' }],
    take: f.limit + 1,
    include: { actor: { select: { id: true, name: true } } },
  });
  const page = rows.slice(0, f.limit);
  const last = page.at(-1);
  return {
    items: page.map((r) => ({
      id: r.id,
      type: r.type,
      at: r.at,
      actor: r.actor,
      questionId: r.questionId,
      payload: r.payload,
    })),
    nextCursor: rows.length > f.limit && last ? encodeCursor({ at: last.at, id: last.id }) : null,
  };
}
