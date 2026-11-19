import { DEMO_ACCOUNTS, DEMO_CLIENTS, type DemoClient } from '../auth/demoAccounts';
import type { FlowStep } from './Flow';
import { Code } from './Flow';
import type { MindMapData } from './MindMap';

// Every statement here describes apps/api: keep it in step with the code it names.

export const ROLE_COLUMNS = ['Read-only', 'Author', 'Reviewer', 'Admin'] as const;

type RoleCells = [string, string, string, string];

/** A cell of "yes" or "no" renders as a tick or a dash; any other string is shown as written. */
export const ROLE_ROWS: { action: string; cells: RoleCells }[] = [
  {
    action: 'List, search and open approved questions you can see',
    cells: ['yes', 'yes', 'yes', 'yes'],
  },
  {
    action: 'See questions that are pending or rejected',
    cells: ['no', 'Your own', 'yes', 'yes'],
  },
  { action: 'Read a question’s history', cells: ['yes', 'yes', 'yes', 'yes'] },
  {
    action: 'See how many questions wait for review (the Review queue)',
    cells: ['no', 'no', 'yes', 'yes'],
  },
  { action: 'Filter the list to “My questions”', cells: ['no', 'yes', 'no', 'yes'] },
  {
    action: 'Get a notification when a reviewer approves or rejects your question',
    cells: ['no', 'yes', 'no', 'yes'],
  },
  { action: 'Create a global question', cells: ['no', 'yes', 'no', 'Live at once'] },
  {
    action: 'Create a question for a department',
    cells: ['no', 'Needs access to that department', 'no', 'Any department'],
  },
  {
    action: 'Edit a question you wrote (an Author’s edit goes back for review)',
    cells: ['no', 'yes', 'no', 'yes'],
  },
  { action: 'Edit someone else’s question', cells: ['no', 'no', 'no', 'Any'] },
  {
    action: 'Approve or reject a question, with a note',
    cells: ['no', 'no', 'Pending, not your own', 'Any, any time'],
  },
  {
    action: 'See every department’s questions, without a grant',
    cells: ['no', 'no', 'no', 'yes'],
  },
  { action: 'Change a user’s role or department access', cells: ['no', 'no', 'no', 'yes'] },
  { action: 'Add, edit or delete users, including reviewers', cells: ['no', 'no', 'no', 'yes'] },
  { action: 'Add, edit or delete a department', cells: ['no', 'no', 'no', 'yes'] },
  { action: 'Move a question to another department', cells: ['no', 'no', 'no', 'no'] },
  {
    action: 'Delete a question (hidden, history kept)',
    cells: ['no', 'Your own, until approved', 'no', 'Any'],
  },
  {
    action: 'Restore a deleted question, department or user',
    cells: ['no', 'no', 'no', 'yes'],
  },
  {
    action: 'Add, rename, remove or restore a department’s technologies',
    cells: ['no', 'no', 'no', 'yes'],
  },
  {
    action: 'Add, rename or archive seniority and question-type tags',
    cells: ['no', 'no', 'no', 'yes'],
  },
  {
    action: 'Browse the audit trail and download it as CSV',
    cells: ['no', 'no', 'no', 'yes'],
  },
];

export const DECISION_STEPS: FlowStep[] = [
  {
    title: 'Who are you?',
    detail: (
      <>
        The server first checks that you have a valid signed-in session and an active account. It
        reads your role from the database on every request, so a role change takes effect at once.
      </>
    ),
    fail: '401 UNAUTHENTICATED (not signed in)',
  },
  {
    title: 'Can you see this question?',
    detail: (
      <>
        You can see it if its status lets your role read it, and it is either global or you hold a
        grant for its department. (A grant is a permission that lets one user see one department.)
        Read-only accounts see approved questions only. Authors see approved ones plus their own.
        Reviewers see any status. Admins see everything. This check runs first, before the role
        check.
      </>
    ),
    fail: '404 NOT_FOUND (the same answer as for an ID that does not exist)',
  },
  {
    title: 'Does your role allow the action?',
    detail: (
      <>
        Read-only accounts cannot write. Creating needs Author or Admin. Editing needs Author on a
        question you wrote, or Admin. Approving or rejecting needs Reviewer, on a pending question
        that is not yours, or Admin. Deleting a question needs Admin.
      </>
    ),
    fail: '403 FORBIDDEN (the server knows you, but your role is not allowed)',
  },
];

export const PIPELINE: FlowStep[] = [
  {
    title: 'nginx forwards /api to the API container',
    detail: (
      <>
        nginx is the web server in front of the app. The browser talks to only one origin (one web
        address), so the cookies are first-party and no CORS setup is needed. CORS is the browser
        rule for calls between different sites.
      </>
    ),
  },
  {
    title: 'Request ID and logging',
    detail: (
      <>
        Every request gets an ID, so you can find it in the logs. <Code>pino-http</Code> makes the
        ID (returned as <Code>X-Request-Id</Code>) and hides cookies and auth headers in the logs.
        The client address comes from <Code>X-Forwarded-For</Code>, a header a proxy adds. It is
        trusted only for the proxy hops named in <Code>TRUST_PROXY</Code>.
      </>
    ),
  },
  {
    title: 'Security headers and no caching',
    detail: (
      <>
        <Code>helmet</Code> adds the standard security headers to every response. Every{' '}
        <Code>/api</Code> response also carries <Code>Cache-Control: no-store</Code>. That tells
        browsers and shared caches not to keep per-user data.
      </>
    ),
  },
  {
    title: 'JSON body, capped at 100 kb',
    detail: (
      <>
        The server reads the JSON body, up to 100 kb. Broken JSON and oversized bodies are turned
        away before any route runs.
      </>
    ),
    fail: '400 INVALID_JSON (broken JSON) · 413 PAYLOAD_TOO_LARGE (body too big)',
  },
  {
    title: 'Cookies parsed',
    detail: (
      <>
        <Code>cookie-parser</Code> reads the cookies on the request. The <Code>access_token</Code>{' '}
        cookie is httpOnly: scripts on the page cannot read it, but the browser still sends it with
        each request.
      </>
    ),
  },
  {
    title: 'NUL-byte gate',
    detail: (
      <>
        A NUL character is an invisible character with code 0. Postgres cannot store it. So any
        string in the body or query that contains one is refused here, instead of becoming a
        database error later.
      </>
    ),
    fail: '400 VALIDATION_ERROR',
  },
  {
    title: 'Origin check (second CSRF layer)',
    detail: (
      <>
        CSRF is when another website tricks your browser into sending a request. This is the second
        defence against it. Requests that change data (POST, PATCH) are refused if their{' '}
        <Code>Origin</Code> header names a foreign site. The cookies are also{' '}
        <Code>SameSite=Strict</Code>, so the browser does not send them on requests started from
        other sites.
      </>
    ),
    fail: '403 BAD_ORIGIN',
  },
  {
    title: 'requireAuth',
    detail: (
      <>
        This code runs before the route and checks who you are. It verifies the JWT (a signed token;
        HS256 is the signing method, and the issuer is pinned, so the token must name this app as
        its issuer). Then it loads the user by primary key (the unique ID column). Role and{' '}
        <Code>active</Code> come from the database, not from the token.
      </>
    ),
    fail: '401 UNAUTHENTICATED (not signed in)',
  },
  {
    title: 'Rate limits',
    detail: (
      <>
        A rate limit is a cap on requests per minute. The questions API allows 120 a minute by
        default. Tags, departments and the admin pages share a separate 120 a minute. Refreshing or
        ending a session is limited per address. Rate-limit headers are switched off on purpose, so
        a hidden search result cannot be told apart from a genuinely empty one.
      </>
    ),
    fail: '429 RATE_LIMITED (too many requests)',
  },
  {
    title: 'requireRole (create only)',
    detail: (
      <>
        This is a role gate: it lets only certain roles through. <Code>POST /questions</Code> allows
        Author and Admin, and runs before validation. Edits and reviews have no role gate here.
        Their role check sits inside the service, after the check that you can see the question. The
        whole <Code>/admin/*</Code> router is for Admin only.
      </>
    ),
    fail: '403 FORBIDDEN (your role is not allowed)',
  },
  {
    title: 'Validation with Zod',
    detail: (
      <>
        Zod checks that the input has the right shape. Params (parts of the URL), query (the part
        after the <Code>?</Code>) and body are all checked. The schemas are strict, so unknown
        fields are rejected, not ignored. Nothing below this step runs on bad input.
      </>
    ),
    fail: '400 VALIDATION_ERROR with the field issues',
  },
  {
    title: 'Route handler, then service, then repository',
    detail: (
      <>
        Three layers share the work. The handler stays thin: it reads the request and sends the
        reply. The service holds the rules (visibility, role, duplicates, and the audit record of
        who did what). The repository holds the SQL.
      </>
    ),
  },
  {
    title: 'One error handler',
    detail: (
      <>
        Known errors become a JSON body shaped like <Code>{'{ error: { code, message } }'}</Code>.
        Anything unexpected is logged in full on the server. The caller only sees a bare 500.
      </>
    ),
    fail: '500 INTERNAL (unexpected server error)',
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
      'Visibility is part of the same SQL WHERE (the part of a query that picks rows) as the filters. So hidden rows are never fetched, counted or ranked.',
    steps: [
      {
        title: 'Validate the query',
        detail: (
          <>
            A strict schema checks the query string: <Code>q</Code> (the search text) up to 200
            characters, <Code>tags</Code>, <Code>clientId</Code>, <Code>limit</Code> 1 to 50, and{' '}
            <Code>offset</Code> (how many rows to skip).
          </>
        ),
        fail: '400 VALIDATION_ERROR',
      },
      {
        title: 'Resolve the tag filters',
        detail: (
          <>
            Tag values are looked up and turned into ids. Different categories are AND-ed: all must
            match. Values inside one category are OR-ed: any may match.
          </>
        ),
        fail: '400 UNKNOWN_TAG · UNKNOWN_TAG_CATEGORY',
      },
      {
        title: 'Build one WHERE clause',
        detail: (
          <>
            <Code>visible(actor)</Code> (the rule that decides which rows you may see) AND the
            optional client filter AND the full-text match AND the tag groups. Full-text search uses
            a lookup structure that makes text search fast. A <Code>clientId</Code> you hold no
            grant for just returns nothing.
          </>
        ),
      },
      {
        title: 'Run two statements that share the clause',
        detail: (
          <>
            One statement fetches the page, ordered by relevance when searching and newest first
            otherwise. The other counts the total. Both use the same WHERE clause.
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
    intro: 'A question hidden from you looks exactly like one that does not exist.',
    steps: [
      {
        title: 'Validate the id',
        detail: <>The id must be a UUID (a long, random, unique ID).</>,
        fail: '400 VALIDATION_ERROR',
      },
      {
        title: 'Select with the visibility rule',
        detail: (
          <>
            The query is <Code>WHERE id = $1 AND visible(actor)</Code>. If no row comes back, the
            answer is “not found”.
          </>
        ),
        fail: '404 NOT_FOUND',
      },
      {
        title: 'History: only after the question is confirmed visible',
        detail: (
          <>
            Only the edit diffs of this question are returned: the before and after of each change.
            Raw audit payloads are never returned, because they can name other questions.
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
      'The checks run cheapest and safest first. The insert and its audit row commit together: both are saved, or neither is.',
    steps: [
      {
        title: 'Role gate, then validation',
        detail: (
          <>
            Only Author or Admin may create. Then the body is checked: text 1 to 1000 characters,
            notes up to 10,000, at most 30 tags, optional <Code>clientId</Code>, optional{' '}
            <Code>confirmNotDuplicate</Code>.
          </>
        ),
        fail: '403 FORBIDDEN · 400 VALIDATION_ERROR',
      },
      {
        title: 'Grant check for the chosen client',
        detail: (
          <>
            Looks up <Code>department_grant</Code> for you and that client (a client is a
            department). A client you are not granted looks exactly like one that does not exist.
          </>
        ),
        fail: '404 NOT_FOUND',
      },
      {
        title: 'Resolve the tags',
        detail: (
          <>
            Tag values must already exist in the fixed list of tags. Callers cannot invent
            categories.
          </>
        ),
        fail: '400 UNKNOWN_TAG · UNKNOWN_TAG_CATEGORY',
      },
      {
        title: 'Duplicate check, on questions you can see only',
        detail: (
          <>
            Trigram similarity (a score for how alike two texts are) at 0.6 or above. If there is a
            match and you did not confirm, the attempt is recorded as{' '}
            <Code>DUPLICATE_REJECTED</Code> and saved on its own, and the matches come back. Hidden
            questions are never compared.
          </>
        ),
        fail: '409 DUPLICATE_SUSPECTED',
      },
      {
        title: 'One transaction: insert and audit',
        detail: (
          <>
            A transaction groups database writes so that all succeed or none do. Here it inserts the
            question and its tag links through Prisma (the library that talks to the database). It
            writes <Code>DUPLICATE_OVERRIDDEN</Code> when you confirmed past a match, and writes{' '}
            <Code>QUESTION_CREATED</Code>. All or nothing.
          </>
        ),
      },
      {
        title: 'Read it back and respond',
        detail: (
          <>
            Reads the row again through the visibility rule and returns 201 (Created) with the
            question.
          </>
        ),
      },
    ],
  },
  {
    id: 'op-edit',
    title: 'Edit',
    route: 'PATCH /api/questions/:id',
    intro: 'Visibility first, then role, all inside one transaction (all or nothing).',
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
        title: 'Load the question through the visibility rule',
        detail: <>You cannot edit what you cannot see.</>,
        fail: '404 NOT_FOUND',
      },
      {
        title: 'Check the role',
        detail: (
          <>
            You may edit if you are an Author and wrote this question, or if you are an Admin.
            Everyone else, Reviewers included, stops here. An Author’s edit sends the question back
            to review. An Admin’s edit does not.
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
            Updates the row, and replaces the tag set if it changed. Then writes{' '}
            <Code>QUESTION_UPDATED</Code> with each field’s before and after. The history page is
            built from these rows. Committing saves it all together.
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
    purpose: 'Accounts. Each has one global role: USER, AUTHOR, REVIEWER or ADMIN.',
    keys: 'email must be unique · active flag · deleted_at (set when the account is soft-deleted: marked as deleted, not removed)',
  },
  {
    name: 'department',
    purpose:
      'The departments that can own restricted questions (MERN, MEAN, Python, AI-ML, Data Engineering, DevOps).',
    keys: 'name must be unique · deleted_at (soft delete: marked as deleted, and an admin can restore it)',
  },
  {
    name: 'department_grant',
    purpose: 'A row means this user may see that department’s questions.',
    keys: 'PK (user_id, department_id): a composite key, so the two columns together are the unique ID · the visibility check is a primary-key lookup',
  },
  {
    name: 'question',
    purpose:
      'The question text, answer notes, author, optional department, review status and the reviewer’s note.',
    keys: 'department_id set at creation, never changed · deleted_at · text is not unique · full-text and trigram indexes (lookup structures that make text search fast)',
  },
  {
    name: 'tag_category · tag',
    purpose:
      'The fixed categories: technology, seniority, question type. An Admin manages the values of the last two here, and technologies per department.',
    keys: 'archived_at on a tag hides it from pickers and filters but keeps it on old questions · renaming changes the label, never the stored value',
  },
  {
    name: 'department_tag',
    purpose:
      'Which technologies a department offers. It is many-to-many: one technology can belong to several departments. Example: Node.js can sit under MERN and MEAN.',
    keys: 'PK (department_id, tag_id) · a technology with no department is shown as “Other”',
  },
  {
    name: 'question_tag',
    purpose:
      'Links questions and tags. It is many-to-many: a question has many tags, and a tag is on many questions.',
    keys: 'PK (question_id, tag_id)',
  },
  {
    name: 'audit_event',
    purpose:
      'The audit trail: who did what and when. It covers question created, edited, reviewed, deleted or restored; user, department, technology and tag changes; and duplicate rejected or overridden.',
    keys: 'append-only: a database trigger refuses UPDATE and DELETE, so rows can never be changed or removed · question_id is null for a rejected duplicate · JSON payload',
  },
  {
    name: 'notification',
    purpose:
      'One row when a reviewer decides on a question: who is told, which question, approved or rejected. It holds ids only. The question text is read when it is shown, and only while that person can still see the question.',
    keys: 'user_id · read_at is null while unread · question_id has no foreign key (a database link to another table), so a later delete cannot break it',
  },
  {
    name: 'refresh_token',
    purpose:
      'The server’s record of each refresh token (a long-lived token used to get new short-lived ones). It is stored hashed: scrambled one way, so a leak does not reveal the token.',
    keys: 'one family (a chain of rotated tokens) per login · used and revoked timestamps',
  },
];

export const VISIBLE_SQL = `-- the visibility rule (the "predicate"), added to every read of "question"
q.deleted_at IS NULL                        -- soft-deleted (marked deleted): hidden from everyone
AND department is not deleted
-- Admins stop here. Everyone else also needs:
AND ( q.department_id IS NULL                   -- global (no department), or you hold a grant:
      OR EXISTS (SELECT 1 FROM department_grant g
                 WHERE g.user_id = $actor AND g.department_id = q.department_id) )
AND CASE role                               -- and a status their role may read:
      WHEN READ-ONLY THEN status = 'APPROVED'
      WHEN AUTHOR    THEN status = 'APPROVED' OR author = $actor
      WHEN REVIEWER  THEN true END`;

export const STATUS_ROWS: { status: string; code: string; from: string; meaning: string }[] = [
  {
    status: '400',
    code: 'VALIDATION_ERROR',
    from: 'Zod validation (the input check)',
    meaning:
      'The input has the wrong shape, has a field that is not allowed, names an unknown or archived tag, names a technology that is not one of the department’s, or contains a NUL character.',
  },
  {
    status: '401',
    code: 'UNAUTHENTICATED',
    from: 'requireAuth',
    meaning: 'You are not signed in: no session, an expired one, or a disabled account.',
  },
  {
    status: '403',
    code: 'FORBIDDEN',
    from: 'requireRole, or the service on edit',
    meaning:
      'You are signed in, but your role does not allow it. Or you are an Author editing someone else’s question that you can see.',
  },
  {
    status: '404',
    code: 'NOT_FOUND',
    from: 'The service and the SQL',
    meaning:
      'Missing, or hidden from you: the two look the same. Also used for a client you hold no grant for.',
  },
  {
    status: '409',
    code: 'DUPLICATE_SUSPECTED',
    from: 'Create',
    meaning:
      'A very similar question already exists. Send the request again with confirmNotDuplicate to override.',
  },
  {
    status: '409',
    code: 'LAST_ADMIN · NOT_PENDING · DEPARTMENT_DELETED',
    from: 'The services',
    meaning:
      'The request clashes with the current state. The last active admin cannot be removed, a question was already reviewed, or its department must be restored first.',
  },
  {
    status: '413',
    code: 'PAYLOAD_TOO_LARGE',
    from: 'The JSON parser',
    meaning: 'The request body is over 100 kB.',
  },
  {
    status: '429',
    code: 'RATE_LIMITED',
    from: 'Rate limit (a cap on requests per minute)',
    meaning:
      'Too many requests from this account in a minute, or too many sign-in attempts from this address.',
  },
  {
    status: '500',
    code: 'INTERNAL',
    from: 'The error handler',
    meaning:
      'Something unexpected went wrong. The detail is logged on the server and never sent to you.',
  },
];

export const TRACES: { who: string; request: string; path: string; result: string }[] = [
  {
    who: 'User (read-only)',
    request: 'POST /questions',
    path: 'requireAuth passes, because the user is signed in. requireRole then stops them.',
    result: '403',
  },
  {
    who: 'User (no department grants)',
    request: 'GET a MERN question by id',
    path: 'The visibility check finds no row, exactly as for an id that does not exist. So they get “not found”, not “forbidden”.',
    result: '404',
  },
  {
    who: 'Author',
    request: 'PATCH a global question another Author wrote',
    path: 'The Author can see it, so the visibility check passes. The role check then finds they are not the question’s author.',
    result: '403',
  },
  {
    who: 'Reviewer (all departments)',
    request: 'POST a review of a pending AI-ML question',
    path: 'Visible through the AI-ML grant. A Reviewer who is not the author may review a pending question.',
    result: '200',
  },
  {
    who: 'Reviewer (all departments)',
    request: 'PATCH a question to edit it',
    path: 'Visibility passes, then the role check finds that only the question’s author, or an Admin, may edit. Reviewers decide, they do not edit.',
    result: '403',
  },
];

const short = (email: string) => email.replace('@mailinator.com', '@');
const holders = (client: DemoClient) =>
  DEMO_ACCOUNTS.filter((a) => a.grants.includes(client)).map((a) => ({ text: short(a.email) }));

/** One mind map per tab. The grants map is built from the demo accounts, so it cannot drift from them. */
export const MIND_MAPS: Record<string, MindMapData> = {
  features: {
    center: 'One click',
    branches: [
      { title: 'Sign in', leaves: [{ text: 'Reads app_user' }, { text: 'Writes refresh_token' }] },
      {
        title: 'Search',
        leaves: [{ text: 'Reads only' }, { text: 'Visibility rule in the SQL' }],
      },
      {
        title: 'Open one',
        leaves: [{ text: 'Reads question and history' }, { text: 'Hidden is a 404' }],
      },
      {
        title: 'Add',
        leaves: [
          { text: 'Writes question and tags' },
          { text: 'Writes an audit event' },
          { text: 'One transaction: all or nothing' },
        ],
      },
      {
        title: 'Edit',
        leaves: [
          { text: 'Refuses an out-of-date save (409)' },
          { text: 'Updates question' },
          { text: 'Audit event holds the diff' },
        ],
      },
      {
        title: 'Review',
        leaves: [
          { text: 'Locks the row, then decides' },
          { text: 'Audit event holds the note' },
          { text: 'Writes a notification for the author' },
        ],
      },
      {
        title: 'Department technologies',
        leaves: [
          { text: 'Links or creates a technology' },
          { text: 'Existing questions untouched' },
        ],
      },
      {
        title: 'Delete a department',
        leaves: [
          { text: 'Hides it, erases nothing' },
          { text: 'Archives technologies only it used' },
          { text: 'Restore undoes exactly that' },
        ],
      },
      {
        title: 'Stay signed in',
        leaves: [{ text: 'Marks the old token used' }, { text: 'Writes the next token' }],
      },
    ],
  },
  path: {
    center: 'Full Stack 101 path',
    branches: [
      {
        title: '01 Request flow',
        leaves: [{ text: 'Node.js runtime: server.ts' }, { text: 'HTTP and REST: routes.ts' }],
      },
      {
        title: '02 Data',
        leaves: [
          { text: 'PostgreSQL and Prisma' },
          { text: 'CRUD for every resource' },
          { text: 'Paging, sorting, filtering' },
        ],
      },
      {
        title: '03 Safe',
        leaves: [
          { text: 'Zod validation' },
          { text: 'One error handler' },
          { text: 'Cookies and rotating tokens' },
          { text: 'Visibility, then role' },
        ],
      },
      {
        title: '04 Build',
        leaves: [
          { text: 'Routes, services, repositories' },
          { text: 'Vertical slices (by feature)' },
        ],
      },
      {
        title: '05 Run',
        leaves: [{ text: 'Tests at every level' }, { text: 'pino logs' }, { text: 'Docker' }],
      },
    ],
  },
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
          { text: 'Create for a department you hold a grant for' },
          { text: 'Edit only questions you wrote (resubmits)' },
          { text: 'Withdraw your own question until it is approved' },
        ],
      },
      {
        title: 'Reviewer',
        leaves: [
          { text: 'See every status in your departments' },
          { text: 'Approve or reject with a note' },
          { text: 'See the review queue count' },
          { text: 'No grant, no access' },
        ],
      },
      {
        title: 'Admin',
        leaves: [
          { text: 'See, add, edit and delete any question' },
          { text: 'Add, edit and delete users and reviewers' },
          { text: 'Add, edit, delete and restore departments' },
          { text: 'Manage each department’s technologies' },
          { text: 'Manage seniority and type tags' },
          { text: 'Restore deleted questions' },
          { text: 'Browse and export the audit trail' },
        ],
      },
      {
        title: 'Not possible for anyone',
        tone: 'danger',
        leaves: [
          { text: 'Move a question to another department' },
          { text: 'Erase history (deletes only hide)' },
        ],
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
          { text: 'Questions with no department' },
        ],
      },
      ...DEMO_CLIENTS.map((c) => ({
        title: c,
        tone: 'restricted' as const,
        leaves: holders(c),
      })),
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
          { text: 'Create: Author or Admin' },
          { text: 'Edit: your own as Author, any as Admin' },
          { text: 'Review: Reviewer (pending), Admin (any)' },
          { text: 'Delete: Admin' },
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
          { text: 'helmet headers, no-store caching' },
          { text: 'JSON body capped at 100 kb' },
          { text: 'NUL-byte gate' },
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
        leaves: [{ text: 'department' }, { text: 'department_grant: the visibility lookup' }],
      },
      {
        title: 'Content',
        leaves: [
          { text: 'question' },
          { text: 'question_tag' },
          { text: 'tag and tag_category' },
          { text: 'department_tag: department technologies' },
        ],
      },
      {
        title: 'Audit and notices',
        leaves: [
          { text: 'audit_event: who, what, when (append-only)' },
          { text: 'notification: a decision on your question' },
        ],
      },
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
          { text: 'Carries your user id and session id' },
        ],
      },
      {
        title: 'Refresh token',
        leaves: [
          { text: 'Lasts 7 days' },
          { text: 'Sent to /api/auth only' },
          { text: 'Used once; reuse revokes the session' },
          { text: 'Revoking it ends the access token too' },
          { text: 'Stored hashed (scrambled)' },
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
          { text: 'And per address across all emails' },
        ],
      },
    ],
  },
  decisions: {
    center: 'Technical decisions',
    branches: [
      {
        title: 'Repository',
        leaves: [
          { text: 'npm workspaces, two apps' },
          { text: 'Strict TypeScript' },
          { text: 'Exact versions, ADRs' },
        ],
      },
      {
        title: 'Folders',
        leaves: [
          { text: 'API: by feature, layers inside' },
          { text: 'Web: app, features, shared' },
          { text: 'One module reads questions' },
        ],
      },
      {
        title: 'Backend',
        leaves: [
          { text: 'Express 5, route → service → repo' },
          { text: 'Zod first, one error handler' },
          { text: 'Cookies, locks, soft delete' },
        ],
      },
      {
        title: 'Database',
        leaves: [
          { text: 'PostgreSQL only' },
          { text: 'Prisma writes, raw SQL reads' },
          { text: 'Composite keys, UUIDs, RESTRICT' },
          { text: 'Append-only audit' },
        ],
      },
      {
        title: 'Frontend',
        leaves: [
          { text: 'React 19 + Vite' },
          { text: 'TanStack Query, URL filters' },
          { text: 'Own UI kit on native elements' },
        ],
      },
      {
        title: 'Delivery',
        leaves: [
          { text: 'Compose, migrate job, nginx' },
          { text: 'Real-database tests' },
          { text: 'Guards, property, mutation, E2E' },
        ],
      },
    ],
  },
  approach: {
    center: 'Approach',
    branches: [
      {
        title: 'Access',
        tone: 'restricted',
        leaves: [
          { text: 'Visibility rule in the SQL' },
          { text: 'Hidden looks like missing (404)' },
          { text: 'Role checked second' },
        ],
      },
      {
        title: 'Code shape',
        leaves: [
          { text: 'Route, service, repository' },
          { text: 'Strict Zod validation' },
          { text: 'One error handler' },
        ],
      },
      {
        title: 'Data',
        leaves: [
          { text: 'Review workflow and audit' },
          { text: 'Soft delete and restore' },
          { text: 'Technologies per department' },
          { text: 'Search and duplicates in Postgres' },
        ],
      },
      {
        title: 'Sessions',
        leaves: [{ text: 'httpOnly cookies' }, { text: 'Rotating refresh tokens' }],
      },
      {
        title: 'Frontend and deploy',
        leaves: [
          { text: 'URL is the state' },
          { text: 'One origin behind nginx' },
          { text: 'Validated config, loopback ports' },
        ],
      },
    ],
  },
  security: {
    center: 'Security',
    branches: [
      {
        title: 'Prevent',
        leaves: [
          { text: 'Access control in SQL' },
          { text: 'Strict input validation' },
          { text: 'Cookies, CSRF, CSP' },
          { text: 'Safe defaults' },
        ],
      },
      {
        title: 'Limit',
        leaves: [
          { text: 'Rate limits per IP and email' },
          { text: 'Body size cap' },
          { text: 'Last admin protected' },
        ],
      },
      {
        title: 'Detect',
        leaves: [
          { text: 'Audit events' },
          { text: 'Redacted structured logs' },
          { text: 'Refresh reuse revokes the session' },
        ],
      },
      {
        title: 'Prove',
        leaves: [
          { text: 'Attack tests that failed first' },
          { text: 'Route sweep and architecture guard' },
          { text: 'Written security review' },
        ],
      },
    ],
  },
};
