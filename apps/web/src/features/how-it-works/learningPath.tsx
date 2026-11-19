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
    goal: 'How a request travels from the browser, through the server logic, to the data layer (where the data is stored).',
    topics: [
      {
        topic: 'Node.js runtime',
        where: (
          <>
            <Code>server.ts</Code> starts the app and runs a background clean-up of old tokens. On
            SIGTERM (the signal that asks a program to stop) it stops accepting connections,
            finishes the requests in progress (“drains”), disconnects the database and force-exits
            after 10 s. <Code>config/env.ts</Code> checks the environment variables with Zod (a
            library that checks data), so a bad deploy fails at startup.
          </>
        ),
      },
      {
        topic: 'HTTP and REST APIs',
        where: (
          <>
            One router per resource (<Code>/questions</Code>, <Code>/admin/users</Code>…). Each
            method means something: GET reads, POST creates or acts, PATCH edits, PUT replaces a
            set, DELETE soft-deletes (marks a row as deleted instead of removing it). Statuses are
            deliberate: 201, 204, 400, 401, 403, 404 (also used for “not yours to know about”), 409,
            413, 429. Every API response carries <Code>X-Request-Id</Code> (a unique id for the
            request) and <Code>Cache-Control: no-store</Code> (do not cache it).
          </>
        ),
      },
    ],
  },
  {
    id: 'data',
    title: '02 · Work with application data',
    goal: 'Model data, change a database, build CRUD (create, read, update, delete), and list it efficiently.',
    topics: [
      {
        topic: 'PostgreSQL',
        where: (
          <>
            11 tables in <Code>prisma/schema.prisma</Code>: users, departments (
            <Code>department</Code>, called <Code>client</Code> in the API), grants, questions,
            tags, the two many-to-many links, audit events, refresh tokens and notifications.
            Composite primary keys (a key made of two columns) make the grant check a key lookup. A
            GIN full-text index and a trigram index (lookup structures that make text search fast)
            are created in SQL migrations.
          </>
        ),
      },
      {
        topic: 'Prisma ORM',
        where: (
          <>
            Prisma is a library that lets code talk to the database. Writes go through the Prisma
            client inside <Code>db.$transaction</Code> (a group of changes that all succeed or all
            fail), so a change and its audit row commit together. Reads of the question table are
            tagged-template raw SQL (SQL where the values are passed separately) in{' '}
            <Code>question.repo.ts</Code>, because the visibility rule must sit in the same
            statement as search, count and paging. Schema changes are committed SQL migrations,
            applied by a one-shot <Code>migrate</Code> job (it runs once and exits).
          </>
        ),
      },
      {
        topic: 'CRUD',
        where: (
          <>
            CRUD means create, read, update, delete. Questions, users, departments, tags and
            technologies each have create, read, update, soft delete and restore. A missing record
            always follows the same path: the lookup returns nothing, the service throws{' '}
            <Code>notFound()</Code>, and the handler answers 404.
          </>
        ),
      },
      {
        topic: 'Pagination, sorting, filtering',
        where: (
          <>
            Questions: the text, tags, department, status and “mine” filters are all in the SQL{' '}
            <Code>WHERE</Code>. Results are in relevance order when searching and newest first
            otherwise, with the id as tiebreaker (it settles ties). The limit is 1 to 50, and the
            offset is capped at 10,000. Admin lists (users, deleted questions, audit) use cursor
            paging (“give me the rows after this one”), so deep pages stay fast. Nothing is loaded
            into memory and filtered afterwards.
          </>
        ),
      },
    ],
  },
  {
    id: 'safe',
    title: '03 · Build safe and reliable applications',
    goal: 'Check input, handle failures, and protect features and data.',
    topics: [
      {
        topic: 'Validation',
        where: (
          <>
            A Zod <Code>strictObject</Code> beside every route (unknown fields are refused), run by{' '}
            <Code>validateBody</Code>, <Code>validateQuery</Code> and <Code>validateParams</Code>{' '}
            before any logic. Ids must be UUIDs. NUL bytes (an invisible character with code 0) are
            rejected globally. The same schemas generate the request side of the OpenAPI document (a
            machine-readable description of the API).
          </>
        ),
      },
      {
        topic: 'Error handling',
        where: (
          <>
            One <Code>AppError(status, code, message)</Code> and one <Code>errorHandler</Code> in{' '}
            <Code>http/errors.ts</Code>, so every failure has the same JSON shape. Anything
            unexpected is logged in full with the request id and answered with a bare 500 (a plain
            error with no details).
          </>
        ),
      },
      {
        topic: 'Authentication',
        where: (
          <>
            Passwords use Argon2id (a slow, safe password hash). A 15-minute access token and a
            7-day refresh token (replaced on every use) both live in httpOnly (JavaScript cannot
            read them) SameSite=Strict (sent only from this site) cookies. Refresh tokens are stored
            hashed, and reusing an old one is detected. <Code>requireAuth</Code> reloads the user
            and checks the session on every request. See the Sessions tab.
          </>
        ),
      },
      {
        topic: 'Authorization',
        where: (
          <>
            Two questions, in order. First, can you see it? (<Code>visible(actor)</Code> in the
            SQL.) Then, may you do this? (Role and ownership checks in the service.) Broad gates use{' '}
            <Code>requireRole</Code>. A test walks every route and fails the build if one is added
            without being covered. The UI hides buttons for convenience only; the server decides.
          </>
        ),
      },
    ],
  },
  {
    id: 'build',
    title: '04 · The implementation path (Express)',
    goal: 'The same engineering jobs, done inside a framework (Express).',
    topics: [
      {
        topic: 'Routes, services, repositories',
        where: (
          <>
            <Code>routes.ts</Code> parses and validates the request, then calls one service
            function. <Code>service.ts</Code> holds the rules, transactions, audit and
            notifications. <Code>*.repo.ts</Code> holds the SQL. <Code>http/app.ts</Code> connects
            the middleware (steps that run on every request) in a fixed order.
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
            A vertical slice is one feature built through every layer. Every feature goes from a
            React screen through an API route and a service to the rows it changes, and has a test.
            “Review a question” is the fullest example: screen, route, row lock (making other
            requests wait for the same row), three tables, notification, tests, browser test.
          </>
        ),
      },
    ],
  },
  {
    id: 'run',
    title: '05 · Test, observe and run',
    goal: 'Check that changes work, and find out what the app does outside your own machine.',
    topics: [
      {
        topic: 'Automated testing',
        where: (
          <>
            Unit, integration (real Postgres, no mocks), attack, property, contract, mutation, UI
            and browser end-to-end tests. They cover success and failure paths and authorization
            matrices (tables of who may do what). Every bug found gets a regression test, which
            stops that bug coming back.
          </>
        ),
      },
      {
        topic: 'Structured logging',
        where: (
          <>
            <Code>pino</Code> writes JSON logs with a server-made request id (also sent back as{' '}
            <Code>X-Request-Id</Code>). Cookies and tokens are redacted (blanked out). To
            investigate: take the id from the response, search the logs for it, then read the
            matching audit row if it was a business action.
          </>
        ),
      },
      {
        topic: 'Docker',
        where: (
          <>
            A multi-stage API image (built in steps, so the final image stays small): a{' '}
            <Code>migrate</Code> target (has the Prisma CLI) and a small non-root runtime image
            without it. nginx serves the React build and proxies <Code>/api</Code> (passes those
            requests on to the API). Compose starts the database, then the migrate job, then the
            API, then the web app, each with health checks.
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
      'The same 401 for an unknown email, a wrong password and a disabled account. Limits per IP and per IP+email. Tokens only in cookies.',
    tables: 'app_user (read), refresh_token (insert)',
    proof: 'auth.test, security.auth.test, login.test',
  },
  {
    feature: 'Stay signed in, sign out',
    who: 'Everyone',
    api: 'POST /auth/refresh, /auth/logout',
    rules:
      'Each refresh token works once. Reusing an old one revokes the session. The browser retries once on 401.',
    tables: 'refresh_token',
    proof: 'auth.test, ops.test',
  },
  {
    feature: 'Search and filter',
    who: 'Everyone',
    api: 'GET /questions',
    rules:
      'Visibility is applied in the same SQL as search, count and paging. The query schema is strict (unknown fields are refused). The offset is capped.',
    tables: 'question, question_tag, tag (read)',
    proof: 'visibility.test, security.input.test, E2E who-sees-what',
  },
  {
    feature: 'Open a question, read its history',
    who: 'Everyone',
    api: 'GET /questions/:id, /:id/history',
    rules:
      'A hidden question gives a 404 identical to a missing one. History is shown only after visibility is confirmed.',
    tables: 'question, audit_event (read)',
    proof: 'visibility.test, security.access.test',
  },
  {
    feature: 'Add a question',
    who: 'Author, Admin',
    api: 'POST /questions',
    rules:
      'The role check runs before validation. Grant check (does the user hold the department?). Tags must belong to the department. The near-duplicate check runs under a lock, and only against questions you can see.',
    tables: 'question, question_tag, audit_event',
    proof: 'questions.write.test, duplicates.concurrency.test',
  },
  {
    feature: 'Edit a question',
    who: 'Author (own), Admin',
    api: 'PATCH /questions/:id',
    rules:
      'Checks run in this order: visibility, role, freshness (409 on a stale save), then the duplicate check. The question goes back to review.',
    tables: 'question, question_tag, audit_event',
    proof: 'concurrency.test, questions.write.test',
  },
  {
    feature: 'Approve or reject',
    who: 'Reviewer, Admin',
    api: 'POST /questions/:id/review',
    rules:
      'Row lock (other requests wait for the same row). Not your own question (Admins excepted). Only while pending. A rejection needs a note.',
    tables: 'question, notification, audit_event',
    proof: 'review.test, workflow.test, E2E review workflow',
  },
  {
    feature: 'Delete (withdraw) a question',
    who: 'Admin; Author for their own until approved',
    api: 'DELETE /questions/:id',
    rules:
      'Soft delete (marked as deleted, not removed) under a row lock. Approved questions are shared content, so only an Admin removes them.',
    tables: 'question, audit_event',
    proof: 'questions.write.test, admin.manage.test',
  },
  {
    feature: 'Sidebar counts and notifications',
    who: 'Reviewer / Author / everyone',
    api: 'GET /questions/summary, GET /notifications, POST /notifications/read',
    rules:
      'Counts use the same visibility rule. A notification holds ids only, and its text is shown only while you can still see the question.',
    tables: 'question, notification (read), notification (update)',
    proof: 'workflow.test',
  },
  {
    feature: 'Users',
    who: 'Admin',
    api: '/admin/users…',
    rules:
      'Unique email. You cannot change or deactivate yourself. The last active admin is protected inside the transaction (a group of changes that all succeed or all fail). A new password or a deactivation signs the user out everywhere. A restored user comes back inactive.',
    tables: 'app_user, department_grant, refresh_token, audit_event',
    proof: 'admin.test, admin.manage.test, admin.paging.test',
  },
  {
    feature: 'Departments',
    who: 'Admin',
    api: '/admin/clients…',
    rules:
      'Unique name. The impact is shown before a delete. A delete archives the technologies only this department used. A restore brings back exactly those.',
    tables: 'department, tag, department_tag, audit_event',
    proof: 'admin.manage.test, admin.restore.test',
  },
  {
    feature: 'Technologies per department, and “Other”',
    who: 'Admin',
    api: '/admin/clients/:id/technologies…, /admin/technologies…',
    rules:
      'Names are matched by a normalised key (a cleaned-up form of the name). A URL-safe slug is stored. Removing a technology unlinks it if it is shared, and archives it if only one department uses it.',
    tables: 'tag, department_tag, audit_event',
    proof: 'admin.manage.test, properties.test',
  },
  {
    feature: 'Seniority and type tags',
    who: 'Admin',
    api: '/admin/tag-categories…, /admin/tags/:id…',
    rules:
      'A rename changes the label only. Duplicates are refused. Archived tags stay on old questions.',
    tables: 'tag, audit_event',
    proof: 'admin.tags.test',
  },
  {
    feature: 'Restore deleted questions',
    who: 'Admin',
    api: 'GET /admin/deleted-questions, POST /admin/questions/:id/restore',
    rules:
      'Refused while the question’s department is deleted. Uses cursor paging (“the rows after this one”).',
    tables: 'question, audit_event',
    proof: 'admin.manage.test, admin.restore.test',
  },
  {
    feature: 'Audit trail and CSV export',
    who: 'Admin',
    api: 'GET /admin/audit, /admin/audit/export',
    rules:
      'Append-only, enforced by a database trigger (code the database runs by itself). The export is capped at 5,000 rows, and cells that could run as spreadsheet formulas are defused.',
    tables: 'audit_event (read)',
    proof: 'audit.viewer.test, audit.immutable.test',
  },
  {
    feature: 'Reference data for filters and forms',
    who: 'Everyone',
    api: 'GET /tags, GET /clients',
    rules: 'Only the departments you hold. Technologies are limited to those departments.',
    tables: 'tag, department, department_grant, department_tag (read)',
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
    a: 'React asks for /api/questions. The cookie is checked, the user is rate limited (capped on requests), the query is validated, and tag names become ids. One SQL statement applies visibility, filters and ranking. A second counts with the same WHERE. The JSON comes back with the page numbers. Any failure on the way is caught by the single error handler.',
  },
  {
    q: 'Why is visibility in the SQL and not “fetch, then filter”?',
    a: 'Counts, ranking, paging and duplicate warnings would all leak the existence of hidden rows. One predicate (a reusable SQL condition) is added to every read of the question table. A test fails if any other file touches that table.',
  },
  {
    q: 'Why a 404 and not a 403 for a restricted question?',
    a: 'A 403 (forbidden) would confirm the question exists. Hidden and missing look identical, in status, headers and body.',
  },
  {
    q: 'Two reviewers approve the same question at once. What happens?',
    a: 'The question row is locked, so the second request waits. It then sees the first decision and gets 409 NOT_PENDING.',
  },
  {
    q: 'Two authors submit the same question at once?',
    a: 'The duplicate check runs inside a transaction (a group of changes that all succeed or all fail), after an advisory lock (a lock on a key you choose) on the normalised text. So only one passes.',
  },
  {
    q: 'Two people edit the same question. What does the second see?',
    a: 'A 409 EDIT_CONFLICT, because the form sends the version it opened. The form offers “Load their version”.',
  },
  {
    q: 'How does a user stay signed in, and what if a refresh token is stolen?',
    a: 'Refresh tokens are replaced on every use and work only once. Replaying a used one revokes the whole session. Tokens live in httpOnly cookies that JavaScript cannot read. The access token is only good while its session lives.',
  },
  {
    q: 'Where does validation happen, and why before the business logic?',
    a: 'In a Zod schema (a library that checks data) in the route chain. Bad input is refused with a 400 before the service or the database is involved.',
  },
  {
    q: 'What does a client see when the server has a bug?',
    a: 'A plain 500 “Internal server error” with no details. The details go to the log under the request id, which is also in the X-Request-Id header.',
  },
  {
    q: 'Why Prisma for writes but raw SQL for question reads?',
    a: 'Writes need transactions, so a change and its audit row cannot disagree. Reads need one WHERE that holds the visibility rule, full-text search and trigram similarity (a score for how alike two texts are).',
  },
  {
    q: 'How is a list kept fast?',
    a: 'Filtering, sorting and paging are done in SQL. Search uses an offset (skip the first N rows) that is capped. The admin lists use cursor paging (continue after the last row seen).',
  },
  {
    q: 'Why soft delete, and is restore safe?',
    a: 'Soft delete marks a row as deleted instead of removing it. History and authorship stay valid. Restoring a department brings back exactly the technologies its delete archived, not ones an admin archived by hand.',
  },
  {
    q: 'What stops the last admin being removed?',
    a: 'A check inside the transaction, so two admins cannot demote each other at the same moment.',
  },
  {
    q: 'How do you know a new route is not left unprotected?',
    a: 'A test walks a list of every route and fails if one is not covered for authentication. Another test fails if a route is missing from the API document.',
  },
  {
    q: 'How do you know a change is safe to ship?',
    a: 'Tests at every level. Mutation testing (breaking the code on purpose) proves the tests notice broken code. A contract test checks responses against the API document. Browser tests cover the main journeys.',
  },
];
