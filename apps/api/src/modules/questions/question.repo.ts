/**
 * THE ONLY MODULE THAT READS THE `question` TABLE (ADR-005).
 *
 * Every function takes the acting user and embeds the visibility rule in the same SQL statement as
 * filtering, searching, counting and paging. Rows a user may not see are therefore never fetched,
 * counted or ranked: an invisible question is indistinguishable from one that does not exist.
 * An architecture-guard test fails if any other file references the table.
 */
import { Prisma } from '../../generated/prisma/client.js';
import type { QuestionStatus, Role } from '../../generated/prisma/enums.js';
import type { Db, Queryable } from '../../db/prisma.js';

export interface Actor {
  id: string;
  role: Role;
}

export interface SearchFilters {
  q?: string | undefined;
  /** Each inner array is an OR-set of tag ids; the groups are AND'ed. */
  tagGroups: string[][];
  clientId?: string | undefined;
  status?: QuestionStatus | undefined;
  limit: number;
  offset: number;
}

export interface QuestionView {
  id: string;
  text: string;
  answerNotes: string;
  client: { id: string; name: string } | null;
  tags: { category: string; value: string }[];
  author: { id: string; name: string };
  status: QuestionStatus;
  /** Set once a reviewer has decided; cleared when the author edits the question again. */
  review: { note: string | null; reviewer: { id: string; name: string }; at: Date } | null;
  createdAt: Date;
  updatedAt: Date;
}

interface Row {
  id: string;
  text: string;
  answerNotes: string;
  createdAt: Date;
  updatedAt: Date;
  clientId: string | null;
  clientName: string | null;
  authorId: string;
  authorName: string;
  status: QuestionStatus;
  reviewNote: string | null;
  reviewedAt: Date | null;
  reviewerId: string | null;
  reviewerName: string | null;
}

// Must match the expression index `question_search_idx` exactly, or Postgres cannot use it.
const SEARCH_VECTOR = Prisma.raw(
  `(setweight(to_tsvector('english', q."text"), 'A') || setweight(to_tsvector('english', q."answer_notes"), 'B'))`,
);

/**
 * The single visibility rule. Department (client) grants always apply, except to ADMIN, who sees everything.
 * On top of that, status limits what each role may read:
 *   USER     approved only            AUTHOR   approved + their own, at any status
 *   REVIEWER every status (they decide, and need to see what they decided)
 *   ADMIN    every status
 */
const visible = (actor: Actor) => {
  // Soft-deleted questions, and questions of a soft-deleted department, are gone for everyone, admins included.
  const live = Prisma.sql`(q.deleted_at IS NULL AND NOT EXISTS (
    SELECT 1 FROM client dc WHERE dc.id = q.client_id AND dc.deleted_at IS NOT NULL
  ))`;
  if (actor.role === 'ADMIN') return live;
  const granted = Prisma.sql`(
    q.client_id IS NULL
    OR EXISTS (SELECT 1 FROM client_grant g WHERE g.user_id = ${actor.id}::uuid AND g.client_id = q.client_id)
  )`;
  switch (actor.role) {
    case 'REVIEWER':
      return Prisma.sql`(${live} AND ${granted})`;
    case 'AUTHOR':
      return Prisma.sql`(${live} AND ${granted} AND (q.status = 'APPROVED' OR q.author_id = ${actor.id}::uuid))`;
    default:
      return Prisma.sql`(${live} AND ${granted} AND q.status = 'APPROVED')`;
  }
};

const SELECT = Prisma.sql`
  SELECT q.id, q."text", q.answer_notes AS "answerNotes", q.created_at AS "createdAt",
         q.updated_at AS "updatedAt", q.client_id AS "clientId", c.name AS "clientName",
         q.author_id AS "authorId", u.name AS "authorName", q.status,
         q.review_note AS "reviewNote", q.reviewed_at AS "reviewedAt",
         q.reviewed_by_id AS "reviewerId", rv.name AS "reviewerName"
  FROM question q
  JOIN app_user u ON u.id = q.author_id
  LEFT JOIN app_user rv ON rv.id = q.reviewed_by_id
  LEFT JOIN client c ON c.id = q.client_id`;

async function withTags(db: Queryable, rows: Row[]): Promise<QuestionView[]> {
  const tagRows = rows.length
    ? await db.$queryRaw<{ questionId: string; category: string; value: string }[]>`
        SELECT qt.question_id AS "questionId", tc.slug AS category, t.value
        FROM question_tag qt
        JOIN tag t ON t.id = qt.tag_id
        JOIN tag_category tc ON tc.id = t.category_id
        WHERE qt.question_id = ANY(${rows.map((r) => r.id)}::uuid[])
        ORDER BY tc.slug, t.value`
    : [];
  const byQuestion = new Map<string, { category: string; value: string }[]>();
  for (const t of tagRows) {
    const list = byQuestion.get(t.questionId) ?? [];
    list.push({ category: t.category, value: t.value });
    byQuestion.set(t.questionId, list);
  }
  return rows.map((r) => ({
    id: r.id,
    text: r.text,
    answerNotes: r.answerNotes,
    client: r.clientId ? { id: r.clientId, name: r.clientName! } : null,
    tags: byQuestion.get(r.id) ?? [],
    author: { id: r.authorId, name: r.authorName },
    status: r.status,
    review: r.reviewerId
      ? {
          note: r.reviewNote,
          reviewer: { id: r.reviewerId, name: r.reviewerName! },
          at: r.reviewedAt!,
        }
      : null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

export async function searchQuestions(db: Queryable, actor: Actor, f: SearchFilters) {
  const conditions = [visible(actor)];
  if (f.clientId) conditions.push(Prisma.sql`q.client_id = ${f.clientId}::uuid`);
  if (f.status) conditions.push(Prisma.sql`q.status = ${f.status}::"QuestionStatus"`);
  if (f.q) {
    conditions.push(Prisma.sql`${SEARCH_VECTOR} @@ websearch_to_tsquery('english', ${f.q})`);
  }
  for (const ids of f.tagGroups) {
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM question_tag qt WHERE qt.question_id = q.id AND qt.tag_id = ANY(${ids}::uuid[])
    )`);
  }
  const where = Prisma.join(conditions, ' AND ');
  const order = f.q
    ? Prisma.sql`ts_rank(${SEARCH_VECTOR}, websearch_to_tsquery('english', ${f.q})) DESC, q.created_at DESC, q.id DESC`
    : Prisma.sql`q.created_at DESC, q.id DESC`;

  const [rows, counted] = await Promise.all([
    db.$queryRaw<
      Row[]
    >`${SELECT} WHERE ${where} ORDER BY ${order} LIMIT ${f.limit}::int OFFSET ${f.offset}::int`,
    db.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM question q WHERE ${where}`,
  ]);
  return { items: await withTags(db, rows), total: Number(counted[0]?.n ?? 0) };
}

/** null when the question does not exist OR the actor may not see it (callers must not distinguish). */
export async function getVisibleQuestion(db: Queryable, actor: Actor, id: string) {
  const rows = await db.$queryRaw<Row[]>`${SELECT} WHERE q.id = ${id}::uuid AND ${visible(actor)}`;
  return (await withTags(db, rows))[0] ?? null;
}

// Must match the expression index `question_text_trgm_idx` exactly.
const NORMALISED_TEXT = Prisma.raw(
  `btrim(regexp_replace(lower(q."text"), '[^[:alnum:]]+', ' ', 'g'))`,
);
const normalised = (text: string) =>
  Prisma.sql`btrim(regexp_replace(lower(${text}::text), '[^[:alnum:]]+', ' ', 'g'))`;

export type SimilarQuestion = { id: string; text: string; similarity: number };

/**
 * Near-duplicates of `text` among the questions the actor can see (ADR-007). Restricted questions
 * the actor cannot see are never compared, so they can never be hinted at.
 */
export async function findSimilarQuestions(
  db: Db,
  actor: Actor,
  text: string,
  threshold: number,
  limit = 5,
): Promise<SimilarQuestion[]> {
  return db.$transaction(async (tx) => {
    // `%` uses pg_trgm.similarity_threshold; set it locally so the index prefilter matches our rule.
    await tx.$queryRaw`SELECT set_config('pg_trgm.similarity_threshold', ${String(threshold)}, true)`;
    // ponytail: the planner mis-estimates `%` selectivity and seq-scans (72 ms at 5k rows vs 6 ms via the
    // GIN index). Forcing the index is fine at POC scale; revisit with real statistics on a big table.
    await tx.$queryRaw`SELECT set_config('enable_seqscan', 'off', true)`;
    const rows = await tx.$queryRaw<SimilarQuestion[]>`
      SELECT q.id, q."text", similarity(${NORMALISED_TEXT}, ${normalised(text)})::float8 AS similarity
      FROM question q
      WHERE ${visible(actor)}
        AND ${NORMALISED_TEXT} % ${normalised(text)}
        AND similarity(${NORMALISED_TEXT}, ${normalised(text)}) >= ${threshold}::float4
      ORDER BY similarity DESC, q.id
      LIMIT ${limit}::int`;
    return rows;
  });
}

export async function insertQuestion(
  db: Queryable,
  data: {
    text: string;
    answerNotes: string;
    authorId: string;
    clientId: string | null;
    tagIds: string[];
    /** Set for an admin-authored question: it skips review and is approved by its creator. */
    approvedBy?: string | undefined;
  },
) {
  const row = await db.question.create({
    data: {
      text: data.text,
      answerNotes: data.answerNotes,
      authorId: data.authorId,
      clientId: data.clientId,
      ...(data.approvedBy && {
        status: 'APPROVED' as const,
        reviewedById: data.approvedBy,
        reviewedAt: new Date(),
      }),
      tags: { create: data.tagIds.map((tagId) => ({ tagId })) },
    },
    select: { id: true },
  });
  return row.id;
}

/** Applies a partial edit and resubmits the question for review. `tagIds`, when given, replaces the question's tag set. */
export async function updateQuestionRow(
  db: Queryable,
  id: string,
  data: {
    text?: string | undefined;
    answerNotes?: string | undefined;
    tagIds?: string[] | undefined;
    /** False for an admin edit: admins are the final word, so the status and decision stay as they are. */
    resubmit?: boolean | undefined;
  },
) {
  const resubmit = data.resubmit ?? true;
  await db.question.update({
    where: { id },
    data: {
      ...(data.text !== undefined && { text: data.text }),
      ...(data.answerNotes !== undefined && { answerNotes: data.answerNotes }),
      updatedAt: new Date(), // also bumps on tag-only edits
      // An author's real edit invalidates the earlier decision: back to the reviewers' queue.
      ...(resubmit && {
        status: 'PENDING' as const,
        reviewNote: null,
        reviewedById: null,
        reviewedAt: null,
      }),
      ...(data.tagIds !== undefined && {
        tags: { deleteMany: {}, create: data.tagIds.map((tagId) => ({ tagId })) },
      }),
    },
  });
}

/**
 * Row lock for the rest of the transaction. Review and edit both read-then-write the question's status,
 * so they take this first: a reviewer can never approve content the author changed a moment earlier.
 */
export async function lockQuestion(db: Queryable, id: string) {
  await db.$queryRaw`SELECT 1 FROM question WHERE id = ${id}::uuid FOR UPDATE`;
}

export async function setReviewDecision(
  db: Queryable,
  id: string,
  d: {
    status: 'APPROVED' | 'REJECTED';
    note: string | null;
    reviewerId: string;
    /** Passed back unchanged: a decision is not a content edit, but Prisma would otherwise bump it. */
    updatedAt: Date;
  },
) {
  await db.question.update({
    where: { id },
    data: {
      status: d.status,
      reviewNote: d.note,
      reviewedById: d.reviewerId,
      reviewedAt: new Date(),
      updatedAt: d.updatedAt,
    },
  });
}

/** Admin delete. Soft: the row, its tags and its audit trail stay, but every read path excludes it. */
export async function softDeleteQuestion(db: Queryable, id: string) {
  await db.question.update({ where: { id }, data: { deletedAt: new Date() } });
}
