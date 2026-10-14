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
    // Ungranted looks exactly like nonexistent: no client-existence oracle.
    const grant = await db.clientGrant.findUnique({
      where: { userId_clientId: { userId: actor.id, clientId: input.clientId } },
    });
    if (!grant) throw notFound('Client not found');
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
    // 1. Visibility first: a question the actor cannot see is a plain 404, never a 403.
    const current = await getVisibleQuestion(tx, actor, id);
    if (!current) throw notFound('Question not found');

    // 2. Then role: reviewers edit anything visible, authors only their own, everyone else is read-only.
    const allowed =
      actor.role === 'REVIEWER' || (actor.role === 'AUTHOR' && current.author.id === actor.id);
    if (!allowed) throw forbidden();

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

export async function questionHistory(db: Db, actor: AuthUser, id: string) {
  if (!(await getVisibleQuestion(db, actor, id))) throw notFound('Question not found');
  return listHistory(db, id);
}
