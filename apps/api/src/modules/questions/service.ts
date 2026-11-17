import type { Logger } from 'pino';
import type { InputJsonValue } from '../../generated/prisma/internal/prismaNamespace.js';
import type { Db } from '../../db/prisma.js';
import { AppError, forbidden, notFound } from '../../http/errors.js';
import { listHistory, recordAudit } from '../audit/audit.repo.js';
import { resolveTagIds } from '../tags/tags.js';
import type { AuthUser } from '../../types/express.js';
import {
  findSimilarQuestions,
  getVisibleQuestion,
  insertQuestion,
  lockQuestion,
  setReviewDecision,
  softDeleteQuestion,
  updateQuestionRow,
  type QuestionView,
} from './question.repo.js';

/** Trigram similarity at or above which a new question counts as a duplicate (ADR-007). */
export const DUPLICATE_THRESHOLD = 0.6;

export interface CreateInput {
  text: string;
  answerNotes: string;
  clientId?: string | undefined;
  tags: string[];
  confirmNotDuplicate: boolean;
}

export interface PatchInput {
  text?: string | undefined;
  answerNotes?: string | undefined;
  tags?: string[] | undefined;
}

export async function createQuestion(
  db: Db,
  log: Logger,
  actor: AuthUser,
  input: CreateInput,
): Promise<QuestionView> {
  if (input.clientId) {
    // Ungranted (or deleted) looks exactly like nonexistent: no client-existence oracle. Admins need no grant.
    const client = await db.client.findFirst({
      where: {
        id: input.clientId,
        deletedAt: null,
        ...(actor.role === 'ADMIN' ? {} : { grants: { some: { userId: actor.id } } }),
      },
      select: { id: true },
    });
    if (!client) throw notFound('Client not found');
  }
  const tagIds = await resolveTagIds(db, input.tags);

  // Compared only against questions this actor can see (IMP-04).
  const matches = await findSimilarQuestions(db, actor, input.text, DUPLICATE_THRESHOLD);
  if (matches.length > 0 && !input.confirmNotDuplicate) {
    // Committed on its own: the submission fails, but the attempt must leave a trace (AUD-01).
    await recordAudit(db, log, {
      type: 'DUPLICATE_REJECTED',
      actorId: actor.id,
      payload: { text: input.text, matches },
    });
    throw new AppError(409, 'DUPLICATE_SUSPECTED', 'A very similar question already exists', {
      matches,
    });
  }

  const id = await db.$transaction(async (tx) => {
    const created = await insertQuestion(tx, {
      text: input.text,
      answerNotes: input.answerNotes,
      authorId: actor.id,
      clientId: input.clientId ?? null,
      tagIds,
      approvedBy: actor.role === 'ADMIN' ? actor.id : undefined, // an admin's question needs no review
    });
    if (matches.length > 0) {
      await recordAudit(tx, log, {
        type: 'DUPLICATE_OVERRIDDEN',
        actorId: actor.id,
        questionId: created,
        payload: { matches },
      });
    }
    await recordAudit(tx, log, {
      type: 'QUESTION_CREATED',
      actorId: actor.id,
      questionId: created,
      payload: { text: input.text, clientId: input.clientId ?? null, tags: input.tags },
    });
    return created;
  });
  return (await getVisibleQuestion(db, actor, id))!;
}

const tagKeys = (q: QuestionView) => q.tags.map((t) => `${t.category}:${t.value}`).sort();

export async function updateQuestion(
  db: Db,
  log: Logger,
  actor: AuthUser,
  id: string,
  patch: PatchInput,
): Promise<QuestionView> {
  return db.$transaction(async (tx) => {
    await lockQuestion(tx, id);
    // 1. Visibility first: a question the actor cannot see is a plain 404, never a 403.
    const current = await getVisibleQuestion(tx, actor, id);
    if (!current) throw notFound('Question not found');

    // 2. Then role: an admin edits anything; an author edits their own; everyone else (reviewers included) is read-only.
    const isAdmin = actor.role === 'ADMIN';
    if (!isAdmin && (actor.role !== 'AUTHOR' || current.author.id !== actor.id)) throw forbidden();

    const changes: Record<string, { from: InputJsonValue; to: InputJsonValue }> = {};
    if (patch.text !== undefined && patch.text !== current.text) {
      changes.text = { from: current.text, to: patch.text };
    }
    if (patch.answerNotes !== undefined && patch.answerNotes !== current.answerNotes) {
      changes.answerNotes = { from: current.answerNotes, to: patch.answerNotes };
    }
    let tagIds: string[] | undefined;
    if (patch.tags !== undefined) {
      tagIds = await resolveTagIds(tx, patch.tags);
      const next = [...new Set(patch.tags)].sort();
      if (next.join() !== tagKeys(current).join()) {
        changes.tags = { from: tagKeys(current), to: next };
      }
    }
    if (Object.keys(changes).length === 0) return current; // no-op edit: nothing to record

    await updateQuestionRow(tx, id, {
      text: patch.text,
      answerNotes: patch.answerNotes,
      tagIds: changes.tags ? tagIds : undefined,
      resubmit: !isAdmin,
    });
    await recordAudit(tx, log, {
      type: 'QUESTION_UPDATED',
      actorId: actor.id,
      questionId: id,
      payload: { changes },
    });
    return (await getVisibleQuestion(tx, actor, id))!;
  });
}

export interface ReviewInput {
  decision: 'APPROVED' | 'REJECTED';
  note: string;
}

/**
 * Reviewer decision on a PENDING question; an admin may also overturn an earlier decision.
 * Same order as edits: visibility (404), role (403), state (409).
 */
export async function reviewQuestion(
  db: Db,
  log: Logger,
  actor: AuthUser,
  id: string,
  input: ReviewInput,
): Promise<QuestionView> {
  return db.$transaction(async (tx) => {
    await lockQuestion(tx, id); // two reviewers deciding at once: the second sees the first's result
    const current = await getVisibleQuestion(tx, actor, id);
    if (!current) throw notFound('Question not found');
    const isAdmin = actor.role === 'ADMIN';
    if (!isAdmin && actor.role !== 'REVIEWER') throw forbidden();
    // A role can change after a question was written, so "reviewer" does not rule out "author".
    if (!isAdmin && current.author.id === actor.id) {
      throw forbidden('You cannot review your own question');
    }
    if (!isAdmin && current.status !== 'PENDING') {
      throw new AppError(409, 'NOT_PENDING', 'This question has already been reviewed');
    }

    const note = input.note || null;
    await setReviewDecision(tx, id, {
      status: input.decision,
      note,
      reviewerId: actor.id,
      updatedAt: current.updatedAt,
    });
    await recordAudit(tx, log, {
      type: input.decision === 'APPROVED' ? 'QUESTION_APPROVED' : 'QUESTION_REJECTED',
      actorId: actor.id,
      questionId: id,
      payload: { note },
    });
    return (await getVisibleQuestion(tx, actor, id))!;
  });
}

/** Admin only. Soft delete: the question vanishes from every list and lookup, its history is kept. */
export async function deleteQuestion(db: Db, log: Logger, actor: AuthUser, id: string) {
  await db.$transaction(async (tx) => {
    await lockQuestion(tx, id);
    const current = await getVisibleQuestion(tx, actor, id);
    if (!current) throw notFound('Question not found');
    if (actor.role !== 'ADMIN') throw forbidden();
    await softDeleteQuestion(tx, id);
    await recordAudit(tx, log, {
      type: 'QUESTION_DELETED',
      actorId: actor.id,
      questionId: id,
      payload: { text: current.text },
    });
  });
}

export async function questionHistory(db: Db, actor: AuthUser, id: string) {
  if (!(await getVisibleQuestion(db, actor, id))) throw notFound('Question not found');
  return listHistory(db, id);
}
