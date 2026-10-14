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
}

/**
 * History of one question. Callers must have checked the question is visible to the requester.
 * Payloads are NOT exposed wholesale: a DUPLICATE_OVERRIDDEN payload names other questions the
 * author could see, which this viewer may not be allowed to see. Only edit diffs (this question's
 * own fields) are returned.
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
  }));
}
