import { randomUUID } from 'node:crypto';
import type { Db } from '../db/prisma.js';
import { hashPassword } from '../modules/auth/password.js';
import { CATEGORIES, CLIENTS, FIXTURES, USERS } from './data.js';

// Deterministic PRNG (mulberry32) so every run produces the same 5,000 questions.
function prng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VERBS = [
  'implement',
  'debug',
  'optimise',
  'test',
  'secure',
  'monitor',
  'refactor',
  'scale',
  'migrate',
  'document',
  'review',
  'deploy',
];
const OBJECTS = [
  'a rate limiter',
  'a job queue',
  'a search endpoint',
  'a file upload flow',
  'a caching layer',
  'a feature-flag system',
  'an audit log',
  'a retry policy',
  'a pagination scheme',
  'a notification service',
  'a session store',
  'a data import',
  'a webhook receiver',
  'a permissions model',
  'a background scheduler',
];
const CONCEPTS = [
  'caching',
  'pagination',
  'error handling',
  'authentication',
  'concurrency',
  'memory management',
  'testing',
  'logging',
  'configuration',
  'migrations',
  'indexing',
  'retries',
  'rate limiting',
  'transactions',
  'streaming',
  'state management',
  'dependency injection',
  'serialisation',
  'scheduling',
  'observability',
  'validation',
  'idempotency',
  'backpressure',
  'garbage collection',
  'connection pooling',
  'schema evolution',
];
const SYSTEMS = [
  'a URL shortener',
  'a chat service',
  'a ticket booking system',
  'an analytics pipeline',
  'a payments ledger',
  'a comment system',
  'a leaderboard',
  'a document editor',
  'a metrics collector',
  'an email digest service',
];
const USECASES = [
  'a read-heavy API',
  'a batch pipeline',
  'a small team',
  'a latency-sensitive service',
  'a prototype',
  'an internal tool',
  'a high-write workload',
  'a regulated environment',
];
const BEHAVIOURS = [
  'push back on a deadline',
  'resolve a team disagreement',
  'learn a new stack quickly',
  'handle a production incident',
  'mentor a junior colleague',
  'give difficult feedback',
  'take over unfamiliar code',
  'say no to a stakeholder',
  'recover from a failed release',
  'balance speed against quality',
];
const FOLLOWUPS = [
  'what would change at ten times the load',
  'how you would test it',
  'what you would monitor',
  'how it fails',
  'what you would cut for a first release',
  'how you would roll it back',
];

const techTags = CATEGORIES[0].tags.map(([v]) => v);
const levelTags = CATEGORIES[1].tags.map(([v]) => v);

export interface SeedOptions {
  password: string;
  questionCount?: number;
}

/** True when the database has no users and no questions, i.e. it is safe to seed. */
export async function isEmpty(db: Db) {
  const [users, questions] = await Promise.all([db.appUser.count(), db.question.count()]);
  return users === 0 && questions === 0;
}

export async function seed(db: Db, { password, questionCount = 5000 }: SeedOptions) {
  const rand = prng(20261014);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
  const sample = <T>(xs: readonly T[], n: number): T[] =>
    [...xs].sort(() => rand() - 0.5).slice(0, n);

  const passwordHash = await hashPassword(password);

  const clients = await Promise.all(CLIENTS.map((name) => db.client.create({ data: { name } })));
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

  // Who may author what: a client question needs an author granted for that client.
  const authorsForClient = [
    ['author.acme@example.com', 'author.both@example.com', 'reviewer@example.com'],
    ['author.globex@example.com', 'author.both@example.com'],
  ].map((emails) => emails.map((e) => userByEmail.get(e)!));
  const globalAuthors = [
    'author.acme@example.com',
    'author.globex@example.com',
    'author.none@example.com',
    'author.both@example.com',
  ].map((e) => userByEmail.get(e)!);

  type Row = {
    id: string;
    text: string;
    notes: string;
    authorId: string;
    clientId: string | null;
    tags: string[];
    at: Date;
  };
  const rows: Row[] = [];
  const base = Date.UTC(2026, 0, 1);

  for (const f of FIXTURES) {
    const authors = f.client === null ? globalAuthors : authorsForClient[f.client]!;
    rows.push({
      id: randomUUID(),
      text: f.text,
      notes: f.notes,
      authorId: authors[0]!.id,
      clientId: f.client === null ? null : clients[f.client]!.id,
      tags: [...f.tags],
      at: new Date(base),
    });
  }

  const seen = new Set<string>(FIXTURES.map((f) => f.text));
  const generate = () => {
    const tech = pick(techTags);
    const tech2 = pick(techTags.filter((t) => t !== tech));
    const label = (t: string) => CATEGORIES[0].tags.find(([v]) => v === t)![1];
    const kind = Math.floor(rand() * 6);
    let text: string;
    let type: string;
    const tags = [`technology:${tech}`];
    switch (kind) {
      case 0:
        text = `How would you ${pick(VERBS)} ${pick(OBJECTS)} in ${label(tech)}?`;
        type = 'technical';
        break;
      case 1:
        text = `What is the difference between ${pick(CONCEPTS)} and ${pick(CONCEPTS)} in ${label(tech)}?`;
        type = pick(['technical', 'screening']);
        break;
      case 2:
        text = `Explain how ${label(tech)} handles ${pick(CONCEPTS)}.`;
        type = pick(['technical', 'coding']);
        break;
      case 3:
        text = `Describe a time you had to ${pick(BEHAVIOURS)}.`;
        type = 'behavioural';
        tags.length = 0; // behavioural questions are not technology-specific
        break;
      case 4:
        text = `Design ${pick(SYSTEMS)} using ${label(tech)}. Which trade-offs would you make?`;
        type = 'system-design';
        break;
      default:
        text = `Why would you choose ${label(tech)} over ${label(tech2)} for ${pick(USECASES)}?`;
        type = 'technical';
        tags.push(`technology:${tech2}`);
    }
    tags.push(`type:${type}`, `seniority:${pick(levelTags)}`);
    if (rand() < 0.2) tags.push(`seniority:${pick(levelTags)}`);

    const [a, b, c] = sample(CONCEPTS, 3);
    const notes = `A strong answer covers ${a}, ${b} and ${c}. Follow-up: ${pick(FOLLOWUPS)}.`;
    return { text, notes, tags: [...new Set(tags)] };
  };

  for (let i = 0; i < questionCount; i++) {
    // Retry until the text is new, so the bank has no exact duplicates (the templates have ~11k combinations).
    let q = generate();
    for (let tries = 0; seen.has(q.text) && tries < 200; tries++) q = generate();
    seen.add(q.text);

    // ~10% belong to a client (split roughly evenly), the rest are global.
    const client = rand() < 0.1 ? (rand() < 0.5 ? 0 : 1) : null;
    const authors = client === null ? globalAuthors : authorsForClient[client]!;
    rows.push({
      id: randomUUID(),
      text: q.text,
      notes: q.notes,
      authorId: pick(authors).id,
      clientId: client === null ? null : clients[client]!.id,
      tags: q.tags,
      at: new Date(base + i * 60_000),
    });
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

  return { users: users.length, clients: clients.length, questions: rows.length };
}
