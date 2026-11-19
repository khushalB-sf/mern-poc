import type { ReactNode } from 'react';
import { Code } from './Flow';

// The app seen through the "React to Full Stack 101" path: which topic lives where, what every feature
// touches, and the questions worth being able to answer. Every statement names code in this repository;
// keep it in step with what it names. Only what is implemented is listed.

export interface PathTopic {
  topic: string;
  where: ReactNode;
}
export interface PathStage {
  id: string;
  title: string;
  goal: string;
  topics: PathTopic[];
}

export const PATH_STAGES: PathStage[] = [
  {
    id: 'request',
    title: '01 · Understand the backend request flow',
    goal: 'How a request travels from the browser through server logic to the data layer.',
    topics: [
      {
        topic: 'Node.js runtime',
        where: (
          <>
            <Code>server.ts</Code> starts the app, runs a background token clean-up, and on SIGTERM
            stops accepting connections, drains, disconnects the database and force-exits after 10
            s. <Code>config/env.ts</Code> validates the environment with Zod, so a bad deploy fails
            at startup.
          </>
        ),
      },
      {
        topic: 'HTTP and REST APIs',
        where: (
          <>
            One router per resource (<Code>/questions</Code>, <Code>/admin/users</Code>…). Methods
            mean something (GET reads, POST creates or acts, PATCH edits, PUT replaces a set, DELETE
            soft-deletes). Statuses are deliberate: 201, 204, 400, 401, 403, 404 (also for “not
            yours to know about”), 409, 413, 429. Every API response carries{' '}
            <Code>X-Request-Id</Code> and <Code>Cache-Control: no-store</Code>.
          </>
        ),
      },
    ],
  },
  {
    id: 'data',
    title: '02 · Work with application data',
    goal: 'Model data, change a database, build CRUD, and list it efficiently.',
    topics: [
      {
        topic: 'PostgreSQL',
        where: (
          <>
            11 tables in <Code>prisma/schema.prisma</Code>: users, departments (<Code>client</Code>
            ), grants, questions, tags, the two many-to-many links, audit events, refresh tokens and
            notifications. Composite primary keys make the grant check a key lookup; a GIN full-text
            index and a trigram index are created in SQL migrations.
          </>
        ),
      },
      {
        topic: 'Prisma ORM',
        where: (
          <>
            Writes go through the Prisma client inside <Code>db.$transaction</Code> so a change and
            its audit row commit together. Reads of the question table are tagged-template raw SQL
            in <Code>question.repo.ts</Code>, because the visibility rule must sit in the same
            statement as search, count and paging. Schema changes are committed SQL migrations,
            applied by a one-shot <Code>migrate</Code> job.
          </>
        ),
      },
      {
        topic: 'CRUD',
        where: (
          <>
            Questions, users, departments, tags and technologies each have create, read, update,
            soft delete and restore. A missing record is always the same path: the lookup returns
            nothing, the service throws <Code>notFound()</Code>, the handler answers 404.
          </>
        ),
      },
      {
        topic: 'Pagination, sorting, filtering',
        where: (
          <>
            Questions: text, tags, department, status and “mine” filters are all in the SQL{' '}
            <Code>WHERE</Code>; relevance order when searching, newest first otherwise, with the id
            as tiebreaker; limit 1 to 50; offset capped at 10,000. Admin lists (users, deleted
            questions, audit) use cursor paging, so deep pages stay fast. Nothing is loaded into
            memory and filtered afterwards.
          </>
        ),
      },
    ],
  },
  {
    id: 'safe',
    title: '03 · Build safe and reliable applications',
    goal: 'Validate input, handle failures, protect functionality and data.',
    topics: [
      {
        topic: 'Validation',
        where: (
          <>
            A Zod <Code>strictObject</Code> beside every route (unknown fields are refused), run by{' '}
            <Code>validateBody</Code>, <Code>validateQuery</Code> and <Code>validateParams</Code>{' '}
            before any logic. Ids must be UUIDs; NUL bytes are rejected globally; the same schemas
            generate the request side of the OpenAPI document.
          </>
        ),
      },
      {
        topic: 'Error handling',
        where: (
          <>
            One <Code>AppError(status, code, message)</Code> and one <Code>errorHandler</Code> in{' '}
            <Code>http/errors.ts</Code>, one JSON shape for every failure. Anything unexpected is
            logged in full with the request id and answered with a bare 500.
          </>
        ),
      },
      {
        topic: 'Authentication',
        where: (
          <>
            Argon2id passwords; a 15-minute access token and a rotating 7-day refresh token, both in
            httpOnly SameSite=Strict cookies; refresh tokens stored hashed and replay-detected;{' '}
            <Code>requireAuth</Code> reloads the user and checks the session on every request. See
            the Sessions tab.
          </>
        ),
      },
      {
        topic: 'Authorization',
        where: (
          <>
            Two questions in order: can you see it (<Code>visible(actor)</Code> in the SQL), then
            may you do this (role and ownership checks in the service). Coarse gates use{' '}
            <Code>requireRole</Code>; a test walks every route and fails the build if one is added
            without being covered. The UI hides buttons for convenience only; the server decides.
          </>
        ),
      },
    ],
  },
  {
    id: 'build',
    title: '04 · The implementation path (Express)',
    goal: 'The same engineering responsibilities, in a framework.',
    topics: [
      {
        topic: 'Routes, services, repositories',
        where: (
          <>
            <Code>routes.ts</Code> parses and validates and calls one service function;{' '}
            <Code>service.ts</Code> holds the rules, transactions, audit and notifications;{' '}
            <Code>*.repo.ts</Code> holds the SQL. <Code>http/app.ts</Code> wires the middleware in a
            fixed order.
          </>
        ),
      },
      {
        topic: 'The engineering flow',
        where: (
          <>
            requirement → validation → authorization → application logic → database → response →
            logging → testing. The Feature by feature tab follows it for the main features, and the
            table below applies it to all of them.
          </>
        ),
      },
      {
        topic: 'A vertical slice',
        where: (
          <>
            Every feature goes from a React screen through an API route and a service to the rows it
            changes, and has a test. “Review a question” is the fullest example: screen, route, row
            lock, three tables, notification, tests, browser test.
          </>
        ),
      },
    ],
  },
  {
    id: 'run',
    title: '05 · Test, observe and run',
    goal: 'Verify changes and investigate behaviour beyond your machine.',
    topics: [
      {
        topic: 'Automated testing',
        where: (
          <>
            Unit, integration (real Postgres, no mocks), attack, property, contract, mutation, UI
            and browser end-to-end tests. Success and failure paths, authorization matrices and
            regression tests for every bug found. See Engineering practices.
          </>
        ),
      },
      {
        topic: 'Structured logging',
        where: (
          <>
            <Code>pino</Code> writes JSON with a server-made request id (also sent back as{' '}
            <Code>X-Request-Id</Code>); cookies and tokens are redacted. To investigate: take the id
            from the response, search the logs for it, then read the matching audit row if it was a
            business action.
          </>
        ),
      },
      {
        topic: 'Docker',
        where: (
          <>
            A multi-stage API image: a <Code>migrate</Code> target (has the Prisma CLI) and a small
            non-root runtime image without it. nginx serves the React build and proxies{' '}
            <Code>/api</Code>. Compose starts the database, then the migrate job, then the API, then
            the web app, each with health checks.
          </>
        ),
      },
    ],
  },
];

export interface FeatureRow {
  feature: string;
  who: string;
  api: string;
  rules: string;
  tables: string;
  proof: string;
}

export const FEATURE_ROWS: FeatureRow[] = [
  {
    feature: 'Sign in',
    who: 'Everyone',
    api: 'POST /auth/login',
    rules:
      'Same 401 for unknown email, wrong password and disabled account; limits per IP and per IP+email; tokens only in cookies.',
    tables: 'app_user (read), refresh_token (insert)',
    proof: 'auth.test, security.auth.test, login.test',
  },
  {
    feature: 'Stay signed in, sign out',
    who: 'Everyone',
    api: 'POST /auth/refresh, /auth/logout',
    rules:
      'Each refresh token works once; replay revokes the session; the browser retries once on 401.',
    tables: 'refresh_token',
    proof: 'auth.test, ops.test',
  },
  {
    feature: 'Search and filter',
    who: 'Everyone',
    api: 'GET /questions',
    rules:
      'Visibility in the same SQL as search, count and paging; strict query schema; offset capped.',
    tables: 'question, question_tag, tag (read)',
    proof: 'visibility.test, security.input.test, E2E who-sees-what',
  },
  {
    feature: 'Open a question, read its history',
    who: 'Everyone',
    api: 'GET /questions/:id, /:id/history',
    rules: 'Hidden is a 404 identical to missing; history only after visibility is confirmed.',
    tables: 'question, audit_event (read)',
    proof: 'visibility.test, security.access.test',
  },
  {
    feature: 'Add a question',
    who: 'Author, Admin',
    api: 'POST /questions',
    rules:
      'Role gate before validation; grant check; tags belong to the department; near-duplicate check under a lock, only against questions you can see.',
    tables: 'question, question_tag, audit_event',
    proof: 'questions.write.test, duplicates.concurrency.test',
  },
  {
    feature: 'Edit a question',
    who: 'Author (own), Admin',
    api: 'PATCH /questions/:id',
    rules:
      'Visibility, then role, then freshness (409 on a stale save), then duplicate check; goes back to review.',
    tables: 'question, question_tag, audit_event',
    proof: 'concurrency.test, questions.write.test',
  },
  {
    feature: 'Approve or reject',
    who: 'Reviewer, Admin',
    api: 'POST /questions/:id/review',
    rules:
      'Row lock; not your own question (Admins excepted); only while pending; a rejection needs a note.',
    tables: 'question, notification, audit_event',
    proof: 'review.test, workflow.test, E2E review workflow',
  },
  {
    feature: 'Delete (withdraw) a question',
    who: 'Admin; Author for their own until approved',
    api: 'DELETE /questions/:id',
    rules:
      'Soft delete under a row lock; approved questions are shared content, so only an Admin removes them.',
    tables: 'question, audit_event',
    proof: 'questions.write.test, admin.manage.test',
  },
  {
    feature: 'Sidebar counts and notifications',
    who: 'Reviewer / Author / everyone',
    api: 'GET /questions/summary, GET /notifications, POST /notifications/read',
    rules:
      'Counts use the same visibility rule; a notification holds ids only, text shown only while you can still see the question.',
    tables: 'question, notification (read), notification (update)',
    proof: 'workflow.test',
  },
  {
    feature: 'Users',
    who: 'Admin',
    api: '/admin/users…',
    rules:
      'Unique email; cannot change or deactivate yourself; last active admin protected inside the transaction; new password or deactivation signs the user out everywhere; restore returns inactive.',
    tables: 'app_user, client_grant, refresh_token, audit_event',
    proof: 'admin.test, admin.manage.test, admin.paging.test',
  },
  {
    feature: 'Departments',
    who: 'Admin',
    api: '/admin/clients…',
    rules:
      'Unique name; impact shown before delete; delete archives technologies only it used; restore brings back exactly those.',
    tables: 'client, tag, client_tag, audit_event',
    proof: 'admin.manage.test, admin.restore.test',
  },
  {
    feature: 'Technologies per department, and “Other”',
    who: 'Admin',
    api: '/admin/clients/:id/technologies…, /admin/technologies…',
    rules:
      'Names matched by a normalised key; URL-safe slug stored; remove unlinks if shared, archives if exclusive.',
    tables: 'tag, client_tag, audit_event',
    proof: 'admin.manage.test, properties.test',
  },
  {
    feature: 'Seniority and type tags',
    who: 'Admin',
    api: '/admin/tag-categories…, /admin/tags/:id…',
    rules:
      'Rename changes the label only; duplicates refused; archived tags stay on old questions.',
    tables: 'tag, audit_event',
    proof: 'admin.tags.test',
  },
  {
    feature: 'Restore deleted questions',
    who: 'Admin',
    api: 'GET /admin/deleted-questions, POST /admin/questions/:id/restore',
    rules: 'Refused while the question’s department is deleted; cursor paging.',
    tables: 'question, audit_event',
    proof: 'admin.manage.test, admin.restore.test',
  },
  {
    feature: 'Audit trail and CSV export',
    who: 'Admin',
    api: 'GET /admin/audit, /admin/audit/export',
    rules:
      'Append-only by a database trigger; export capped at 5,000 rows with spreadsheet-formula defusing.',
    tables: 'audit_event (read)',
    proof: 'audit.viewer.test, audit.immutable.test',
  },
  {
    feature: 'Reference data for filters and forms',
    who: 'Everyone',
    api: 'GET /tags, GET /clients',
    rules: 'Only the departments you hold; technologies limited to them.',
    tables: 'tag, client, client_grant, client_tag (read)',
    proof: 'visibility.test, security.access.test',
  },
];

export interface QA {
  q: string;
  a: ReactNode;
}

export const QUESTIONS: QA[] = [
  {
    q: 'Trace a search from the browser to the database and back.',
    a: 'React asks for /api/questions; the cookie is checked, the user is rate limited, the query is validated, tag names become ids, one SQL statement applies visibility, filters and ranking, a second counts with the same WHERE, and the JSON comes back with the page numbers. Any failure on the way is caught by the single error handler.',
  },
  {
    q: 'Why is visibility in the SQL and not “fetch, then filter”?',
    a: 'Counts, ranking, paging and duplicate warnings would all leak the existence of hidden rows. One predicate is appended to every read of the question table, and a test fails if any other file touches that table.',
  },
  {
    q: 'Why a 404 and not a 403 for a restricted question?',
    a: 'A 403 would confirm the question exists. Hidden and missing look identical, in status, headers and body.',
  },
  {
    q: 'Two reviewers approve the same question at once. What happens?',
    a: 'The question row is locked. The second waits, then sees the first decision and gets 409 NOT_PENDING.',
  },
  {
    q: 'Two authors submit the same question at once?',
    a: 'The duplicate check runs inside the transaction after an advisory lock on the normalised text, so only one passes.',
  },
  {
    q: 'Two people edit the same question. What does the second see?',
    a: 'A 409 EDIT_CONFLICT because the form sends the version it opened; the form offers “Load their version”.',
  },
  {
    q: 'How does a user stay signed in, and what if a refresh token is stolen?',
    a: 'Refresh tokens rotate and work once. Replaying a used one revokes the whole session. Tokens live in httpOnly cookies that JavaScript cannot read, and the access token is only good while its session lives.',
  },
  {
    q: 'Where does validation happen, and why before the business logic?',
    a: 'In a Zod schema in the route chain. Bad input is refused with a 400 before the service or the database is involved.',
  },
  {
    q: 'What does a client see when the server has a bug?',
    a: 'A bare 500 “Internal server error”. The detail goes to the log under the request id, which is also in the X-Request-Id header.',
  },
  {
    q: 'Why Prisma for writes but raw SQL for question reads?',
    a: 'Writes need transactions so a change and its audit row cannot disagree. Reads need one composable WHERE that holds the visibility rule, full-text search and trigram similarity.',
  },
  {
    q: 'How is a list kept fast?',
    a: 'Filtering, sorting and paging are in SQL. Search uses an offset that is capped; the admin lists use cursor paging.',
  },
  {
    q: 'Why soft delete, and is restore safe?',
    a: 'History and authorship stay valid. Restoring a department brings back exactly the technologies its delete archived, not ones an admin archived by hand.',
  },
  {
    q: 'What stops the last admin being removed?',
    a: 'A check inside the transaction, so two admins cannot demote each other at the same moment.',
  },
  {
    q: 'How do you know a new route is not left unprotected?',
    a: 'A test walks a manifest of every route and fails if one is not covered for authentication; another fails if a route is missing from the API document.',
  },
  {
    q: 'How do you know a change is safe to ship?',
    a: 'Tests at every level, mutation testing to prove the tests notice broken code, a contract test against the API document, and browser tests of the main journeys.',
  },
];
