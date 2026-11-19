import type { ReactNode } from 'react';
import { Code } from './Flow';

// The database as an entity-relationship diagram, drawn as SVG. Every table, column and line here mirrors
// apps/api/prisma/schema.prisma, and a test compares the two, so the picture cannot drift from the schema.
// The plain-language list under it is the accessible version.

type Kind = 'pk' | 'fk' | 'pkfk' | '';
type Group = 'access' | 'content' | 'system';
type Side = 'l' | 'r' | 't' | 'b';

interface Field {
  name: string;
  kind?: Kind;
}
export interface Entity {
  name: string;
  group: Group;
  x: number;
  y: number;
  fields: Field[];
}

const W = 210;
const HEAD = 28;
const ROW = 19;

export const ENTITIES: Entity[] = [
  {
    name: 'refresh_token',
    group: 'system',
    x: 20,
    y: 20,
    fields: [
      { name: 'id (jti)', kind: 'pk' },
      { name: 'user_id', kind: 'fk' },
      { name: 'family_id' },
      { name: 'token_hash' },
      { name: 'expires_at' },
      { name: 'used_at / revoked_at' },
    ],
  },
  {
    name: 'app_user',
    group: 'access',
    x: 20,
    y: 235,
    fields: [
      { name: 'id', kind: 'pk' },
      { name: 'email (unique)' },
      { name: 'name' },
      { name: 'role' },
      { name: 'active' },
      { name: 'deleted_at' },
    ],
  },
  {
    name: 'notification',
    group: 'system',
    x: 20,
    y: 470,
    fields: [
      { name: 'id', kind: 'pk' },
      { name: 'user_id', kind: 'fk' },
      { name: 'type' },
      { name: 'question_id (no FK)' },
      { name: 'read_at' },
    ],
  },
  {
    name: 'client_grant',
    group: 'access',
    x: 310,
    y: 20,
    fields: [
      { name: 'user_id', kind: 'pkfk' },
      { name: 'client_id', kind: 'pkfk' },
    ],
  },
  {
    name: 'question',
    group: 'content',
    x: 310,
    y: 190,
    fields: [
      { name: 'id', kind: 'pk' },
      { name: 'text' },
      { name: 'answer_notes' },
      { name: 'author_id', kind: 'fk' },
      { name: 'client_id', kind: 'fk' },
      { name: 'status' },
      { name: 'review_note' },
      { name: 'reviewed_by_id', kind: 'fk' },
      { name: 'deleted_at' },
      { name: 'updated_at' },
    ],
  },
  {
    name: 'audit_event',
    group: 'system',
    x: 310,
    y: 500,
    fields: [
      { name: 'id', kind: 'pk' },
      { name: 'type' },
      { name: 'actor_id', kind: 'fk' },
      { name: 'question_id', kind: 'fk' },
      { name: 'payload (json)' },
    ],
  },
  {
    name: 'client',
    group: 'access',
    x: 600,
    y: 20,
    fields: [
      { name: 'id', kind: 'pk' },
      { name: 'name (unique)' },
      { name: 'description' },
      { name: 'deleted_at' },
    ],
  },
  {
    name: 'question_tag',
    group: 'content',
    x: 600,
    y: 320,
    fields: [
      { name: 'question_id', kind: 'pkfk' },
      { name: 'tag_id', kind: 'pkfk' },
    ],
  },
  {
    name: 'client_tag',
    group: 'content',
    x: 880,
    y: 20,
    fields: [
      { name: 'client_id', kind: 'pkfk' },
      { name: 'tag_id', kind: 'pkfk' },
    ],
  },
  {
    name: 'tag',
    group: 'content',
    x: 880,
    y: 170,
    fields: [
      { name: 'id', kind: 'pk' },
      { name: 'category_id', kind: 'fk' },
      { name: 'value / label' },
      { name: 'archived_at' },
      { name: 'archived_by_client_id', kind: 'fk' },
    ],
  },
  {
    name: 'tag_category',
    group: 'content',
    x: 880,
    y: 400,
    fields: [{ name: 'id', kind: 'pk' }, { name: 'slug (unique)' }, { name: 'name' }],
  },
];

interface Anchor {
  table: string;
  /** a field name, or omitted for the middle of the side */
  field?: string;
  side: Side;
}
export interface Edge {
  /** the "one" end */
  parent: Anchor;
  /** the "many" end, which holds the foreign key */
  child: Anchor;
  /** the parent may be missing (a nullable foreign key) */
  optional?: boolean;
  /** a reference with no database foreign key */
  loose?: boolean;
}

export const EDGES: Edge[] = [
  // access: users <-> departments
  {
    parent: { table: 'app_user', field: 'id', side: 'r' },
    child: { table: 'client_grant', field: 'user_id', side: 'l' },
  },
  {
    parent: { table: 'client', field: 'id', side: 'l' },
    child: { table: 'client_grant', field: 'client_id', side: 'r' },
  },
  // who wrote and who reviewed
  {
    parent: { table: 'app_user', field: 'id', side: 'r' },
    child: { table: 'question', field: 'author_id', side: 'l' },
  },
  {
    parent: { table: 'app_user', field: 'name', side: 'r' },
    child: { table: 'question', field: 'reviewed_by_id', side: 'l' },
    optional: true,
  },
  // department owns a question (or it is global)
  {
    parent: { table: 'client', field: 'description', side: 'l' },
    child: { table: 'question', field: 'client_id', side: 'r' },
    optional: true,
  },
  // tags on questions
  {
    parent: { table: 'question', field: 'id', side: 'r' },
    child: { table: 'question_tag', field: 'question_id', side: 'l' },
  },
  {
    parent: { table: 'tag', field: 'value / label', side: 'l' },
    child: { table: 'question_tag', field: 'tag_id', side: 'r' },
  },
  // technologies of a department
  {
    parent: { table: 'client', field: 'id', side: 'r' },
    child: { table: 'client_tag', field: 'client_id', side: 'l' },
  },
  {
    parent: { table: 'tag', field: 'id', side: 't' },
    child: { table: 'client_tag', field: 'tag_id', side: 'b' },
  },
  // taxonomy
  {
    parent: { table: 'tag_category', field: 'id', side: 't' },
    child: { table: 'tag', field: 'category_id', side: 'b' },
  },
  {
    parent: { table: 'client', field: 'deleted_at', side: 'b' },
    child: { table: 'tag', field: 'archived_by_client_id', side: 'l' },
    optional: true,
  },
  // audit
  {
    parent: { table: 'app_user', field: 'role', side: 'r' },
    child: { table: 'audit_event', field: 'actor_id', side: 'l' },
  },
  {
    parent: { table: 'question', side: 'b' },
    child: { table: 'audit_event', side: 't' },
    optional: true,
  },
  // sessions and notices
  {
    parent: { table: 'app_user', side: 't' },
    child: { table: 'refresh_token', side: 'b' },
  },
  {
    parent: { table: 'app_user', side: 'b' },
    child: { table: 'notification', side: 't' },
  },
  {
    parent: { table: 'question', field: 'text', side: 'l' },
    child: { table: 'notification', field: 'question_id (no FK)', side: 'r' },
    loose: true,
  },
];

const byName = new Map(ENTITIES.map((e) => [e.name, e]));
const height = (e: Entity) => HEAD + e.fields.length * ROW + 10;

function point(a: Anchor): { x: number; y: number } {
  const e = byName.get(a.table)!;
  const h = height(e);
  if (a.side === 't') return { x: e.x + W / 2, y: e.y };
  if (a.side === 'b') return { x: e.x + W / 2, y: e.y + h };
  const i = a.field ? e.fields.findIndex((f) => f.name === a.field) : -1;
  if (a.field && i < 0) throw new Error(`No field ${a.field} in ${a.table}`);
  const y = i < 0 ? e.y + h / 2 : e.y + HEAD + i * ROW + ROW / 2;
  return { x: a.side === 'l' ? e.x : e.x + W, y };
}

function path(from: Anchor, to: Anchor) {
  const a = point(from);
  const b = point(to);
  const vertical = (s: Side) => s === 't' || s === 'b';
  if (vertical(from.side) && vertical(to.side)) {
    const dy = Math.max(30, Math.abs(b.y - a.y) / 2);
    const s = b.y > a.y ? 1 : -1;
    return `M${a.x},${a.y} C${a.x},${a.y + s * dy} ${b.x},${b.y - s * dy} ${b.x},${b.y}`;
  }
  const dir = (s: Side) => (s === 'r' ? 1 : s === 'l' ? -1 : 0);
  const dx = Math.max(40, Math.abs(b.x - a.x) / 2);
  const c1 = `${a.x + dir(from.side) * dx},${a.y}`;
  const c2 = `${b.x + dir(to.side) * dx},${b.y}`;
  return `M${a.x},${a.y} C${c1} ${c2} ${b.x},${b.y}`;
}

/** Where a small cardinality label sits next to an end of a line. */
function labelAt(a: Anchor) {
  const p = point(a);
  switch (a.side) {
    case 'r':
      return { x: p.x + 7, y: p.y - 5, anchor: 'start' as const };
    case 'l':
      return { x: p.x - 7, y: p.y - 5, anchor: 'end' as const };
    case 't':
      return { x: p.x + 7, y: p.y - 6, anchor: 'start' as const };
    default:
      return { x: p.x + 7, y: p.y + 14, anchor: 'start' as const };
  }
}

const HEADER: Record<Group, string> = {
  access: 'fill-restricted-bg',
  content: 'fill-accent-soft',
  system: 'fill-surface-2',
};
const HEADER_TEXT: Record<Group, string> = {
  access: 'fill-restricted-ink',
  content: 'fill-accent',
  system: 'fill-ink',
};

const KIND_LABEL: Record<Kind, string> = { pk: 'PK', fk: 'FK', pkfk: 'PK FK', '': '' };

export function ErDiagram() {
  const width = 880 + W + 20;
  const bottom = Math.max(...ENTITIES.map((e) => e.y + height(e))) + 20;
  return (
    <div className="rounded-md border border-line bg-surface p-3">
      <div
        tabIndex={0}
        role="region"
        aria-label="Database diagram. Scrolls sideways on narrow screens; the same relationships are listed in words below."
        className="overflow-x-auto"
      >
        <svg
          viewBox={`0 0 ${width} ${bottom}`}
          aria-hidden="true"
          focusable="false"
          className="w-full min-w-[960px] font-sans"
        >
          {/* relationships first, so the tables sit on top of the line ends */}
          {EDGES.map((e) => {
            const p = path(e.parent, e.child);
            const one = labelAt(e.parent);
            const many = labelAt(e.child);
            return (
              <g key={`${e.parent.table}-${e.child.table}-${e.child.field ?? ''}`}>
                <path
                  d={p}
                  fill="none"
                  strokeWidth={1.5}
                  strokeDasharray={e.loose ? '5 4' : undefined}
                  className={e.loose ? 'stroke-ink-soft' : 'stroke-control'}
                />
                <text
                  x={one.x}
                  y={one.y}
                  textAnchor={one.anchor}
                  fontSize={10.5}
                  fontWeight={700}
                  className="fill-accent"
                >
                  {e.optional ? '0..1' : '1'}
                </text>
                <text
                  x={many.x}
                  y={many.y}
                  textAnchor={many.anchor}
                  fontSize={10.5}
                  fontWeight={700}
                  className="fill-ink-soft"
                >
                  {e.loose ? '' : 'N'}
                </text>
              </g>
            );
          })}

          {ENTITIES.map((e) => {
            const h = height(e);
            return (
              <g key={e.name}>
                <rect
                  x={e.x}
                  y={e.y}
                  width={W}
                  height={h}
                  rx={8}
                  strokeWidth={1.5}
                  className="fill-surface stroke-line"
                />
                <path
                  d={`M${e.x},${e.y + HEAD} V${e.y + 8} a8,8 0 0 1 8,-8 H${e.x + W - 8} a8,8 0 0 1 8,8 V${e.y + HEAD} z`}
                  className={HEADER[e.group]}
                />
                <text
                  x={e.x + 12}
                  y={e.y + 19}
                  fontSize={12.5}
                  fontWeight={700}
                  className={`font-mono ${HEADER_TEXT[e.group]}`}
                >
                  {e.name}
                </text>
                <line
                  x1={e.x}
                  x2={e.x + W}
                  y1={e.y + HEAD}
                  y2={e.y + HEAD}
                  strokeWidth={1}
                  className="stroke-line"
                />
                {e.fields.map((f, i) => {
                  const y = e.y + HEAD + i * ROW + 13.5;
                  return (
                    <g key={f.name}>
                      <text
                        x={e.x + 12}
                        y={y}
                        fontSize={11}
                        fontWeight={f.kind?.includes('pk') ? 700 : 400}
                        className="fill-ink"
                      >
                        {f.name}
                      </text>
                      {f.kind && (
                        <text
                          x={e.x + W - 10}
                          y={y}
                          textAnchor="end"
                          fontSize={9.5}
                          fontWeight={700}
                          className="fill-accent"
                        >
                          {KIND_LABEL[f.kind]}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>

      <ul
        aria-label="Diagram key"
        className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 border-t border-line pt-3 text-xs text-ink-soft"
      >
        <li>
          <b className="text-accent">PK</b> primary key · <b className="text-accent">FK</b> foreign
          key
        </li>
        <li>
          <b className="text-accent">1</b> the one side · <b>N</b> the many side ·{' '}
          <b className="text-accent">0..1</b> the one side may be missing
        </li>
        <li>Dashed line: a reference with no database foreign key</li>
        <li>
          <Swatch className="bg-restricted-bg" /> access · <Swatch className="bg-accent-soft" />{' '}
          content · <Swatch className="bg-surface-2" /> sessions, notices and history
        </li>
      </ul>
    </div>
  );
}

function Swatch({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`mr-1 inline-block size-2.5 rounded-sm border border-line align-middle ${className}`}
    />
  );
}

/** The same relationships in words: the accessible version of the diagram. */
export const RELATIONSHIPS: { id: string; text: ReactNode }[] = [
  {
    id: 'grants',
    text: (
      <>
        <Code>app_user</Code> ─ <Code>client_grant</Code> ─ <Code>client</Code>: a user can hold
        many grants and a department can be granted to many users. The visibility check is a lookup
        on this table’s primary key.
      </>
    ),
  },
  {
    id: 'author',
    text: (
      <>
        <Code>question</Code> → <Code>app_user</Code> (<Code>author_id</Code>): every question has
        exactly one author.
      </>
    ),
  },
  {
    id: 'reviewer',
    text: (
      <>
        <Code>question</Code> → <Code>app_user</Code> (<Code>reviewed_by_id</Code>): optional, set
        when a reviewer decides.
      </>
    ),
  },
  {
    id: 'department',
    text: (
      <>
        <Code>question</Code> → <Code>client</Code>: optional. No department means a global
        question.
      </>
    ),
  },
  {
    id: 'tags',
    text: (
      <>
        <Code>question</Code> ─ <Code>question_tag</Code> ─ <Code>tag</Code>: many tags per
        question, many questions per tag.
      </>
    ),
  },
  {
    id: 'category',
    text: (
      <>
        <Code>tag</Code> → <Code>tag_category</Code>: every tag belongs to one list (technology,
        seniority or question type).
      </>
    ),
  },
  {
    id: 'technologies',
    text: (
      <>
        <Code>client</Code> ─ <Code>client_tag</Code> ─ <Code>tag</Code>: the technologies a
        department offers. Many to many, so one technology can serve several departments.
      </>
    ),
  },
  {
    id: 'archived',
    text: (
      <>
        <Code>tag</Code> → <Code>client</Code> (<Code>archived_by_client_id</Code>): optional.
        Remembers which department’s deletion archived the technology, so restoring that department
        brings it back.
      </>
    ),
  },
  {
    id: 'audit',
    text: (
      <>
        <Code>audit_event</Code> → <Code>app_user</Code> (the actor) and, optionally,{' '}
        <Code>question</Code>: the who, what and when behind the history.
      </>
    ),
  },
  {
    id: 'sessions',
    text: (
      <>
        <Code>refresh_token</Code> → <Code>app_user</Code>: one row per refresh token, grouped into
        a family per sign-in.
      </>
    ),
  },
  {
    id: 'notifications',
    text: (
      <>
        <Code>notification</Code> → <Code>app_user</Code>: who is told. Its <Code>question_id</Code>{' '}
        is deliberately <em>not</em> a foreign key, so a question that is later deleted or hidden
        can never break a notification.
      </>
    ),
  },
];
