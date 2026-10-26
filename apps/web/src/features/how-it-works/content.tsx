import { DEMO_ACCOUNTS } from '../auth/demoAccounts';
import type { FlowStep } from './Flow';
import { Code } from './Flow';
import type { MindMapData } from './MindMap';

// Every statement here describes apps/api: keep it in step with the code it names.

export const ROLE_COLUMNS = ['Read-only', 'Author', 'Reviewer'] as const;

/** A cell of "yes" or "no" renders as a tick or a dash; any other string is shown as written. */
export const ROLE_ROWS: { action: string; cells: [string, string, string] }[] = [
  { action: 'List, search and open the questions you can see', cells: ['yes', 'yes', 'yes'] },
  { action: 'Read a question’s edit history', cells: ['yes', 'yes', 'yes'] },
  { action: 'Create a global question', cells: ['no', 'yes', 'yes'] },
  {
    action: 'Create a question for a client',
    cells: ['no', 'Needs that grant', 'Needs that grant'],
  },
  { action: 'Edit a question you wrote', cells: ['no', 'yes', 'yes'] },
  { action: 'Edit someone else’s question', cells: ['no', 'no', 'Any you can see'] },
  { action: 'Move a question to another client', cells: ['no', 'no', 'no'] },
  { action: 'Delete a question', cells: ['no', 'no', 'no'] },
];

export const DECISION_STEPS: FlowStep[] = [
  {
    title: 'Who are you?',
    detail: (
      <>
        A valid signed-in session, and the account must be active. Your role is read from the
        database on every request, so a role change takes effect immediately.
      </>
    ),
    fail: '401 UNAUTHENTICATED',
  },
  {
    title: 'Can you see this question?',
    detail: (
      <>
        Yes if it is global (no client), or you hold a grant for its client. This is checked first,
        for every role, Reviewers included.
      </>
    ),
    fail: '404 NOT_FOUND (same as an ID that does not exist)',
  },
  {
    title: 'Does your role allow the action?',
    detail: (
      <>
        Read-only accounts cannot write. Creating needs Author or Reviewer. Editing needs Reviewer,
        or Author on a question you wrote.
      </>
    ),
    fail: '403 FORBIDDEN',
  },
];

export const PIPELINE: FlowStep[] = [
  {
    title: 'nginx forwards /api to the API container',
    detail: (
      <>
        The browser only talks to one origin, so the cookies are first-party and no CORS setup is
        needed.
      </>
    ),
  },
  {
    title: 'Request ID and logging',
    detail: (
      <>
        <Code>pino-http</Code> makes its own request ID (returned as <Code>X-Request-Id</Code>) and
        redacts cookies and auth headers from the logs.
      </>
    ),
  },
  {
    title: 'Security headers',
    detail: (
      <>
        <Code>helmet</Code> sets the standard hardening headers.
      </>
    ),
  },
  {
    title: 'JSON body, capped at 100 kb',
    detail: <>Malformed JSON and oversized bodies are turned away before any route runs.</>,
    fail: '400 INVALID_JSON · 413 PAYLOAD_TOO_LARGE',
  },
  {
    title: 'Cookies parsed',
    detail: (
      <>
        <Code>cookie-parser</Code> exposes the httpOnly <Code>access_token</Code> cookie.
      </>
    ),
  },
  {
    title: 'Origin check (second CSRF layer)',
    detail: (
      <>
        Unsafe methods (POST, PATCH) carrying a foreign <Code>Origin</Code> are refused. The cookies
        are also <Code>SameSite=Strict</Code>.
      </>
    ),
    fail: '403 BAD_ORIGIN',
  },
  {
    title: 'requireAuth',
    detail: (
      <>
        Verifies the JWT (HS256, issuer pinned), then loads the user by primary key. Role and{' '}
        <Code>active</Code> come from the database, not from the token.
      </>
    ),
    fail: '401 UNAUTHENTICATED',
  },
  {
    title: 'Rate limit, per user',
    detail: (
      <>
        120 requests a minute by default. Rate-limit headers are switched off on purpose, so a
        hidden search result cannot be told apart from a genuinely empty one.
      </>
    ),
    fail: '429 RATE_LIMITED',
  },
  {
    title: 'requireRole (create only)',
    detail: (
      <>
        <Code>POST /questions</Code> allows Author and Reviewer and runs before validation. Edits
        have no role middleware: their role check sits inside the service, after the visibility
        lookup.
      </>
    ),
    fail: '403 FORBIDDEN',
  },
  {
    title: 'Validation with Zod',
    detail: (
      <>
        Params, query and body are parsed by strict schemas, so unknown fields are rejected, not
        ignored. Nothing below this step runs on bad input.
      </>
    ),
    fail: '400 VALIDATION_ERROR with the field issues',
  },
  {
    title: 'Route handler, then service, then repository',
    detail: (
      <>
        The handler stays thin. The service holds the rules (visibility, role, duplicates, audit).
        The repository holds the SQL.
      </>
    ),
  },
  {
    title: 'One error handler',
    detail: (
      <>
        Known errors become a JSON <Code>{'{ error: { code, message } }'}</Code> body. Anything
        unexpected is logged in full on the server and shown to the caller as a bare 500.
      </>
    ),
    fail: '500 INTERNAL',
  },
];

export interface OperationFlow {
  id: string;
  title: string;
  route: string;
  intro: string;
  steps: FlowStep[];
}

export const OPERATIONS: OperationFlow[] = [
  {
    id: 'op-search',
    title: 'List and search',
    route: 'GET /api/questions',
    intro:
      'Visibility is part of the same SQL WHERE as the filters, so hidden rows are never fetched, counted or ranked.',
    steps: [
      {
        title: 'Validate the query',
        detail: (
          <>
            Strict schema: <Code>q</Code> up to 200 characters, <Code>tags</Code>,{' '}
            <Code>clientId</Code>, <Code>limit</Code> 1 to 50, <Code>offset</Code>.
          </>
        ),
        fail: '400 VALIDATION_ERROR',
      },
      {
        title: 'Resolve the tag filters',
        detail: (
          <>
            Tag values are looked up as ids. Different categories are AND-ed, values inside one
            category are OR-ed.
          </>
        ),
        fail: '400 UNKNOWN_TAG · UNKNOWN_TAG_CATEGORY',
      },
      {
        title: 'Build one WHERE clause',
        detail: (
          <>
            <Code>visible(actor)</Code> AND the optional client filter AND full-text match AND the
            tag groups. A <Code>clientId</Code> you hold no grant for just returns nothing.
          </>
        ),
      },
      {
        title: 'Run two statements that share the clause',
        detail: (
          <>
            One fetches the page, ordered by relevance when searching and newest first otherwise.
            The other counts the total.
          </>
        ),
      },
      {
        title: 'Attach tags and respond',
        detail: (
          <>
            Returns <Code>{'{ items, page: { limit, offset, total } }'}</Code>. A search that
            matches only hidden questions looks the same as one that matches nothing.
          </>
        ),
      },
    ],
  },
  {
    id: 'op-open',
    title: 'Open one question and its history',
    route: 'GET /api/questions/:id  ·  GET /api/questions/:id/history',
    intro: 'A hidden question and a missing one are indistinguishable.',
    steps: [
      { title: 'Validate the id', detail: <>Must be a UUID.</>, fail: '400 VALIDATION_ERROR' },
      {
        title: 'Select with the visibility predicate',
        detail: (
          <>
            <Code>WHERE id = $1 AND visible(actor)</Code>. No row means not found.
          </>
        ),
        fail: '404 NOT_FOUND',
      },
      {
        title: 'History: only after the question is confirmed visible',
        detail: (
          <>
            Only the edit diffs of this question are returned, never the raw audit payloads, which
            can name other questions.
          </>
        ),
      },
    ],
  },
  {
    id: 'op-create',
    title: 'Create',
    route: 'POST /api/questions',
    intro:
      'The checks run cheapest and safest first. The insert and its audit row commit together.',
    steps: [
      {
        title: 'Role gate, then validation',
        detail: (
          <>
            Author or Reviewer only. Body: text 1 to 1000 characters, notes up to 10,000, at most 30
            tags, optional <Code>clientId</Code>, optional <Code>confirmNotDuplicate</Code>.
          </>
        ),
        fail: '403 FORBIDDEN · 400 VALIDATION_ERROR',
      },
      {
        title: 'Grant check for the chosen client',
        detail: (
          <>
            Looks up <Code>client_grant</Code> for you and that client. A client you are not granted
            looks exactly like one that does not exist.
          </>
        ),
        fail: '404 NOT_FOUND',
      },
      {
        title: 'Resolve the tags',
        detail: <>Tag values must exist in the fixed taxonomy. Callers cannot invent categories.</>,
        fail: '400 UNKNOWN_TAG · UNKNOWN_TAG_CATEGORY',
      },
      {
        title: 'Duplicate check, on questions you can see only',
        detail: (
          <>
            Trigram similarity at 0.6 or above. If there is a match and you did not confirm, the
            attempt is audited as <Code>DUPLICATE_REJECTED</Code> in its own commit and the matches
            come back. Hidden questions are never compared.
          </>
        ),
        fail: '409 DUPLICATE_SUSPECTED',
      },
      {
        title: 'One transaction: insert and audit',
        detail: (
          <>
            Inserts the question and its tag links through Prisma, writes{' '}
            <Code>DUPLICATE_OVERRIDDEN</Code> when you confirmed past a match, and writes{' '}
            <Code>QUESTION_CREATED</Code>. All or nothing.
          </>
        ),
      },
      {
        title: 'Read it back and respond',
        detail: <>Re-reads through the visibility predicate and returns 201 with the question.</>,
      },
    ],
  },
  {
    id: 'op-edit',
    title: 'Edit',
    route: 'PATCH /api/questions/:id',
    intro: 'Visibility first, then role, inside one transaction.',
    steps: [
      {
        title: 'Validate the id and the body',
        detail: (
          <>
            Only <Code>text</Code>, <Code>answerNotes</Code> and <Code>tags</Code> are accepted, and
            at least one. <Code>clientId</Code> is not in the schema, so a question’s client can
            never change.
          </>
        ),
        fail: '400 VALIDATION_ERROR',
      },
      {
        title: 'Load the question through the visibility predicate',
        detail: <>You cannot edit what you cannot see.</>,
        fail: '404 NOT_FOUND',
      },
      {
        title: 'Check the role',
        detail: (
          <>
            Allowed if you are a Reviewer, or an Author and the author of this question. A read-only
            user, or an Author on someone else’s question, stops here.
          </>
        ),
        fail: '403 FORBIDDEN',
      },
      {
        title: 'Work out what actually changed',
        detail: (
          <>
            Compares each field with the stored value. If nothing differs, the question comes back
            unchanged and nothing is recorded.
          </>
        ),
      },
      {
        title: 'Update and audit, then commit',
        detail: (
          <>
            Updates the row and replaces the tag set if it changed, then writes{' '}
            <Code>QUESTION_UPDATED</Code> with each field’s before and after. The history page is
            built from these rows.
          </>
        ),
      },
      {
        title: 'Read it back and respond',
        detail: <>Returns 200 with the updated question.</>,
      },
    ],
  },
];

export const TABLES: { name: string; purpose: string; keys: string }[] = [
  {
    name: 'app_user',
    purpose: 'Accounts. One global role: USER, AUTHOR or REVIEWER.',
    keys: 'email unique · active flag',
  },
  {
    name: 'client',
    purpose: 'The clients that can own restricted questions (Acme Corp, Globex).',
    keys: 'name unique',
  },
  {
    name: 'client_grant',
    purpose: 'A row means this user may see that client’s questions.',
    keys: 'PK (user_id, client_id): the visibility check is a primary-key lookup',
  },
  {
    name: 'question',
    purpose: 'Text, answer notes, author, and an optional client. A null client means global.',
    keys: 'client_id set at creation, never changed · no unique on text · full-text and trigram indexes',
  },
  {
    name: 'tag_category · tag',
    purpose: 'The fixed taxonomy: technology, seniority, question type.',
    keys: 'seeded, not user-created',
  },
  {
    name: 'question_tag',
    purpose: 'Many-to-many link between questions and tags.',
    keys: 'PK (question_id, tag_id)',
  },
  {
    name: 'audit_event',
    purpose: 'Who did what and when: created, updated, duplicate rejected, duplicate overridden.',
    keys: 'question_id is null for a rejected duplicate · JSON payload',
  },
  {
    name: 'refresh_token',
    purpose: 'Server-side record of each refresh token, stored hashed.',
    keys: 'one family per login · used and revoked timestamps',
  },
];

export const VISIBLE_SQL = `-- the visibility predicate, appended to every read of "question"
q.client_id IS NULL
OR EXISTS (
  SELECT 1 FROM client_grant g
  WHERE g.user_id = $actor AND g.client_id = q.client_id
)`;

export const STATUS_ROWS: { status: string; code: string; from: string; meaning: string }[] = [
  {
    status: '400',
    code: 'VALIDATION_ERROR',
    from: 'Zod validation',
    meaning: 'Wrong shape, a field that is not allowed, or an unknown tag.',
  },
  {
    status: '401',
    code: 'UNAUTHENTICATED',
    from: 'requireAuth',
    meaning: 'No session, an expired one, or a disabled account.',
  },
  {
    status: '403',
    code: 'FORBIDDEN',
    from: 'requireRole, or the service on edit',
    meaning:
      'Your role does not allow it, or you are an Author editing someone else’s question that you can see.',
  },
  {
    status: '404',
    code: 'NOT_FOUND',
    from: 'The service and the SQL',
    meaning:
      'Missing, or hidden from you: the two look the same. Also a client you hold no grant for.',
  },
  {
    status: '409',
    code: 'DUPLICATE_SUSPECTED',
    from: 'Create',
    meaning:
      'A very similar question already exists. Send it again with confirmNotDuplicate to override.',
  },
  {
    status: '429',
    code: 'RATE_LIMITED',
    from: 'Rate limit',
    meaning: 'Too many requests from this account in a minute.',
  },
  {
    status: '500',
    code: 'INTERNAL',
    from: 'The error handler',
    meaning: 'Something unexpected. The detail is logged on the server and never sent to you.',
  },
];

export const TRACES: { who: string; request: string; path: string; result: string }[] = [
  {
    who: 'Una (read-only)',
    request: 'POST /questions',
    path: 'requireAuth passes, requireRole stops her.',
    result: '403',
  },
  {
    who: 'Carol (no grants)',
    request: 'GET an Acme question by id',
    path: 'The visibility check finds no row, exactly as for an id that does not exist.',
    result: '404',
  },
  {
    who: 'Alice (Author)',
    request: 'PATCH a global question Bob wrote',
    path: 'She can see it, so visibility passes. The role check then finds she is not the author.',
    result: '403',
  },
  {
    who: 'Rita (Reviewer, both clients)',
    request: 'PATCH a Globex question',
    path: 'Visible through her Globex grant, and a Reviewer may edit any visible question.',
    result: '200',
  },
];

const short = (email: string) => email.replace('@example.com', '@');
const holders = (client: 'Acme' | 'Globex') =>
  DEMO_ACCOUNTS.filter((a) => a.grants.includes(client)).map((a) => ({ text: short(a.email) }));

/** One mind map per tab. The grants map is built from the demo accounts, so it cannot drift from them. */
export const MIND_MAPS: Record<string, MindMapData> = {
  roles: {
    center: 'Role: what you can do',
    branches: [
      {
        title: 'Read-only',
        leaves: [
          { text: 'View the questions you can see' },
          { text: 'Read edit history' },
          { text: 'No writes at all' },
        ],
      },
      {
        title: 'Author',
        leaves: [
          { text: 'Create global questions' },
          { text: 'Create for a client you hold a grant for' },
          { text: 'Edit only questions you wrote' },
        ],
      },
      {
        title: 'Reviewer',
        leaves: [
          { text: 'Everything an Author can do' },
          { text: 'Edit any question you can see' },
          { text: 'No grant, no access' },
        ],
      },
      {
        title: 'Not possible for anyone',
        tone: 'danger',
        leaves: [{ text: 'Delete a question' }, { text: 'Move a question to another client' }],
      },
    ],
  },
  grants: {
    center: 'Grant: what you can see',
    branches: [
      {
        title: 'Global',
        leaves: [
          { text: `All ${DEMO_ACCOUNTS.length} demo accounts` },
          { text: 'Questions with no client' },
        ],
      },
      { title: 'Acme', tone: 'restricted', leaves: holders('Acme') },
      { title: 'Globex', tone: 'restricted', leaves: holders('Globex') },
      {
        title: 'No grants',
        leaves: [
          ...DEMO_ACCOUNTS.filter((a) => a.grants.length === 0).map((a) => ({
            text: short(a.email),
          })),
          { text: 'See global questions only' },
        ],
      },
    ],
  },
  flow: {
    center: 'One request',
    branches: [
      {
        title: 'Gates, in order',
        leaves: [
          { text: 'requireAuth', tone: 'plain' },
          { text: 'requireRole (create only)' },
          { text: 'Zod validation' },
        ],
      },
      {
        title: 'Service rules',
        leaves: [
          { text: 'Visibility first' },
          { text: 'Then role and ownership' },
          { text: 'Create: duplicate check' },
        ],
      },
      {
        title: 'Data',
        leaves: [
          { text: 'Reads: SQL with the visibility rule' },
          { text: 'Writes: Prisma transaction' },
        ],
      },
      {
        title: 'Refusals',
        tone: 'danger',
        leaves: [
          { text: '401 not signed in' },
          { text: '403 role does not allow it' },
          { text: '400 bad input' },
          { text: '404 missing or hidden' },
          { text: '409 possible duplicate' },
        ],
      },
    ],
  },
  decision: {
    center: 'Every request',
    branches: [
      {
        title: '1. Signed in?',
        leaves: [
          { text: 'Session cookie is checked' },
          { text: 'Role is read from the database' },
          { text: 'Otherwise: 401', tone: 'danger' },
        ],
      },
      {
        title: '2. Can you see it?',
        leaves: [
          { text: 'It is global, or you hold the grant' },
          { text: 'Checked before role, for everyone' },
          { text: 'Otherwise: 404, same as missing', tone: 'danger' },
        ],
      },
      {
        title: '3. Does your role allow it?',
        leaves: [
          { text: 'Create: Author or Reviewer' },
          { text: 'Edit: Reviewer, or your own as Author' },
          { text: 'Otherwise: 403', tone: 'danger' },
        ],
      },
    ],
  },
  pipeline: {
    center: 'API request',
    branches: [
      {
        title: 'Hardening',
        leaves: [
          { text: 'Request id, redacted logs' },
          { text: 'helmet security headers' },
          { text: 'JSON body capped at 100 kb' },
          { text: 'Origin check against CSRF' },
        ],
      },
      {
        title: 'Identity',
        leaves: [{ text: 'requireAuth: JWT, then user lookup' }, { text: 'Rate limit per user' }],
      },
      {
        title: 'Rules',
        leaves: [{ text: 'requireRole (create only)' }, { text: 'Zod strict validation' }],
      },
      {
        title: 'Logic',
        leaves: [
          { text: 'Handler, then service, then repository' },
          { text: 'Visibility lives in the SQL' },
        ],
      },
      { title: 'Errors', leaves: [{ text: 'One handler, a safe 500 for the unexpected' }] },
    ],
  },
  operations: {
    center: '/api/questions',
    branches: [
      {
        title: 'List and search',
        leaves: [
          { text: 'One WHERE: visible, filters, text' },
          { text: 'Page and total share it' },
        ],
      },
      {
        title: 'Open one',
        leaves: [
          { text: 'Hidden question is a 404' },
          { text: 'History after the visibility check' },
        ],
      },
      {
        title: 'Create',
        leaves: [
          { text: 'Role gate, then Zod' },
          { text: 'Grant check for the client' },
          { text: 'Duplicate check on visible rows' },
          { text: 'Insert and audit in one transaction' },
        ],
      },
      {
        title: 'Edit',
        leaves: [
          { text: 'Visible first, then role' },
          { text: 'Client can never change' },
          { text: 'Diff, update, audit' },
        ],
      },
    ],
  },
  database: {
    center: 'PostgreSQL + Prisma',
    branches: [
      { title: 'Identity', leaves: [{ text: 'app_user' }, { text: 'refresh_token (hashed)' }] },
      {
        title: 'Access',
        tone: 'restricted',
        leaves: [{ text: 'client' }, { text: 'client_grant: the visibility lookup' }],
      },
      {
        title: 'Content',
        leaves: [{ text: 'question' }, { text: 'question_tag' }, { text: 'tag and tag_category' }],
      },
      { title: 'Audit', leaves: [{ text: 'audit_event: who, what, when' }] },
      {
        title: 'How it is queried',
        leaves: [
          { text: 'Reads: raw SQL in question.repo.ts' },
          { text: 'Writes: Prisma, in a transaction' },
        ],
      },
    ],
  },
  session: {
    center: 'Session',
    branches: [
      {
        title: 'Access token',
        leaves: [
          { text: 'Lasts 15 minutes' },
          { text: 'Sent to /api only' },
          { text: 'Carries only your user id' },
        ],
      },
      {
        title: 'Refresh token',
        leaves: [
          { text: 'Lasts 7 days' },
          { text: 'Sent to /api/auth only' },
          { text: 'Used once; a replay revokes the session' },
          { text: 'Stored hashed' },
        ],
      },
      {
        title: 'Cookies',
        leaves: [
          { text: 'httpOnly' },
          { text: 'SameSite=Strict' },
          { text: 'Unreadable to page scripts' },
        ],
      },
      {
        title: 'Every request',
        leaves: [
          { text: 'Role and active read from the database' },
          { text: 'A role change applies at once' },
        ],
      },
      {
        title: 'Sign-in',
        leaves: [
          { text: 'Same error for every failure' },
          { text: 'Rate-limited per address and email' },
        ],
      },
    ],
  },
};
