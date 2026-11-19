import type { ReactNode } from 'react';
import { Code } from './Flow';

// The approach, the security model and the engineering practices of this POC. Every statement
// describes code or docs in this repository: keep it in step with what it names.
// The wording is written for a beginner: short sentences, and a plain explanation the first time
// a technical term appears in each block.

export interface Approach {
  id: string;
  title: string;
  /** The problem in one sentence. */
  problem: string;
  /** What we did. */
  decision: ReactNode;
  /** Why this and not the obvious alternative. */
  why: ReactNode;
  /** What it costs. Always honest. */
  tradeoff: ReactNode;
}

export const APPROACHES: Approach[] = [
  {
    id: 'visibility',
    title: 'Who can see a question is decided in the SQL',
    problem:
      'A restricted question must never leak. It must not show up in a list, a count, a search ranking, a duplicate warning or a guessed id.',
    decision: (
      <>
        One rule, <Code>visible(actor)</Code>, is added to every read of the <Code>question</Code>{' '}
        table. (The actor is the signed-in user.) It sits in the same SQL statement as the filters,
        search, count and paging. Only <Code>question.repo.ts</Code> may touch that table. A test
        fails if any other file does.
      </>
    ),
    why: 'If the check lived in application code, one forgotten endpoint (a URL the API serves) would leak data. Only one module reads the table, so the safe path is the only path.',
    tradeoff:
      'Reads are hand-written SQL, while writes use Prisma (a library that lets code talk to the database).',
  },
  {
    id: 'not-found',
    title: 'Hidden looks exactly like missing',
    problem:
      'An error that says “forbidden” confirms the thing exists, so an attacker learns it is there.',
    decision: (
      <>
        Visibility is checked before role. So a hidden question answers <Code>404</Code> (not
        found), never <Code>403</Code> (forbidden). The body is the same as for an id that does not
        exist. The duplicate check only compares questions you can see. There is no unique
        constraint on question text (a database rule that refuses repeated values). Rate-limit
        headers (headers that show how many requests are left) are off, so a hidden result cannot be
        told apart from an empty one.
      </>
    ),
    why: 'Any difference between “not allowed” and “not there” is a clue an attacker can use. The access matrix tests assert that the two responses are byte-identical (exactly the same).',
    tradeoff:
      'A legitimate user sometimes sees “not found” for something that exists but is not theirs. That is the point.',
  },
  {
    id: 'layers',
    title: 'Route, service, repository',
    problem:
      'If rules are spread across request handlers, they are hard to test and hard to understand.',
    decision: (
      <>
        Routes parse and validate the input (with Zod, in strict mode, so unknown fields are
        rejected) and call a service. The service holds the rules in a fixed order: visibility, then
        role, then state. The repository holds the SQL. One error type and one error handler turn
        broken rules into HTTP responses.
      </>
    ),
    why: 'Each layer can be tested alone. The checks run in the same order everywhere. An unexpected error becomes a plain 500 response, and the detail goes only to the server log.',
    tradeoff:
      'More files than putting everything in one handler, and a little extra ceremony per endpoint.',
  },
  {
    id: 'sessions',
    title: 'Short-lived access token, one-use refresh token, cookies only',
    problem:
      'Tokens kept in browser storage can be read by any script that gets injected into the page.',
    decision: (
      <>
        The access token lasts 15 minutes and the refresh token lasts 7 days. Both live in cookies
        that are <Code>httpOnly</Code> (page scripts cannot read them) and{' '}
        <Code>SameSite=Strict</Code> (the browser sends them only for requests from this site), with
        narrow paths. The refresh token is stored hashed (only a scrambled copy is kept) and works
        once. If someone replays a used one, the whole session family is revoked, which means every
        token from that sign-in stops working. The access token carries the session id and is only
        good while that session lives. So signing out, a password reset or a replay ends it at once.
        Role and <Code>active</Code> are read from the database on every request, so a demotion or a
        deactivation applies at once.
      </>
    ),
    why: 'Scripts cannot read the cookies. CSRF (a trick where another website makes your browser send a request) is blocked by SameSite plus an Origin check. A stolen refresh token is detected the first time it is reused.',
    tradeoff:
      'One database lookup per request (the user and the session check share one query). Signing out cannot be undone from the browser, because the session is gone on the server.',
  },
  {
    id: 'review',
    title: 'Review workflow with an audit trail',
    problem: 'A shared question bank is only useful if people can trust its content.',
    decision: (
      <>
        New and edited questions start as <Code>PENDING</Code>. A Reviewer who is not the author
        approves or rejects them (a rejection needs a note). An Admin’s own questions go live at
        once. A row lock (other requests wait for the same row) makes it safe for two reviewers to
        decide at once. Every change writes an <Code>audit_event</Code> row in the same transaction
        (a group of changes that all succeed or all fail).
      </>
    ),
    why: 'The history page is built from real rows. A change and its record can never disagree, because they are saved together.',
    tradeoff: 'Authors wait for a reviewer.',
  },
  {
    id: 'soft-delete',
    title: 'Nothing is destroyed: delete hides, an admin can restore',
    problem: 'Deleting a department or technology must not wipe a team’s questions by accident.',
    decision: (
      <>
        Users, departments and questions are soft-deleted: the row is marked as deleted (
        <Code>deleted_at</Code>) instead of being removed. They vanish from every read, admins
        included. Admins can list and restore them from the interface. A technology is archived,
        never deleted. It is hidden from filters and new questions, but kept on the questions that
        already have it.
      </>
    ),
    why: 'History, authorship and the audit trail stay valid, and a mistaken click is one click to undo.',
    tradeoff: 'Deleted rows stay in the database.',
  },
  {
    id: 'technologies',
    title: 'Technologies belong to departments',
    problem:
      'A Python question should offer Django, not React. A technology like Node.js can be shared by two departments.',
    decision: (
      <>
        Departments and technologies are many-to-many (one department has many technologies, and one
        technology can belong to many departments). The <Code>department_tag</Code> table links
        them. A department question may only use its own technologies. A global question may use any
        active technology. Removing a shared technology only unlinks it. Removing one that nobody
        else uses archives it. Deleting a department archives the technologies only it used and
        marks them with that department. So restoring the department brings them back. A technology
        archived by hand stays archived. Technologies with no department are grouped as “Other”.
      </>
    ),
    why: 'One technology has one name and one set of counts. There are no duplicates like “Node.js (MERN)” and “Node.js (MEAN)”.',
    tradeoff:
      'The rules are subtler than a flat list, so explicit tests cover every shared, exclusive and restore case.',
  },
  {
    id: 'search',
    title: 'Search and duplicates inside Postgres',
    problem: 'Find the right question fast, and stop near-copies from piling up.',
    decision: (
      <>
        Search uses Postgres full-text search (question text counts for more than answer notes) and
        trigram similarity (comparing text by its overlapping three-letter pieces). Both are backed
        by indexes (lookup structures that make searches fast). A new question is compared with the
        questions you can see, at similarity 0.6 or above. You can override the warning, and the
        override is audited. Page size is capped at 50.
      </>
    ),
    why: 'There is no separate search service to run. The visibility rule covers search, ranking and duplicates, because they are the same query.',
    tradeoff:
      'The duplicate rule has false positives (a rate limiter and a cache design can score alike). The override exists for that. The query planner (the part of Postgres that picks how to run a query) needed a hint to use the trigram index: 72 ms became 5.7 ms on 5,000 rows.',
  },
  {
    id: 'frontend',
    title: 'The URL holds the page state; the server data is cached',
    problem: 'Filters, pages and tabs should survive a refresh, a shared link and the back button.',
    decision: (
      <>
        Filters and the page number live in the URL. TanStack Query (a library that fetches and
        caches server data) holds the server data, and it is cleared on sign-in and sign-out. Forms
        use react-hook-form with Zod. Styling is Tailwind with design tokens (named colour and size
        values, with light and dark themes). Dialogs, dropdowns and fieldsets use native HTML (
        <Code>dialog</Code>, <Code>details</Code>), so focus, Escape and screen readers work without
        custom code.
      </>
    ),
    why: 'Less state to keep in sync, links you can share, and accessibility that comes from the browser itself.',
    tradeoff:
      'Native elements need a little glue code (the dropdown’s outside-click and focus handling). That glue has its own regression test (a test that stops an old bug from coming back).',
  },
  {
    id: 'deploy',
    title: 'One origin, validated config, ports bound to localhost',
    problem:
      'Cookies, CORS (the browser rules for requests between sites) and secrets are where small setups quietly go wrong.',
    decision: (
      <>
        nginx (a web server) serves the app and forwards <Code>/api</Code> to the API. So the
        browser sees one origin, which means one site address. Cookies are first-party and no CORS
        is configured. Environment variables are validated with Zod at start, and the API refuses
        unsafe combinations. Postgres and the API ports are bound to <Code>127.0.0.1</Code>, so only
        the same machine can reach them. Only the web port is public. Migrations (versioned database
        changes) are committed and applied with <Code>prisma migrate deploy</Code>.
      </>
    ),
    why: 'Fewer moving parts to get wrong, and a bad deployment fails at start instead of at 3am.',
    tradeoff: (
      <>
        The proxy hop must be declared (<Code>TRUST_PROXY</Code>). Rate limits (a cap on how many
        requests someone can make per minute) are counted per process until a shared store is added.
      </>
    ),
  },
  {
    id: 'conflicts',
    title: 'Two people editing one question: the second save is refused',
    problem: 'Silently overwriting a colleague’s edit loses work that nobody notices is gone.',
    decision: (
      <>
        The edit form remembers the version it opened (<Code>updatedAt</Code>) and sends it back as{' '}
        <Code>expectedUpdatedAt</Code>. If the question changed in between, the API answers{' '}
        <Code>409 EDIT_CONFLICT</Code>. The form says so and offers a “Load their version” button.
        The check runs inside the same row lock as the edit, so other requests wait for that row.
      </>
    ),
    why: 'The conflict is shown to the person who can resolve it, at the moment it happens.',
    tradeoff: 'The second editor has to reapply their change. There is no automatic merge.',
  },
  {
    id: 'notifications',
    title: 'People are told what happened to their question',
    problem:
      'An author should not have to keep opening the list to learn whether a reviewer decided.',
    decision: (
      <>
        A review decision writes a <Code>notification</Code> row in the same transaction. The
        sidebar shows how many questions wait for a reviewer, how many of yours were rejected, and
        how many notifications are unread. A notification stores only ids and the outcome. The
        question text is looked up when it is shown, and only while you can still see that question.
      </>
    ),
    why: 'It adds no new way to learn about a restricted question: the visibility rule still applies when the text is read.',
    tradeoff: 'In the app only: there is no email or push delivery.',
  },
  {
    id: 'audit-trail',
    title: 'The audit trail can be read, and cannot be changed',
    problem: 'A record that the application itself can edit proves little.',
    decision: (
      <>
        A database trigger (code that runs inside the database) refuses <Code>UPDATE</Code> and{' '}
        <Code>DELETE</Code> on <Code>audit_event</Code>, even for the application’s own database
        role. Admins can browse the trail and export the same view as CSV. They can filter by type,
        person and date, newest first, paged by cursor (each page continues from the last row seen).
        Cells that a spreadsheet could run as a formula are defused (made harmless).
      </>
    ),
    why: 'The data is protected where it lives, so a bug or a stolen API session cannot rewrite history.',
    tradeoff: 'A mistaken event cannot be corrected, only followed by another one.',
  },
];

export interface SecurityRow {
  threat: string;
  defence: ReactNode;
  proof: string;
}

export const SECURITY_ROWS: SecurityRow[] = [
  {
    threat: 'Broken access control and cross-department leakage',
    defence: (
      <>
        Visibility is decided in SQL. Hidden questions answer 404, not 403. Role gates check what
        each role may do. Every <Code>/admin</Code> route is admin-only at the router. Strict
        schemas reject unknown fields, which stops mass assignment (a client sneaking in fields it
        should not set).
      </>
    ),
    proof: 'security.access.test.ts, visibility.test.ts',
  },
  {
    threat: 'Credential stuffing (trying leaked passwords) and password guessing',
    defence: (
      <>
        Passwords use argon2id (a slow, safe way to store passwords). Unknown email, wrong password
        and disabled account all get one identical answer. Rate limits (a cap on requests per
        minute) apply per IP and email, and per IP across all emails. <Code>X-Forwarded-For</Code>{' '}
        (the header that carries the real client IP) is trusted only for the declared proxy hops.
      </>
    ),
    proof: 'security.auth.test.ts',
  },
  {
    threat: 'Session theft and replay',
    defence:
      'Cookies are httpOnly (page scripts cannot read them) and SameSite=Strict. Refresh tokens are hashed and single-use, and the whole family is revoked on reuse. Access tokens are bound to their session, so a sign-out ends them at once. Sessions are also killed on password reset, deactivation and delete.',
    proof: 'auth.test.ts, security.auth.test.ts',
  },
  {
    threat: 'CSRF (another website makes your browser send a request)',
    defence:
      'SameSite=Strict, plus an Origin allow-list (a list of sites that may send requests) on every unsafe request. An unsafe request is any method other than GET, HEAD or OPTIONS.',
    proof: 'A5 cases: null, other port, look-alike host',
  },
  {
    threat: 'SQL injection (input that tricks the database) and hostile input',
    defence: (
      <>
        Parameterised queries only: values are sent apart from the SQL text. (
        <Code>$queryRawUnsafe</Code> is banned by a test.) Strict Zod schemas check every input. A
        gate rejects NUL bytes (a zero character that Postgres text cannot hold). The body is capped
        at 100 kB.
      </>
    ),
    proof: 'security.input.test.ts, hardening.test.ts',
  },
  {
    threat: 'Cross-site scripting (an attacker getting their script to run in your page)',
    defence:
      'React escapes everything, and there is no raw HTML anywhere. nginx sends a strict CSP (Content Security Policy: rules that tell the browser which scripts and styles it may run), with no inline script or style. No tokens are kept in web storage.',
    proof: 'security.xss.test.tsx',
  },
  {
    threat: 'Admin lock-out and logic abuse',
    defence:
      'The last active admin cannot be demoted, deactivated or deleted, even by two admins at once. Reviewers cannot approve their own questions. Reviews are row-locked (other requests wait for the same row).',
    proof: 'A8 last admin, B2 role gates',
  },
  {
    threat: 'Misconfiguration and information disclosure',
    defence: (
      <>
        helmet (a library that sets safe HTTP headers). <Code>Cache-Control: no-store</Code> on the
        API, so browsers do not keep copies. No stack traces or SQL in errors. Swagger (the API docs
        page) is off by default in production. The database and API ports are reachable only from
        the same machine. The API refuses to start with placeholder secrets, or with the default
        demo password over https.
      </>
    ),
    proof: 'security.http.test.ts, config.test.ts',
  },
  {
    threat: 'Vulnerable dependencies and leaked secrets',
    defence:
      'npm audit fix was applied for runtime advisories (reports of known flaws in libraries), and the rest are documented. Git history was scanned for secrets. Secrets live only in the git-ignored .env file. Logs redact (blank out) cookies and tokens.',
    proof: 'docs/06-security-review.md, auth.test.ts “secrets in logs”',
  },
];
