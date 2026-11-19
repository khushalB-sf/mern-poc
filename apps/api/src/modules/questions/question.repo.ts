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
import type { Queryable } from '../../db/prisma.js';
import { encodeCursor } from '../../http/cursor.js';
import { AppError, notFound } from '../../http/errors.js';

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
  /** Only questions the actor wrote (still limited to what they may see). */
  mine?: boolean | undefined;
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
 * The single visibility rule. Department grants always apply, except to ADMIN, who sees everything.
 * On top of that, status limits what each role may read:
 *   USER     approved only            AUTHOR   approved + their own, at any status
 *   REVIEWER every status (they decide, and need to see what they decided)
 *   ADMIN    every status
 */
const visible = (actor: Actor) => {
  // Soft-deleted questions, and questions of a soft-deleted department, are gone for everyone, admins included.
  const live = Prisma.sql`(q.deleted_at IS NULL AND NOT EXISTS (
    SELECT 1 FROM department dc WHERE dc.id = q.department_id AND dc.deleted_at IS NOT NULL
  ))`;
  if (actor.role === 'ADMIN') return live;
  const granted = Prisma.sql`(
    q.department_id IS NULL
    OR EXISTS (SELECT 1 FROM department_grant g WHERE g.user_id = ${actor.id}::uuid AND g.department_id = q.department_id)
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
         q.updated_at AS "updatedAt", q.department_id AS "clientId", c.name AS "clientName",
         q.author_id AS "authorId", u.name AS "authorName", q.status,
         q.review_note AS "reviewNote", q.reviewed_at AS "reviewedAt",
         q.reviewed_by_id AS "reviewerId", rv.name AS "reviewerName"
  FROM question q
  JOIN app_user u ON u.id = q.author_id
  LEFT JOIN app_user rv ON rv.id = q.reviewed_by_id
  LEFT JOIN department c ON c.id = q.department_id`;

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
  if (f.clientId) conditions.push(Prisma.sql`q.department_id = ${f.clientId}::uuid`);
  if (f.status) conditions.push(Prisma.sql`q.status = ${f.status}::"QuestionStatus"`);
  if (f.mine) conditions.push(Prisma.sql`q.author_id = ${actor.id}::uuid`);
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
  db: Queryable,
  actor: Actor,
  text: string,
  threshold: number,
  limit = 5,
  /** An edit is never a duplicate of the question being edited. */
  excludeId?: string,
): Promise<SimilarQuestion[]> {
  const run = async (tx: Queryable) => {
    // `%` uses pg_trgm.similarity_threshold; set it locally so the index prefilter matches our rule.
    await tx.$queryRaw`SELECT set_config('pg_trgm.similarity_threshold', ${String(threshold)}, true)`;
    // ponytail: the planner mis-estimates `%` selectivity and seq-scans (72 ms at 5k rows vs 6 ms via the
    // GIN index). Forcing the index is fine at POC scale; revisit with real statistics on a big table.
    await tx.$queryRaw`SELECT set_config('enable_seqscan', 'off', true)`;
    const notSelf = excludeId ? Prisma.sql`AND q.id <> ${excludeId}::uuid` : Prisma.empty;
    return tx.$queryRaw<SimilarQuestion[]>`
      SELECT q.id, q."text", similarity(${NORMALISED_TEXT}, ${normalised(text)})::float8 AS similarity
      FROM question q
      WHERE ${visible(actor)}
        ${notSelf}
        AND ${NORMALISED_TEXT} % ${normalised(text)}
        AND similarity(${NORMALISED_TEXT}, ${normalised(text)}) >= ${threshold}::float4
      ORDER BY similarity DESC, q.id
      LIMIT ${limit}::int`;
  };
  // set_config(..., true) lasts for one transaction: reuse the caller's, or open one for this query.
  return '$transaction' in db ? db.$transaction(run) : run(db);
}

/**
 * Serialises everything that writes the same (normalised) question text: two people saving the same
 * question at once queue up here, so the second one sees the first one's row in its duplicate check.
 * Held until the surrounding transaction ends.
 */
export async function lockQuestionText(tx: Queryable, text: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${normalised(text)}, 0))`;
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
      departmentId: data.clientId,
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

/** Ids of the tags carried by global (department-less) questions: taxonomy only, no counts. */
export async function globalTagIds(db: Queryable): Promise<Set<string>> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT DISTINCT qt.tag_id AS id
    FROM question_tag qt
    JOIN question q ON q.id = qt.question_id
    WHERE q.deleted_at IS NULL AND q.department_id IS NULL`;
  return new Set(rows.map((r) => r.id));
}

/**
 * Admin only. Soft-deleted questions, newest deletion first, paged by a (deleted-at, id) cursor, flagged
 * when their department is also deleted.
 */
export async function listDeletedQuestions(
  db: Queryable,
  f: { limit: number; cursor?: [string, string] | undefined },
) {
  const at = f.cursor ? new Date(f.cursor[0]) : null;
  const rows = await db.question.findMany({
    where: {
      deletedAt: { not: null },
      ...(f.cursor &&
        at &&
        !Number.isNaN(at.getTime()) && {
          OR: [{ deletedAt: { lt: at } }, { deletedAt: at, id: { lt: f.cursor[1] } }],
        }),
    },
    orderBy: [{ deletedAt: 'desc' }, { id: 'desc' }],
    take: f.limit + 1,
    select: {
      id: true,
      text: true,
      status: true,
      deletedAt: true,
      author: { select: { id: true, name: true } },
      department: { select: { id: true, name: true, deletedAt: true } },
    },
  });
  const page = rows.slice(0, f.limit);
  const last = page.at(-1);
  return {
    items: page.map((r) => ({
      id: r.id,
      text: r.text,
      status: r.status,
      deletedAt: r.deletedAt!,
      author: r.author,
      department: r.department ? { id: r.department.id, name: r.department.name } : null,
      // Still hidden after a restore until its department is restored too.
      departmentDeleted: r.department?.deletedAt != null,
    })),
    nextCursor:
      rows.length > f.limit && last ? encodeCursor([last.deletedAt!.toISOString(), last.id]) : null,
  };
}

/** Admin only. Undoes softDeleteQuestion; refused while the question's department is deleted. */
export async function restoreQuestion(db: Queryable, id: string) {
  const row = await db.question.findFirst({
    where: { id, deletedAt: { not: null } },
    select: { text: true, department: { select: { name: true, deletedAt: true } } },
  });
  if (!row) throw notFound('Deleted question not found');
  if (row.department?.deletedAt) {
    throw new AppError(
      409,
      'DEPARTMENT_DELETED',
      `Restore the ${row.department.name} department first`,
    );
  }
  await db.question.update({ where: { id }, data: { deletedAt: null } });
  return { text: row.text };
}

/** What deleting a department hides: its live questions (and how many still await review). */
export async function departmentImpact(db: Queryable, departmentId: string) {
  const live = { departmentId, deletedAt: null };
  const [questions, pending] = await Promise.all([
    db.question.count({ where: live }),
    db.question.count({ where: { ...live, status: 'PENDING' } }),
  ]);
  return { questions, pending };
}

/** Number of live questions per tag; questions of a deleted department are hidden, so not counted. */
export async function tagUsageCounts(
  db: Queryable,
  /** Count only these tags (an admin page showing one department needs no more): far less to scan. */
  tagIds?: string[],
): Promise<Map<string, number>> {
  const rows = await db.questionTag.groupBy({
    by: ['tagId'],
    where: {
      ...(tagIds && { tagId: { in: tagIds } }),
      question: {
        deletedAt: null,
        OR: [{ departmentId: null }, { department: { deletedAt: null } }],
      },
    },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.tagId, r._count._all]));
}

/**
 * What is waiting for this person, counted through the same visibility rule as everything else, so a
 * number can never reveal a question they may not see. `toReview`: pending questions a reviewer could
 * decide (never their own; an admin may decide any). `mine`: their own questions by status.
 */
export async function reviewSummary(db: Queryable, actor: Actor) {
  const rows = await db.$queryRaw<{ status: QuestionStatus; own: boolean; n: bigint }[]>`
    SELECT t.status, t.own, count(*) AS n
    FROM (
      SELECT q.status, (q.author_id = ${actor.id}::uuid) AS own
      FROM question q
      WHERE ${visible(actor)}
    ) t
    GROUP BY t.status, t.own`;
  const sum = (pick: (r: (typeof rows)[number]) => boolean) =>
    rows.filter(pick).reduce((a, r) => a + Number(r.n), 0);
  const canReview = actor.role === 'REVIEWER' || actor.role === 'ADMIN';
  return {
    toReview: canReview
      ? sum((r) => r.status === 'PENDING' && (actor.role === 'ADMIN' || !r.own))
      : 0,
    mine: {
      pending: sum((r) => r.own && r.status === 'PENDING'),
      rejected: sum((r) => r.own && r.status === 'REJECTED'),
      approved: sum((r) => r.own && r.status === 'APPROVED'),
    },
  };
}

/** The text of those of `ids` the actor may see: the rest are simply absent (so no existence oracle). */
export async function visibleQuestionTexts(db: Queryable, actor: Actor, ids: string[]) {
  if (ids.length === 0) return new Map<string, { id: string; text: string }>();
  const rows = await db.$queryRaw<{ id: string; text: string }[]>`
    SELECT q.id, q."text" FROM question q WHERE q.id = ANY(${ids}::uuid[]) AND ${visible(actor)}`;
  return new Map(rows.map((r) => [r.id, r]));
}
