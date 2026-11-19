import type { ReactNode } from 'react';
import { Code } from './Flow';

// The approach, the security model and the engineering practices of this POC. Every statement
// describes code or docs in this repository: keep it in step with what it names.

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
      'A restricted question must never leak, not through a list, a count, a search rank, a duplicate warning or a guessed id.',
    decision: (
      <>
        One predicate (<Code>visible(actor)</Code>) is appended to every read of the{' '}
        <Code>question</Code> table, in the same statement as the filters, search, count and paging.
        Only <Code>question.repo.ts</Code> may touch that table, and a test fails if any other file
        does.
      </>
    ),
    why: 'Filtering in application code means one forgotten endpoint is a data leak. Putting the rule in the only module that reads the table makes the safe path the only path.',
    tradeoff: 'Reads are hand-written SQL next to Prisma writes.',
  },
  {
    id: 'not-found',
    title: 'Hidden looks exactly like missing',
    problem: 'An error that says “forbidden” confirms the thing exists.',
    decision: (
      <>
        Visibility is checked before role, so a hidden question answers <Code>404</Code>, never{' '}
        <Code>403</Code>, with the same body as an id that does not exist. The duplicate check only
        compares questions you can see, there is no unique constraint on question text, and
        rate-limit headers are off so a hidden result cannot be told apart from an empty one.
      </>
    ),
    why: 'Every difference between “not allowed” and “not there” is a probe an attacker can use. The access matrix tests assert the two responses are byte-identical.',
    tradeoff:
      'A legitimate user sometimes sees “not found” for something that exists but is not theirs. That is the point.',
  },
  {
    id: 'layers',
    title: 'Route, service, repository',
    problem: 'Rules scattered through handlers cannot be tested or reasoned about.',
    decision: (
      <>
        Routes parse and validate (Zod, strict, so unknown fields are rejected) and call a service.
        The service holds the rules in a fixed order: visibility, then role, then state. The
        repository holds the SQL. One error type and one error handler turn rules into responses.
      </>
    ),
    why: 'Each layer is testable alone, the order of the checks is the same everywhere, and the unexpected becomes a bare 500 with the detail only in the server log.',
    tradeoff:
      'More files than putting everything in a handler, and a little ceremony per endpoint.',
  },
  {
    id: 'sessions',
    title: 'Short access token, rotating refresh token, cookies only',
    problem: 'Tokens in browser storage can be read by any injected script.',
    decision: (
      <>
        A 15-minute access token and a 7-day refresh token live in <Code>httpOnly</Code>,{' '}
        <Code>SameSite=Strict</Code> cookies with narrow paths. The refresh token is stored hashed
        and works once; replaying a used one revokes the whole session family. Role and{' '}
        <Code>active</Code> are read from the database on every request, so a demotion or a
        deactivation applies at once.
      </>
    ),
    why: 'Scripts cannot read the cookies, CSRF is blocked by SameSite plus an Origin check, and a stolen refresh token is detected the first time it is reused.',
    tradeoff:
      'One user lookup per request. The access token is not tied to a session, so it stays valid for up to 15 minutes after a sign-out.',
  },
  {
    id: 'review',
    title: 'Review workflow with an audit trail',
    problem: 'A shared bank is only useful if its content can be trusted.',
    decision: (
      <>
        New and edited questions start <Code>PENDING</Code>. A Reviewer who is not the author
        approves or rejects (a rejection needs a note); an Admin’s own questions go live at once. A
        row lock makes two reviewers deciding at once safe. Every change writes an{' '}
        <Code>audit_event</Code> in the same transaction.
      </>
    ),
    why: 'The history page is built from real rows, and a change and its record can never disagree because they commit together.',
    tradeoff: 'Authors wait for a reviewer. Concurrent edits are last-write-wins.',
  },
  {
    id: 'soft-delete',
    title: 'Nothing is destroyed: delete hides, an admin can restore',
    problem: 'Deleting a department or technology must not wipe a team’s questions by accident.',
    decision: (
      <>
        Users, departments and questions are soft-deleted (<Code>deleted_at</Code>) and vanish from
        every read, admins included. Admins list and restore them from the interface. A technology
        is archived, never deleted: hidden from filters and new questions, kept on the questions
        that already have it.
      </>
    ),
    why: 'History, authorship and audit stay valid, and a mistaken click is one click to undo.',
    tradeoff: 'Deleted rows stay in the database.',
  },
  {
    id: 'technologies',
    title: 'Technologies belong to departments',
    problem:
      'A Python question should offer Django, not React, and a technology like Node.js is shared by two departments.',
    decision: (
      <>
        Departments and technologies are many-to-many (<Code>client_tag</Code>). A department
        question may only use its own technologies, a global one any active technology. Removing a
        shared technology only unlinks it; removing one nobody else uses archives it. Deleting a
        department archives the technologies only it used, with the same timestamp, so restoring it
        brings back exactly those. Technologies with no department are grouped as “Other”.
      </>
    ),
    why: 'One technology, one name, one set of counts, and no duplicates like “Node.js (MERN)” and “Node.js (MEAN)”.',
    tradeoff:
      'Rules are subtler than a flat list, so they are covered by explicit tests for every shared, exclusive and restore case.',
  },
  {
    id: 'search',
    title: 'Search and duplicates inside Postgres',
    problem: 'Find the right question fast, and stop near-copies from piling up.',
    decision: (
      <>
        Full-text search (question text weighted above answer notes) and trigram similarity, both
        index-backed. A new question is compared to the questions you can see at similarity 0.6 or
        above; you can override, and the override is audited. Page size is capped at 50.
      </>
    ),
    why: 'No separate search service to run, and the visibility rule applies to search, ranking and duplicates because they are the same query.',
    tradeoff:
      'The duplicate rule has false positives (a rate limiter and a cache design can score alike). The override exists for that. The planner needed a hint to use the trigram index: 72 ms became 5.7 ms on 5,000 rows.',
  },
  {
    id: 'frontend',
    title: 'The URL is the state; the server is the cache',
    problem: 'Filters, pages and tabs should survive a refresh, a shared link and the back button.',
    decision: (
      <>
        Filters and the page number live in the URL; TanStack Query holds server data and is cleared
        on sign-in and sign-out; forms use react-hook-form with Zod. Styling is Tailwind with design
        tokens (light and dark). Dialogs, dropdowns and fieldsets use native HTML (
        <Code>dialog</Code>, <Code>details</Code>) so focus, Escape and screen readers work without
        custom code.
      </>
    ),
    why: 'Less state to keep in sync, shareable links, and accessibility that comes from the platform.',
    tradeoff:
      'Native elements need a little glue (the dropdown’s outside-click and focus handling), which has its own regression test.',
  },
  {
    id: 'deploy',
    title: 'One origin, validated config, loopback ports',
    problem: 'Cookies, CORS and secrets are where small setups quietly go wrong.',
    decision: (
      <>
        nginx serves the app and forwards <Code>/api</Code>, so the browser sees one origin: cookies
        are first-party and no CORS is configured. Environment variables are validated with Zod at
        start and the API refuses unsafe combinations. Postgres and the API ports are bound to{' '}
        <Code>127.0.0.1</Code>; only the web port is public. Migrations are committed and applied
        with <Code>prisma migrate deploy</Code>.
      </>
    ),
    why: 'Fewer moving parts to misconfigure, and a bad deployment fails at start instead of at 3am.',
    tradeoff: (
      <>
        The proxy hop must be declared (<Code>TRUST_PROXY</Code>); rate limits are per process until
        a shared store is added.
      </>
    ),
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
        Visibility in SQL, 404 instead of 403, role gates, every <Code>/admin</Code> route
        admin-only at the router, strict schemas against mass assignment.
      </>
    ),
    proof: 'security.access.test.ts, visibility.test.ts',
  },
  {
    threat: 'Credential stuffing and password guessing',
    defence: (
      <>
        argon2id, one identical answer for unknown email, wrong password and disabled account,
        limits per IP and email and per IP across all emails, <Code>X-Forwarded-For</Code> trusted
        only for the declared proxy hops.
      </>
    ),
    proof: 'security.auth.test.ts',
  },
  {
    threat: 'Session theft and replay',
    defence:
      'httpOnly SameSite=Strict cookies, hashed single-use refresh tokens, whole family revoked on reuse, sessions killed on password reset, deactivation and delete.',
    proof: 'auth.test.ts, security.auth.test.ts',
  },
  {
    threat: 'CSRF',
    defence: 'SameSite=Strict plus an Origin allow-list on every unsafe request.',
    proof: 'A5 cases: null, other port, look-alike host',
  },
  {
    threat: 'SQL injection and hostile input',
    defence: (
      <>
        Parameterised queries only (<Code>$queryRawUnsafe</Code> is banned by a test), strict Zod
        schemas, a gate that rejects NUL bytes, body capped at 100 kB.
      </>
    ),
    proof: 'security.input.test.ts, hardening.test.ts',
  },
  {
    threat: 'Cross-site scripting',
    defence:
      'React escapes everything, no raw HTML anywhere, a strict CSP from nginx (no inline script or style), no tokens in web storage.',
    proof: 'security.xss.test.tsx',
  },
  {
    threat: 'Admin lock-out and logic abuse',
    defence:
      'The last active admin cannot be demoted, deactivated or deleted, even by two admins at once; reviewers cannot approve their own questions; reviews are row-locked.',
    proof: 'A8 last admin, B2 role gates',
  },
  {
    threat: 'Misconfiguration and information disclosure',
    defence: (
      <>
        helmet, <Code>Cache-Control: no-store</Code> on the API, no stack or SQL in errors, Swagger
        off by default in production, loopback-only database and API ports, refusal to start with
        placeholder secrets or the default demo password over https.
      </>
    ),
    proof: 'security.http.test.ts, config.test.ts',
  },
  {
    threat: 'Vulnerable dependencies and leaked secrets',
    defence:
      'npm audit fix applied for runtime advisories, the rest documented; git history scanned; secrets only in the git-ignored .env, logs redact cookies and tokens.',
    proof: 'docs/06-security-review.md, auth.test.ts “secrets in logs”',
  },
];

export interface PracticeGroup {
  id: string;
  title: string;
  points: ReactNode[];
}

export const PRACTICES: PracticeGroup[] = [
  {
    id: 'testing',
    title: 'Testing',
    points: [
      <>
        <strong>Unit tests</strong> for pure logic with no database: tokens, passwords, the CSRF
        origin check, the NUL gate, technology name matching, the error handler, tag rules (against
        a stand-in database).
      </>,
      <>
        <strong>Integration tests</strong> run the real Express app against a real Postgres (no
        mocks), in an isolated <Code>qb_test</Code> database that is migrated and truncated by the
        suite. 450+ API tests.
      </>,
      <>
        <strong>UI tests</strong> with Testing Library find things by role and accessible name, the
        way a person or a screen reader would, and run axe on the main screens. 170+ web tests.
      </>,
      <>
        <strong>Guards, not just checks:</strong> a route manifest fails the build when a route is
        added without being swept for authentication, and an architecture test fails if anything but
        one module reads the question table.
      </>,
      <>
        <strong>Coverage</strong> is measured, not assumed: about 99% of statements in the API and
        94% in the web app. Mutation spot-checks (remove the visibility predicate, remove the edit
        check) were run to prove the tests bite.
      </>,
    ],
  },
  {
    id: 'tdd',
    title: 'Test-driven development and the red team',
    points: [
      <>
        For each risk the test is written first and asserts the <em>secure</em> behaviour. A failing
        test is a finding; the smallest fix turns it green and the test stays as a regression guard.
      </>,
      <>
        The security pass found real holes this way (login rotation, spoofed proxy header, NUL
        bytes, a last-admin race, cacheable responses) and fixed each with the failing test shown
        first.
      </>,
      <>
        A known limit is documented by a test marked <Code>it.fails</Code> (the access token staying
        valid after a sign-out), so it flips the moment the behaviour changes.
      </>,
      <>
        Bug reports become tests too: the dropdown that crashed a browser tab when you clicked an
        option’s text now has a regression test.
      </>,
    ],
  },
  {
    id: 'quality',
    title: 'Code quality',
    points: [
      'TypeScript everywhere with a shared base config, ESLint and Prettier on the whole repo.',
      'One error type with a stable JSON shape, and one place that turns errors into responses.',
      'Small modules with a single reason to change; comments say why, not what, and name the test or rule they protect.',
      'No speculative abstractions: the simplest thing that satisfies the rule, with a “ponytail” comment where a shortcut has a known ceiling.',
      'Contract and code stay together: the OpenAPI document is generated from the same Zod schemas the routes use, and a test fails if a route is undocumented.',
    ],
  },
  {
    id: 'a11y',
    title: 'Accessibility',
    points: [
      'Semantic HTML first: native dialog, details, fieldset, table captions, a skip link, visible focus, reduced motion respected.',
      'Colour is never the only signal: statuses and restricted questions carry text and icons as well.',
      'axe-core runs in the unit tests. Colour contrast was also checked in real Chrome on the production build, in light and dark.',
    ],
  },
  {
    id: 'docs',
    title: 'Decisions and documentation',
    points: [
      'Numbered documents: requirements, technology selection, architecture with decision records (ADRs), task plan, progress with an honest known-issues list, and the security review.',
      'Every claim on this page names the code it describes, and the README says how to run, test and configure everything in three ways.',
    ],
  },
  {
    id: 'delivery',
    title: 'Delivery and operations',
    points: [
      'One branch per ticket (T-xx) and small commits with a clear prefix (feat, test, fix, docs).',
      'Migrations are committed SQL, applied with Prisma; the seed is deterministic so demos and tests are repeatable.',
      'Docker Compose runs the database, the API and nginx with health checks; the API runs as a non-root user.',
      'Structured JSON logs (pino) with server-made request ids and redacted cookies and tokens; a health endpoint; configuration validated at start so a bad deploy fails immediately.',
      'Performance is measured, not guessed: query plans were captured for each role, and an index hint was added only after the planner was shown to pick a 72 ms plan over a 6 ms one.',
    ],
  },
];
