/**
 * THE ONLY MODULE THAT READS THE `question` TABLE (ADR-005).
 *
 * Every function takes the acting user and embeds the visibility rule in the same SQL statement as
 * filtering, searching, counting and paging. Rows a user may not see are therefore never fetched,
 * counted or ranked: an invisible question is indistinguishable from one that does not exist.
 * An architecture-guard test fails if any other file references the table.
 */
import { Prisma } from '../../generated/prisma/client.js';
import type { Db } from '../../db/prisma.js';

export interface Actor {
  id: string;
}

export interface SearchFilters {
  q?: string | undefined;
  /** Each inner array is an OR-set of tag ids; the groups are AND'ed. */
  tagGroups: string[][];
  clientId?: string | undefined;
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
}

// Must match the expression index `question_search_idx` exactly, or Postgres cannot use it.
const SEARCH_VECTOR = Prisma.raw(
  `(setweight(to_tsvector('english', q."text"), 'A') || setweight(to_tsvector('english', q."answer_notes"), 'B'))`,
);

const visible = (actor: Actor) => Prisma.sql`(
  q.client_id IS NULL
  OR EXISTS (SELECT 1 FROM client_grant g WHERE g.user_id = ${actor.id}::uuid AND g.client_id = q.client_id)
)`;

const SELECT = Prisma.sql`
  SELECT q.id, q."text", q.answer_notes AS "answerNotes", q.created_at AS "createdAt",
         q.updated_at AS "updatedAt", q.client_id AS "clientId", c.name AS "clientName",
         q.author_id AS "authorId", u.name AS "authorName"
  FROM question q
  JOIN app_user u ON u.id = q.author_id
  LEFT JOIN client c ON c.id = q.client_id`;

async function withTags(db: Db, rows: Row[]): Promise<QuestionView[]> {
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
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

export async function searchQuestions(db: Db, actor: Actor, f: SearchFilters) {
  const conditions = [visible(actor)];
  if (f.clientId) conditions.push(Prisma.sql`q.client_id = ${f.clientId}::uuid`);
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
export async function getVisibleQuestion(db: Db, actor: Actor, id: string) {
  const rows = await db.$queryRaw<Row[]>`${SELECT} WHERE q.id = ${id}::uuid AND ${visible(actor)}`;
  return (await withTags(db, rows))[0] ?? null;
}
