import type { Logger } from 'pino';
import type { InputJsonValue } from '../../generated/prisma/internal/prismaNamespace.js';
import type { Db } from '../../db/prisma.js';
import { AppError, forbidden, notFound } from '../../http/errors.js';
import { listHistory, recordAudit } from '../audit/audit.repo.js';
import { resolveTagIds } from '../tags/tags.js';
import type { AuthUser } from '../../types/express.js';
import {
  findSimilarQuestions,
  lockQuestionText,
  getVisibleQuestion,
  insertQuestion,
  lockQuestion,
  setReviewDecision,
  softDeleteQuestion,
  updateQuestionRow,
  type QuestionView,
  type SimilarQuestion,
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
  expectedUpdatedAt?: string | undefined;
  /** Save even though it looks like another question (like on create). */
  confirmNotDuplicate?: boolean | undefined;
}

export async function createQuestion(
  db: Db,
  log: Logger,
  actor: AuthUser,
  input: CreateInput,
): Promise<QuestionView> {
  if (input.clientId) {
    // Ungranted (or deleted) looks exactly like nonexistent: no client-existence oracle. Admins need no grant.
    const client = await db.department.findFirst({
      where: {
        id: input.clientId,
        deletedAt: null,
        ...(actor.role === 'ADMIN' ? {} : { grants: { some: { userId: actor.id } } }),
      },
      select: { id: true },
    });
    if (!client) throw notFound('Client not found');
  }
  const tagIds = await resolveTagIds(db, input.tags, [], input.clientId ?? null);

  // The duplicate check runs inside the transaction, after taking a lock on this text, so two people saving
  // the same question at the same moment cannot both pass it. Compared only against questions this actor
  // can see (IMP-04).
  const outcome = await db.$transaction(async (tx) => {
    await lockQuestionText(tx, input.text);
    const matches = await findSimilarQuestions(tx, actor, input.text, DUPLICATE_THRESHOLD);
    if (matches.length > 0 && !input.confirmNotDuplicate) return { id: null, matches };

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
    return { id: created, matches };
  });
  if (outcome.id === null) await rejectDuplicate(db, log, actor, input.text, outcome.matches);
  const id = outcome.id!;
  return (await getVisibleQuestion(db, actor, id))!;
}

/** The refusal is committed on its own, after the transaction rolled back: the attempt must leave a trace (AUD-01). */
async function rejectDuplicate(
  db: Db,
  log: Logger,
  actor: AuthUser,
  text: string,
  matches: SimilarQuestion[],
): Promise<never> {
  await recordAudit(db, log, {
    type: 'DUPLICATE_REJECTED',
    actorId: actor.id,
    payload: { text, matches },
  });
  throw new AppError(409, 'DUPLICATE_SUSPECTED', 'A very similar question already exists', {
    matches,
  });
}

const tagKeys = (q: QuestionView) => q.tags.map((t) => `${t.category}:${t.value}`).sort();

export async function updateQuestion(
  db: Db,
  log: Logger,
  actor: AuthUser,
  id: string,
  patch: PatchInput,
): Promise<QuestionView> {
  const outcome = await db.$transaction(async (tx) => {
    await lockQuestion(tx, id);
    // 1. Visibility first: a question the actor cannot see is a plain 404, never a 403.
    const current = await getVisibleQuestion(tx, actor, id);
    if (!current) throw notFound('Question not found');

    // 2. Then role: an admin edits anything; an author edits their own; everyone else (reviewers included) is read-only.
    const isAdmin = actor.role === 'ADMIN';
    if (!isAdmin && (actor.role !== 'AUTHOR' || current.author.id !== actor.id)) throw forbidden();

    // 3. Then freshness: the question must be what the editor was looking at (a lost update is a 409).
    if (
      patch.expectedUpdatedAt !== undefined &&
      new Date(patch.expectedUpdatedAt).getTime() !== current.updatedAt.getTime()
    ) {
      throw new AppError(
        409,
        'EDIT_CONFLICT',
        'Someone else changed this question while you were editing it. Reload to see their version.',
      );
    }

    const changes: Record<string, { from: InputJsonValue; to: InputJsonValue }> = {};
    if (patch.text !== undefined && patch.text !== current.text) {
      changes.text = { from: current.text, to: patch.text };
    }
    if (patch.answerNotes !== undefined && patch.answerNotes !== current.answerNotes) {
      changes.answerNotes = { from: current.answerNotes, to: patch.answerNotes };
    }
    let tagIds: string[] | undefined;
    if (patch.tags !== undefined) {
      tagIds = await resolveTagIds(tx, patch.tags, tagKeys(current), current.client?.id ?? null);
      const next = [...new Set(patch.tags)].sort();
      if (next.join() !== tagKeys(current).join()) {
        changes.tags = { from: tagKeys(current), to: next };
      }
    }
    if (Object.keys(changes).length === 0) return { done: current }; // no-op edit: nothing to record

    // A new wording is checked like a new question (same lock, same rule), but never against itself.
    let overridden: SimilarQuestion[] = [];
    if (changes.text && patch.text !== undefined) {
      await lockQuestionText(tx, patch.text);
      const matches = await findSimilarQuestions(tx, actor, patch.text, DUPLICATE_THRESHOLD, 5, id);
      if (matches.length > 0 && !patch.confirmNotDuplicate) return { duplicate: matches };
      overridden = matches;
    }

    await updateQuestionRow(tx, id, {
      text: patch.text,
      answerNotes: patch.answerNotes,
      tagIds: changes.tags ? tagIds : undefined,
      resubmit: !isAdmin,
    });
    if (overridden.length > 0) {
      await recordAudit(tx, log, {
        type: 'DUPLICATE_OVERRIDDEN',
        actorId: actor.id,
        questionId: id,
        payload: { matches: overridden },
      });
    }
    await recordAudit(tx, log, {
      type: 'QUESTION_UPDATED',
      actorId: actor.id,
      questionId: id,
      payload: { changes },
    });
    return { done: (await getVisibleQuestion(tx, actor, id))! };
  });
  if ('duplicate' in outcome) {
    await rejectDuplicate(db, log, actor, patch.text!, outcome.duplicate ?? []);
  }
  return outcome.done!;
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
    // Tell the author (not a reviewer who is deciding their own, which only an admin may do).
    if (current.author.id !== actor.id) {
      await tx.notification.create({
        data: {
          userId: current.author.id,
          type: input.decision === 'APPROVED' ? 'QUESTION_APPROVED' : 'QUESTION_REJECTED',
          questionId: id,
        },
      });
    }
    await recordAudit(tx, log, {
      type: input.decision === 'APPROVED' ? 'QUESTION_APPROVED' : 'QUESTION_REJECTED',
      actorId: actor.id,
      questionId: id,
      payload: { note },
    });
    return (await getVisibleQuestion(tx, actor, id))!;
  });
}

/** Soft delete (admin: any question; author: their own until approved): it vanishes from every list and lookup, its history is kept. */
export async function deleteQuestion(db: Db, log: Logger, actor: AuthUser, id: string) {
  await db.$transaction(async (tx) => {
    await lockQuestion(tx, id);
    const current = await getVisibleQuestion(tx, actor, id);
    if (!current) throw notFound('Question not found');
    // An admin may delete anything. An author may withdraw their own question until it is approved:
    // approved questions are shared content, so only an admin removes those.
    const ownUnapproved = current.author.id === actor.id && current.status !== 'APPROVED';
    if (actor.role !== 'ADMIN' && !ownUnapproved) throw forbidden();
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
