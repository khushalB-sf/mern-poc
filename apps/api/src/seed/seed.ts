import { randomUUID } from 'node:crypto';
import type { Db } from '../db/prisma.js';
import { hashPassword } from '../modules/auth/password.js';
import {
  BEHAVIOURS,
  CATEGORIES,
  DEPARTMENTS,
  FIXTURES,
  FOLLOWUPS,
  GENERAL_TOPICS,
  REVIEW_DEMO,
  TOPICS,
  USERS,
} from './data.js';

// Deterministic PRNG (mulberry32) so every run produces the same questions.
function prng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const levelTags = CATEGORIES[1].tags.map(([v]) => v);
const techLabel = new Map<string, string>(CATEGORIES[0].tags.map(([v, l]) => [v, l]));

export interface SeedOptions {
  password: string;
  questionCount?: number;
}

/** True when the database has no users and no questions, i.e. it is safe to seed. */
export async function isEmpty(db: Db) {
  const [users, questions] = await Promise.all([db.appUser.count(), db.question.count()]);
  return users === 0 && questions === 0;
}

export async function seed(db: Db, { password, questionCount = 1500 }: SeedOptions) {
  const rand = prng(20261014);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
  const sample = <T>(xs: readonly T[], n: number): T[] =>
    [...xs].sort(() => rand() - 0.5).slice(0, n);

  const passwordHash = await hashPassword(password);

  const clients = await Promise.all(
    DEPARTMENTS.map((d) => db.client.create({ data: { name: d.name } })),
  );
  const users = await Promise.all(
    USERS.map((u) =>
      db.appUser.create({
        data: {
          email: u.email,
          name: u.name,
          role: u.role,
          passwordHash,
          grants: { create: u.grants.map((i) => ({ clientId: clients[i]!.id })) },
        },
      }),
    ),
  );
  const userByEmail = new Map(users.map((u) => [u.email, u]));

  const tagId = new Map<string, string>(); // "category:value" -> id
  for (const c of CATEGORIES) {
    const cat = await db.tagCategory.create({ data: { slug: c.slug, name: c.name } });
    for (const [value, label] of c.tags) {
      const t = await db.tag.create({ data: { categoryId: cat.id, value, label } });
      tagId.set(`${c.slug}:${value}`, t.id);
    }
  }

  // Each department's technologies (shared ones like Node.js sit under several departments).
  await db.clientTag.createMany({
    data: DEPARTMENTS.flatMap((d, i) =>
      d.techs.map((t) => ({ clientId: clients[i]!.id, tagId: tagId.get(`technology:${t}`)! })),
    ),
  });

  // Who may author what: a department question needs an author granted for that department.
  const authors = USERS.filter((u) => u.role === 'AUTHOR');
  const authorsFor = (dept: number | null) =>
    authors
      .filter((u) => dept === null || (u.grants as readonly number[]).includes(dept))
      .map((u) => userByEmail.get(u.email)!);

  type Row = {
    id: string;
    text: string;
    notes: string;
    authorId: string;
    clientId: string | null;
    tags: string[];
    at: Date;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    note?: string;
  };
  const rows: Row[] = [];
  const base = Date.UTC(2026, 0, 1);
  const addRow = (
    r: Omit<Row, 'id' | 'authorId' | 'clientId' | 'at' | 'status'> & {
      client: number | null;
      status?: Row['status'];
    },
    n: number,
  ) => {
    const { client, status, ...rest } = r;
    rows.push({
      ...rest,
      id: randomUUID(),
      authorId: pick(authorsFor(client)).id,
      clientId: client === null ? null : clients[client]!.id,
      at: new Date(base + n * 60_000),
      status: status ?? 'APPROVED',
    });
  };

  for (const f of FIXTURES)
    addRow({ text: f.text, notes: f.notes, tags: [...f.tags], client: f.client }, 0);

  const withLevel = (type: string, tech: readonly string[]) => {
    const tags = tech.map((t) => `technology:${t}`);
    tags.push(`type:${type}`, `seniority:${pick(levelTags)}`);
    if (rand() < 0.2) tags.push(`seniority:${pick(levelTags)}`);
    return [...new Set(tags)];
  };

  // Department question: built only from that department's technologies and their own topics.
  const departmentQuestion = (d: (typeof DEPARTMENTS)[number]) => {
    const kind = Math.floor(rand() * 10);
    const tech = pick(d.techs);
    const label = techLabel.get(tech)!;
    const topics = TOPICS[tech]!;
    const [a, b] = sample(topics, 2) as [string, string];
    if (kind < 3) {
      return {
        text: `Explain ${a} in ${label}.`,
        notes: `A strong answer defines ${a}, gives a concrete ${label} example and names common pitfalls. Follow-up: ${pick(FOLLOWUPS)}.`,
        tags: withLevel(pick(['technical', 'screening']), [tech]),
      };
    }
    if (kind < 6) {
      return {
        text: `What are the trade-offs between ${a} and ${b} in ${label}?`,
        notes: `A strong answer compares ${a} and ${b} with an example and says when each one wins. Follow-up: ${pick(FOLLOWUPS)}.`,
        tags: withLevel('technical', [tech]),
      };
    }
    if (kind < 8) {
      return {
        text: `How would you test and debug problems with ${a} in ${label}?`,
        notes: `A strong answer names the tools and signals it would use for ${a}, and how it reproduces the problem. Follow-up: ${pick(FOLLOWUPS)}.`,
        tags: withLevel(pick(['technical', 'coding']), [tech]),
      };
    }
    if (kind < 9) {
      const task = pick(d.tasks);
      return {
        text: `Walk me through how you would ${task}.`,
        notes: `Look for a clear sequence of steps, the trade-offs, and how the candidate would verify it works. Follow-up: ${pick(FOLLOWUPS)}.`,
        tags: withLevel('coding', sample(d.techs, 2)),
      };
    }
    return {
      text: `Design ${pick(d.systems)}. Which trade-offs would you make?`,
      notes: `Look for requirements first, then data model, scaling and failure handling. Follow-up: ${pick(FOLLOWUPS)}.`,
      tags: withLevel('system-design', sample(d.techs, 2)),
    };
  };

  // Global question: behavioural, or a practice that applies to every department. No technology tag.
  const globalQuestion = () => {
    const kind = Math.floor(rand() * 8);
    if (kind === 0) {
      return {
        text: `Describe a time you had to ${pick(BEHAVIOURS)}.`,
        notes: `Look for a specific situation, the action taken and what the candidate learned. Follow-up: ${pick(FOLLOWUPS)}.`,
        tags: withLevel('behavioural', []),
      };
    }
    const [a, b] = sample(GENERAL_TOPICS, 2) as [string, string];
    return kind < 4
      ? {
          text: `Explain ${a}.`,
          notes: `A strong answer defines ${a}, gives a real example and names common pitfalls. Follow-up: ${pick(FOLLOWUPS)}.`,
          tags: withLevel(pick(['technical', 'screening']), []),
        }
      : {
          text: `What are the trade-offs between ${a} and ${b}?`,
          notes: `A strong answer compares ${a} and ${b} with an example and says when each one wins.`,
          tags: withLevel('technical', []),
        };
  };

  const seen = new Set<string>(FIXTURES.map((f) => f.text));
  for (let i = 0; i < questionCount; i++) {
    // ~15% are global; the rest belong to a department (the templates have a few thousand combinations).
    const dept = rand() < 0.15 ? null : Math.floor(rand() * DEPARTMENTS.length);
    let q = dept === null ? globalQuestion() : departmentQuestion(DEPARTMENTS[dept]!);
    for (let tries = 0; seen.has(q.text) && tries < 200; tries++) {
      q = dept === null ? globalQuestion() : departmentQuestion(DEPARTMENTS[dept]!);
    }
    if (seen.has(q.text)) continue; // vocabulary exhausted for this pick: skip rather than store a duplicate
    seen.add(q.text);
    addRow({ ...q, client: dept }, i);
  }

  const reviewer = userByEmail.get('hannah.schmidt@mailinator.com')!;
  for (const [i, d] of REVIEW_DEMO.entries()) {
    addRow(
      {
        text: d.text,
        notes: d.notes,
        tags: [...d.tags],
        client: d.client,
        status: d.status,
        ...('note' in d && { note: d.note }),
      },
      questionCount + i,
    );
  }

  const BATCH = 1000;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    await db.$transaction([
      db.question.createMany({
        data: chunk.map((r) => ({
          id: r.id,
          text: r.text,
          answerNotes: r.notes,
          authorId: r.authorId,
          clientId: r.clientId,
          createdAt: r.at,
          updatedAt: r.at,
          status: r.status,
          ...(r.status === 'REJECTED' && {
            reviewNote: r.note ?? null,
            reviewedById: reviewer.id,
            reviewedAt: r.at,
          }),
        })),
      }),
      db.questionTag.createMany({
        data: chunk.flatMap((r) => r.tags.map((t) => ({ questionId: r.id, tagId: tagId.get(t)! }))),
      }),
      db.auditEvent.createMany({
        data: chunk.map((r) => ({
          type: 'QUESTION_CREATED' as const,
          actorId: r.authorId,
          questionId: r.id,
          at: r.at,
          payload: { text: r.text, seeded: true },
        })),
      }),
    ]);
  }

  return { users: users.length, departments: clients.length, questions: rows.length };
}
