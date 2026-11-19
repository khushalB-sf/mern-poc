// Every technical decision of the application, by area: what was chosen, why, what was rejected and what it
// costs. The long-form versions of the biggest ones are the ADRs in docs/02-technology-selection.md.
// Each statement describes code in this repository: keep it in step with what it names.
// Written for a beginner: short sentences, and jargon is explained the first time it appears.

export interface Decision {
  /** Short title of the decision. */
  title: string;
  /** What was chosen. */
  chosen: string;
  /** The reason. */
  why: string;
  /** What was considered and not chosen. */
  instead: string;
  /** What it costs, honestly. */
  cost: string;
}

export interface DecisionArea {
  id: string;
  title: string;
  intro: string;
  decisions: Decision[];
}

export const DECISION_AREAS: DecisionArea[] = [
  {
    id: 'repo',
    title: 'Repository and tooling',
    intro: 'How the code is laid out and built, before any feature exists.',
    decisions: [
      {
        title: 'One repository, two apps',
        chosen:
          'npm workspaces (a way to keep several apps in one repository): apps/api (Express) and apps/web (React). There is one lockfile, one root ESLint and Prettier config, and one shared tsconfig.base.json.',
        why: 'You install once and get one version of TypeScript and Zod (a library that checks data) for both apps. There is one lint run, and Docker builds from the repo root. The two apps are deployed separately but changed together.',
        instead: 'Two repositories; Turborepo or Nx; a shared packages/ library.',
        cost: 'The API’s response types are written out again by hand in the web app (shared/api/types.ts). A contract test (a test that checks both sides still agree), not shared code, keeps them honest.',
      },
      {
        title: 'Strict TypeScript, with the extra flags',
        chosen:
          'The strictest TypeScript settings everywhere: strict, noUncheckedIndexedAccess, noImplicitOverride and verbatimModuleSyntax. The API uses ES modules with NodeNext resolution.',
        why: 'With noUncheckedIndexedAccess, an array lookup is typed “may be undefined”. This catches the missing-row bug when the code compiles, not in production. verbatimModuleSyntax keeps type imports explicit.',
        instead: 'Loose TypeScript; plain JavaScript; CommonJS.',
        cost: 'More null checks, and .js extensions in relative imports on the API.',
      },
      {
        title: 'Exact dependency versions',
        chosen:
          'Every dependency is pinned to an exact version (no ranges) and committed with the lockfile, the file that records exact versions.',
        why: 'When the project started, the registry’s “latest” Prisma was a release candidate (an unfinished test version). 7.10 was the stable one. A caret range (like ^7.0.0, which allows newer versions) would have installed it silently.',
        instead: 'Caret ranges and periodic updates.',
        cost: 'Upgrades are a deliberate act, not automatic.',
      },
      {
        title: 'Decisions written down before the code',
        chosen:
          'Numbered documents in docs/: requirements, technology selection with ADRs (short written records of a decision), architecture, task plan, progress, security review.',
        why: 'It is cheaper to review a decision, with the options that were rejected, than to rediscover it later. Claims in the docs are corrected against the code, not left to drift.',
        instead: 'Decisions living only in chat and commit messages.',
        cost: 'The documents must be kept in step with the code.',
      },
      {
        title: 'Tests live beside, not inside, source',
        chosen:
          'apps/api/test and apps/web/test mirror the features; browser tests are in apps/web/e2e.',
        why: 'The build never ships tests. An architecture test (a test that checks how the code is organised) can scan src/ without having to skip test code.',
        instead: 'Test files next to each source file.',
        cost: 'A test is one folder away from the code it covers.',
      },
    ],
  },
  {
    id: 'folders',
    title: 'Folder structure',
    intro: 'Why the folders are shaped the way they are.',
    decisions: [
      {
        title: 'API: by feature, with layers inside',
        chosen:
          'src/modules/<feature>/ holds routes.ts, service.ts and (for questions) question.repo.ts. Code used by every feature is in src/http. Config is in src/config and the Prisma setup (the database library) is in src/db, plus seed, docs and types.',
        why: 'A change to “reviews” touches one folder. The layering (route → service → repo) is visible in the file names: the route takes the request, the service holds the rules, the repo talks to the database. Anything shared by every feature (errors, validation, rate limits, CSRF protection) lives in one place. CSRF is a trick where another website makes your browser send a request.',
        instead:
          'By technical type (controllers/, services/, models/), which scatters one feature across four folders.',
        cost: 'Big features outgrow a single file: the admin module was split by resource (users, departments, technologies, tags, audit).',
      },
      {
        title: 'Web: app, features, shared',
        chosen:
          'src/app (shell, routes, error pages), src/features/<feature> (screens, api.ts, hooks.ts, components) and src/shared (ui kit, api client, hooks, lib).',
        why: 'A feature owns its screens, its server calls and its hooks (reusable React logic), so you can read it top to bottom. Only code used by two or more features goes to shared.',
        instead: 'Global components/, hooks/ and pages/ folders, which grow without an owner.',
        cost: 'This needs discipline: a few features reuse another’s small components (for example the tag chips).',
      },
      {
        title: 'One module may read the question table',
        chosen:
          'Only questions/question.repo.ts touches the question and question_tag tables. A test scans src/ and fails if any other file does.',
        why: 'The visibility rule (who may see which question) has to be applied in every read. One file means one place to review.',
        instead: 'A repository per entity; leaving data access to each service.',
        cost: 'A rule kept by a test rather than by the compiler.',
      },
      {
        title: 'Docs, deploy files and scripts at the root',
        chosen:
          'docs/, deploy/ (a Caddyfile for the optional TLS profile; TLS is what makes HTTPS secure), scripts/ (backup and restore), compose.yaml (the Docker Compose file that starts all the services) and .env.example at the repository root.',
        why: 'Operations files are not part of either app, and Compose builds both from the root.',
        instead: 'Hiding them inside apps/.',
        cost: 'A few more top-level entries.',
      },
    ],
  },
  {
    id: 'backend',
    title: 'Backend',
    intro: 'The API: framework, layers, validation, errors, concurrency and operations.',
    decisions: [
      {
        title: 'Express 5 and a separate React app',
        chosen: 'Express 5 API in TypeScript, with a separate Vite single-page app.',
        why: 'The product is an API where most of the work is deciding who may do what. So the middleware pipeline (a fixed chain of steps: authenticate → rate-limit → validate → authorize → service) should be explicit and easy to demonstrate. Express 5 passes a rejected promise to the error handler, so handlers need no try/catch.',
        instead:
          'Next.js (it blurs the line between UI and API, and adds a server-component model nothing here needs); NestJS (heavy for this scope); Fastify.',
        cost: 'Two things to deploy, and the structure is by convention rather than imposed by a framework.',
      },
      {
        title: 'Routes, services and one query module',
        chosen:
          'Thin routes parse and validate the request, then call one service function. Services hold the rules, transactions (groups of changes that all succeed or all fail), audit and notifications. SQL is kept in repo files.',
        why: 'Rules can be tested without HTTP, and SQL is in one place. It is the smallest layering that keeps the security rules in one spot.',
        instead:
          'Fat controllers (route handlers that do everything); a full repository pattern per entity; a DI container (a tool that builds and passes in dependencies for you).',
        cost: 'Only questions has a dedicated repo file; the other modules call Prisma from their service.',
      },
      {
        title: 'Validation first, with strict Zod schemas',
        chosen:
          'A Zod strictObject (a schema that rejects unknown fields) beside every route, run before any logic. Ids must be UUIDs. NUL bytes (an invisible character with code 0) are refused globally.',
        why: 'Bad input is refused cheaply with a 400. Unknown fields are never silently ignored. One schema is the validator, the TypeScript type and the source of the API document.',
        instead:
          'Joi or class-validator (weaker type inference: TypeScript can work out less from them); validating inside handlers.',
        cost: 'Every field has to be declared, even the optional ones.',
      },
      {
        title: 'One error type, one handler',
        chosen:
          'AppError(status, code, message) for anything the client may see, one error handler, one JSON shape. Unknown errors are logged in full and answered with a bare 500.',
        why: 'Clients get predictable failures and never see a stack trace or SQL. The request id (a unique id for each request) ties a user report to a log line.',
        instead: 'Ad-hoc res.status().json() in each handler.',
        cost: 'Error codes are a public contract that has to be maintained.',
      },
      {
        title: 'Configuration validated at startup',
        chosen:
          'config/env.ts parses the environment variables with Zod. The API refuses to start on missing values, equal or too-short secrets, or placeholder secrets while Secure cookies (cookies sent only over HTTPS) are on.',
        why: 'A bad deploy fails immediately and loudly. It does not serve traffic with a weak secret.',
        instead: 'Reading process.env wherever needed.',
        cost: 'A new setting needs a schema entry.',
      },
      {
        title: 'Sign-in with cookies, not tokens in JavaScript',
        chosen:
          'Argon2id (a slow, safe password hash) for passwords. A 15-minute access JWT (a signed token) and a 7-day refresh JWT that is replaced on every use. Both live in httpOnly (JavaScript cannot read them) SameSite=Strict (sent only from this site) cookies. Refresh tokens are stored hashed, and reusing an old one is detected. The access token is tied to its session.',
        why: 'Page scripts can never read a token, so an XSS bug (an attacker running their own script in your page) cannot steal one. Replacing the refresh token on every use turns a stolen one into something the server can detect. Role and active status are read from the database on every request, so changes apply at once.',
        instead:
          'A bearer token in localStorage or memory; server sessions; RS256 keys (they only help when a second service must verify tokens, and there is none); bcrypt.',
        cost: 'One database lookup per request. Parallel refreshes can look like token reuse, which the browser avoids with a single-flight refresh (only one refresh runs at a time). Sign-in is email and password only: two-factor was tried and removed to keep the login simple.',
      },
      {
        title: 'CSRF: three cheap layers',
        chosen:
          'SameSite=Strict cookies (the browser sends them only from this site), a same-origin deployment (the app and API share one address; nginx proxies /api), and an Origin check on every request that changes data.',
        why: 'CSRF is a trick where another website makes your browser send a request. Cookies make it a real concern. With strict same-origin rules these three layers are enough, and there is no CORS (cross-site access setup) to get wrong.',
        instead: 'Double-submit CSRF tokens (more code, no extra safety here).',
        cost: 'The API must be reached through the same origin as the app.',
      },
      {
        title: 'Visibility is decided in the SQL',
        chosen:
          'One predicate (a reusable SQL condition), visible(actor), is added to every question read. It sits in the same statement as the filters, search, count and paging. A hidden question and a missing one both answer 404.',
        why: 'Counts, ranks, paging and duplicate warnings can then never reveal a hidden row.',
        instead:
          'Fetch then filter in code (the exact failure to avoid); Postgres row-level security (the database filters rows itself; deferred, because with connection pooling it needs a setting in every transaction, and its failure mode is silently empty results); an allowed-users array on each question (goes stale).',
        cost: 'A rule kept by discipline and a guard test, not by the database.',
      },
      {
        title: 'Soft delete and a restore for everything',
        chosen:
          'Soft delete (marking a row as deleted instead of removing it): deleted_at on users, departments and questions; archived_at on tags. A delete hides the row, and an admin can restore it. History is never lost.',
        why: 'A mistaken click is one click to undo, and authorship and audit stay valid.',
        instead: 'Hard deletes; cascading deletes.',
        cost: 'Every read has to remember to exclude deleted rows, which is why the rule lives in one predicate.',
      },
      {
        title: 'Transactions, locks and a freshness check',
        chosen:
          'A change, its audit row and any notification commit together, as one transaction (all succeed or all fail). Row locks (making other requests wait for the same row) put two reviewers in a line. An advisory lock (a lock on a key you choose) on the normalised text makes duplicate checks run one after another. An edit sends the version it opened, and a stale save gets 409.',
        why: 'The problems are real (two reviewers, two identical submissions, two editors) and each has the smallest correct fix.',
        instead: 'Hoping it does not happen; a global lock; last write wins.',
        cost: 'The second editor must reapply their change; there is no merge.',
      },
      {
        title: 'Rate limits that cost nothing to run',
        chosen:
          'Rate limits (a cap on how many requests are allowed in a time window) kept in memory: per IP, per IP and email, and per user. REDIS_URL moves the counters to Redis (a shared in-memory store) when there is more than one API process. If Redis is down, the limits stop applying.',
        why: 'One process needs no extra service. Failing open (letting requests through) keeps an outage of the counter store from becoming an outage of the API.',
        instead: 'Redis from day one; limits only in nginx.',
        cost: 'Per-process counters until Redis is configured.',
      },
      {
        title: 'Paging that matches the data',
        chosen:
          'Question search uses limit and offset (“give me N rows, skipping the first M”), with offset capped at 10,000. Admin lists use cursor (keyset) paging: “give me the rows after this one”.',
        why: 'Search is ranked by relevance, which a cursor cannot express simply. The cap stops deep paging from getting slow. Name-ordered admin lists page cheaply by a (name, id) cursor.',
        instead: 'Offset everywhere; cursors everywhere.',
        cost: 'Two paging styles to know.',
      },
      {
        title: 'Logs, probes and metrics',
        chosen:
          'pino JSON logs with a server-made request id and redacted (blanked out) cookies; /health/live and /health/ready; /metrics only behind a bearer token.',
        why: 'A request id lets you find one request in the logs. /health/live (“is the process running?”) never touches the database. /health/ready (“can it do work?”) does. Container platforms ask for both. The metrics endpoint does not exist unless a token is set.',
        instead: 'console.log; one health endpoint; open metrics.',
        cost: 'There is no tracing or error-reporting service.',
      },
      {
        title: 'API document generated from the code',
        chosen:
          'The OpenAPI 3.1 document (a machine-readable description of every endpoint) builds request bodies from the Zod schemas. A test fails if a route is missing, and another checks real responses against it. Swagger UI (a page for trying the API) is off by default in production.',
        why: 'A hand-written document drifts out of date. This one cannot disagree with validation.',
        instead: 'A hand-maintained YAML file; no API document.',
        cost: 'Response schemas are still written by hand, and checked by the contract test.',
      },
      {
        title: 'Housekeeping inside the process',
        chosen:
          'A timer in the API purges (deletes) expired and revoked refresh tokens every six hours.',
        why: 'It is one table and one query. A job queue or a cron service (a scheduler) would be more machinery than the problem needs.',
        instead: 'A scheduler service; a queue.',
        cost: 'It runs in every API process. That is harmless, because the delete is safe to run twice.',
      },
    ],
  },
  {
    id: 'database',
    title: 'Database',
    intro: 'Why Postgres, how the tables are shaped and how they change.',
    decisions: [
      {
        title: 'PostgreSQL only',
        chosen: 'One PostgreSQL 17 database. No cache, no search engine.',
        why: 'The product needs many-to-many tags, an audit trail written in the same transaction, filter plus keyword plus similarity search inside the database, and an access rule that no second service can bypass. Postgres does all five. A separate search engine would hold its own copy of the permissions, and every sync gap is a leak.',
        instead:
          'MongoDB (no trigram similarity, which finds near-matching text; manual integrity checks; a lookup per permission check); Postgres plus Elasticsearch.',
        cost: 'Full-text search is plainer than in a dedicated engine. That is fine at thousands of rows.',
      },
      {
        title: 'Prisma for the schema and writes, raw SQL for reads',
        chosen:
          'Prisma 7 (a library that lets code talk to the database) for models, migrations (versioned database changes) and writes inside transactions. Question reads use parameterised $queryRaw tagged templates (raw SQL where the values are passed separately).',
        why: 'Prisma’s query API cannot express a text-search match, a similarity score, or a “does a matching row exist?” check (EXISTS) per tag category with an ANY list. Tagged templates bind every value, so they are safe from SQL injection (an attacker sneaking SQL into input). The unsafe variants are banned by a lint rule.',
        instead:
          'Forcing the hard query through Prisma’s query API; adding Kysely or Knex as a second data-access tool.',
        cost: 'Raw SQL loses compile-time column checks, which is why it is confined to one module and tested on a real database.',
      },
      {
        title: 'Migrations are committed SQL',
        chosen:
          'Hand-reviewed SQL files in prisma/migrations, applied with migrate deploy by a one-shot job (it runs once and exits) before the API starts.',
        why: 'What runs in production is exactly what was reviewed. A new enum value (one more allowed choice in a fixed list) is added in its own statement, because Postgres cannot use it in the same transaction.',
        instead: 'Pushing the schema without migrations; migrating on API start.',
        cost: 'Some changes (indexes, which are lookup structures that speed up queries; triggers; enums) are written by hand.',
      },
      {
        title: 'Search indexes on expressions, not generated columns',
        chosen:
          'Two GIN indexes (lookup structures that make text search fast) on expressions: full-text (title weighted over notes) and trigram (matching on three-letter chunks, so near-matches are found) on normalised text. Queries repeat the exact expression to use them.',
        why: 'A spike (a quick experiment) showed that generated columns (columns Postgres fills in from other columns) make Prisma want to drop the search setup on the next migration. Expression indexes cause no such drift.',
        instead:
          'Stored generated columns; a separate tsvector column (pre-processed search text) kept up to date by a trigger.',
        cost: 'The expressions live as two constants that must match the migration character for character.',
      },
      {
        title: 'Tags: category, tag and a link table',
        chosen:
          'tag_category, tag (unique per category and value) and question_tag (the link table between questions and tags). A filter is one “does a matching row exist?” check (EXISTS) per selected category: OR inside a category, AND across categories.',
        why: 'Tags are shared records that keep database integrity, and can be renamed and archived. Every lookup is a key or reverse-index hit.',
        instead:
          'An array column with a GIN index (no foreign keys, drifts on rename); JSONB (JSON stored in a column); entity-attribute-value; one table per category.',
        cost: 'The query has several EXISTS clauses, each one checking whether a matching row exists. Arrays would only win at far larger scale.',
      },
      {
        title: 'Composite keys on link tables',
        chosen:
          'department_grant, department_tag and question_tag use their two foreign keys together as the primary key (a composite key), with a reverse index where needed.',
        why: 'The primary key is the lookup the queries need. There is no meaningless id column, and a duplicate link is impossible.',
        instead: 'A surrogate id on every link row.',
        cost: 'Composite keys are slightly more awkward in an ORM (a library that lets code talk to the database).',
      },
      {
        title: 'UUID keys, timestamptz times',
        chosen:
          'Every table uses UUID primary keys (long random ids), and every moment is a timestamptz (a time stored with its time zone).',
        why: 'Ids appear in URLs, so they must not be guessable or countable. Time zones are stored explicitly rather than assumed.',
        instead: 'Auto-increment integers; timestamps without time zone.',
        cost: 'Larger indexes and unreadable ids when debugging.',
      },
      {
        title: 'Nothing cascades',
        chosen:
          'Every foreign key is ON DELETE RESTRICT (the database refuses to delete a row that other rows still point to). Only a user’s notifications go with the user.',
        why: 'Together with soft delete, this means no stray DELETE can silently remove history. A real delete fails loudly instead.',
        instead: 'ON DELETE CASCADE (deleting a row also deletes every row that points to it).',
        cost: 'A true purge needs deliberate, ordered deletes.',
      },
      {
        title: 'The database says department; the API still says client',
        chosen:
          'The tables (department, department_grant, department_tag), the Prisma models and the server code say department. The public API (the /clients paths, clientId fields and audit event names) still says client, so callers and old audit rows are unaffected.',
        why: 'The interface and docs always said department, so the database now matches them. Renaming the API as well would break every caller and rewrite history for no behaviour gain.',
        instead: 'Renaming the API too, or leaving the table called client.',
        cost: 'Two words for one thing at the API boundary, explained in a glossary.',
      },
      {
        title: 'A question’s department never changes',
        chosen:
          'department_id is set when the question is created and cannot be edited. A null value (no department) means global.',
        why: 'Moving a question between departments would change who can see it, a leak waiting to happen. Editing would also need a grant check (does the user hold that department?) on both sides.',
        instead: 'An editable department.',
        cost: 'A wrongly filed question has to be re-added.',
      },
      {
        title: 'No unique constraint on question text',
        chosen:
          'Duplicates are a soft rule: a trigram similarity (a score for how alike two texts are) of 0.6 or more, among questions the submitter can see, asks the author to confirm.',
        why: 'A unique constraint would reveal that a hidden question with the same text exists. A soft rule also lets near-duplicates through when someone insists, and records that they did.',
        instead:
          'A unique index; exact-match only; embeddings (an AI model and pgvector, a lot of extra work for little gain).',
        cost: 'Paraphrases are missed and different questions can be flagged; the override exists for that.',
      },
      {
        title: 'One append-only audit table',
        chosen:
          'audit_event (type, actor, time, optional question, JSONB payload), written in the same transaction as the change. A trigger (code the database runs by itself) protects it by refusing UPDATE and DELETE.',
        why: 'One mechanism covers history, admin actions and rejected duplicates. The trigger protects the record from the application’s own bugs and from a stolen session.',
        instead:
          'A history table per entity; database triggers that write the audit (no actor); event sourcing (storing every change as an event and rebuilding the state from them).',
        cost: 'The payload is only loosely typed. A mistaken event can be followed by another event but not corrected.',
      },
      {
        title: 'Enums for roles, status and event types',
        chosen:
          'Postgres enum types (a fixed list of allowed values) for role, question status, notification type and audit type.',
        why: 'The database itself refuses a role or status that does not exist.',
        instead: 'Free-text columns with application checks; lookup tables.',
        cost: 'Adding a value is a migration.',
      },
      {
        title: 'Archive coupling for technologies',
        chosen:
          'A tag archived because its department was deleted records archived_by_department_id, so restoring the department brings back exactly those technologies.',
        why: 'Delete and restore of a department must be exact opposites, without touching a technology an admin archived by hand.',
        instead: 'Un-archiving everything the department used.',
        cost: 'One more column to maintain.',
      },
      {
        title: 'Hashed tokens and loose notification links',
        chosen:
          'Refresh tokens are stored as SHA-256 hashes (a one-way scramble) with a family id (one id shared by all tokens from one sign-in). A notification stores ids only, and its question_id is deliberately not a foreign key.',
        why: 'A database leak must not hand out live tokens. A notification must survive the later deletion or hiding of its question, and must never carry restricted text.',
        instead: 'Plain-text tokens; a foreign key from notification to question.',
        cost: 'The notification’s question is looked up when shown, and only if you can still see it.',
      },
      {
        title: 'Deterministic seed and a bootstrap admin',
        chosen:
          'A seeded pseudo-random generator (it gives the same “random” numbers every time) produces the same demo questions every run. A real deployment creates its first admin from ADMIN_EMAIL and ADMIN_PASSWORD instead of a demo account.',
        why: 'Demos and tests are repeatable, and no password is published for a real system.',
        instead: 'A faker library; shipping a demo admin.',
        cost: 'The generated text is plainer than real questions.',
      },
      {
        title: 'Statement timeout',
        chosen:
          'Every connection aborts a statement that runs longer than DB_STATEMENT_TIMEOUT_MS.',
        why: 'One extremely slow query cannot hold a database connection forever.',
        instead: 'No limit.',
        cost: 'A legitimately slow query fails and has to be tuned.',
      },
    ],
  },
  {
    id: 'frontend',
    title: 'Frontend',
    intro: 'The browser app: framework, state, styling, routing and accessibility.',
    decisions: [
      {
        title: 'React 19 and Vite, no meta-framework',
        chosen:
          'A single-page app (one HTML page where JavaScript swaps the screens) built with Vite and React 19, served as static files.',
        why: 'There is no need for server rendering (building the HTML on the server), and the API is separate. Static files are the simplest thing to serve and cache.',
        instead: 'Next.js (see the backend decision).',
        cost: 'The first paint waits for JavaScript. Route splitting (loading each page’s code only when needed) keeps that small.',
      },
      {
        title: 'TanStack Query owns server state',
        chosen:
          'All data from the API lives in TanStack Query (a library that fetches and caches server data). “Who am I” is one query (auth/me), and everything else reads from it. There is no Redux or Zustand.',
        why: 'The only real state is server state (data that belongs to the server). The library already does caching, retries, de-duplication and refetching. State that only the browser needs stays local to the component.',
        instead: 'Redux or Zustand; React context for everything.',
        cost: 'Cache keys need care, and a change must invalidate the right ones (mark them out of date so they reload).',
      },
      {
        title: 'The address bar holds the filters',
        chosen:
          'Search text, tags, department, status and page live in the URL query string (the part after the ?). A page reads it and writes it back.',
        why: 'A search can be bookmarked, shared and reached with the Back button. The state cannot disagree with the address.',
        instead: 'Component state or a store.',
        cost: 'Parsing and serialising code (turning the state into URL text and back). It is covered by a round-trip property test, which checks many generated inputs survive the trip.',
      },
      {
        title: 'Forms: React Hook Form with Zod',
        chosen:
          'Forms use React Hook Form (a form library) with a Zod schema that mirrors the server’s rules. The server stays the authority, and its errors are shown on the field.',
        why: 'People get instant feedback without a round trip, and the validation logic is not written out twice by hand.',
        instead: 'Controlled inputs by hand; a form library with its own schema language.',
        cost: 'The client rules can fall behind the server’s, which is why the server always re-checks.',
      },
      {
        title: 'Our own small UI kit on native elements',
        chosen:
          'Button, Dialog, Field, DataTable and friends in shared/ui, built on native dialog, details, select and form controls, and styled with Tailwind v4 (a CSS utility library).',
        why: 'About a dozen screens do not justify a component library. Native elements bring focus trapping (keyboard focus stays inside a dialog), Escape, keyboard handling and screen-reader semantics for free.',
        instead: 'MUI or shadcn (weight and a look to fight); building custom widgets.',
        cost: 'Every shared pattern has to be built once.',
      },
      {
        title: 'Design tokens as CSS variables',
        chosen:
          'Colours, surfaces and states are CSS variables mapped to Tailwind tokens. A dark theme is switched by the operating system setting.',
        why: 'A change of palette is one file, dark mode needs no component changes, and state colours (danger, pending, restricted) mean the same everywhere.',
        instead: 'Hard-coded colours; a theme provider in JavaScript.',
        cost: 'Contrast (how readable text is against its background) must be checked in both themes, which the browser tests do.',
      },
      {
        title: 'One page pattern',
        chosen:
          'Every screen uses Page and PageHeader. Admin lists add a Toolbar (search, filters, count) and one DataTable, with one Add button in the header.',
        why: 'People learn one screen and know them all, and the title sits in the same place everywhere.',
        instead: 'Each page styled on its own.',
        cost: 'A page that needs something different has to justify leaving the pattern.',
      },
      {
        title: 'Routing and code splitting',
        chosen:
          'React Router with a route table. The shell, sign-in and question list are in the first download. Every other page loads when it is first visited (code splitting).',
        why: 'The first paint should not pay for the admin screens, the editor or the long How-it-works page. Splitting cut the main file from 679 kB to 498 kB.',
        instead: 'One bundle.',
        cost: 'A short wait the first time a page opens.',
      },
      {
        title: 'A fetch wrapper, not Axios',
        chosen:
          'A small wrapper around fetch: same-origin credentials (cookies are sent automatically), one automatic refresh on a 401, and a retry. The refresh is single-flight (parallel calls share one refresh) and uses a Web Lock (a browser lock) across tabs. Nothing is written to browser storage.',
        why: 'Refresh tokens are replaced on every use, so two parallel refreshes would sign the person out. A single-flight refresh prevents that, and no token ever exists in JavaScript.',
        instead: 'Axios with interceptors; tokens in localStorage.',
        cost: 'About sixty lines of code to own.',
      },
      {
        title: 'Handling the slow and the wrong',
        chosen:
          'Search waits 300 ms after typing and keeps the previous results on screen while the next ones load. Lists show skeletons (grey placeholders), empty states with a way out, and error states with a retry. Conflicts and duplicates use dialogs that explain what happened.',
        why: 'The interface should never flash, go blank or leave someone guessing why something failed.',
        instead: 'Spinners and generic error toasts.',
        cost: 'More states to design and test for each screen.',
      },
      {
        title: 'Accessibility as a build constraint',
        chosen:
          'Semantic elements (HTML tags that say what they are), visible focus, keyboard-operable filters, labels tied to controls, and axe checks (an automatic accessibility scan) both in unit tests and in a real browser (including colour contrast).',
        why: 'It is cheaper to build in than to retrofit. The real-browser scan has caught problems that jsdom (a fake browser used in tests) cannot: a select’s accessible name, and sideways-scrolling regions that could not be focused.',
        instead: 'A manual audit at the end.',
        cost: 'Some designs are simpler than they could be.',
      },
    ],
  },
  {
    id: 'delivery',
    title: 'Delivery, testing and operations',
    intro: 'How the system is packaged, started, checked and watched.',
    decisions: [
      {
        title: 'Compose with a separate migrate job',
        chosen:
          'docker compose runs db, a one-shot migrate job, the API and the web app, each with health checks. The API starts only after migrate succeeds.',
        why: 'Migrations and the first admin are applied once, before any traffic. The API image then needs no Prisma CLI.',
        instead: 'Migrating inside the API start script.',
        cost: 'One more service to understand.',
      },
      {
        title: 'nginx in front, one origin',
        chosen:
          'nginx (a web server) serves the built app and proxies /api to the API (passes those requests on), so the browser sees a single origin. The database and API ports are bound to the loopback address only, so only this machine can reach them.',
        why: 'A single origin is what makes SameSite=Strict cookies work and removes CORS. Binding the ports keeps the database off the network.',
        instead: 'The browser calling the API directly across origins.',
        cost: 'The API depends on the proxy’s forwarded address (the real client address the proxy passes on). The trusted-proxy hop count is configurable.',
      },
      {
        title: 'Small, non-root images, Debian not Alpine',
        chosen:
          'Multi-stage builds on node:22-bookworm-slim run as the non-root node user (a user without admin rights). The web image is nginx-unprivileged.',
        why: 'The password hashing library has a native part (compiled code), which behaves better on Debian than on musl (the C library Alpine uses). Non-root limits what a compromised process can do.',
        instead: 'Alpine; running as root; one big image.',
        cost: 'A somewhat larger image than Alpine.',
      },
      {
        title: 'Optional TLS and shared limits, off by default',
        chosen:
          'A Compose profile adds Caddy for HTTPS and HSTS (a header that tells browsers to always use HTTPS). REDIS_URL turns on shared rate limits, and METRICS_TOKEN turns on metrics.',
        why: 'The simplest setup should work with docker compose up, and each production concern should be one setting away rather than built in.',
        instead: 'Building every concern into the default.',
        cost: 'Production needs a short checklist of settings.',
      },
      {
        title: 'Tests on a real database, no mocks',
        chosen:
          'API tests run the real Express app against a real Postgres, in an isolated database that the suite creates, migrates and truncates (empties). Files run one at a time.',
        why: 'A mock (a fake stand-in) cannot prove that a SQL condition works. Running files one at a time avoids flaky failures from shared state.',
        instead: 'Mocked repositories; an in-memory database.',
        cost: 'The suite needs Postgres, and takes about a minute.',
      },
      {
        title: 'Tests that guard the design',
        chosen:
          'A route sweep fails if a route is not covered for authentication. An architecture guard fails if anything but one module reads the question table. A contract test compares responses to the API document. An attack suite tries to break access, input and headers.',
        why: 'The rules that matter most are the ones a future change could quietly break.',
        instead: 'Relying on code review.',
        cost: 'More tests to maintain, and each guard must itself be proven to fail when it should.',
      },
      {
        title: 'Test the tests',
        chosen:
          'Property tests (they check thousands of generated inputs) for the small pure helper functions (no side effects). Mutation testing (Stryker, which breaks the code on purpose to see whether tests fail) on them. Browser tests of the main journeys on their own database and ports.',
        why: 'Example tests only cover the examples someone thought of. Mutation testing shows whether the tests notice a broken line.',
        instead: 'Coverage numbers alone.',
        cost: 'Slower, optional runs kept out of the default loop.',
      },
      {
        title: 'Test-first for security fixes',
        chosen:
          'For each risk, the test is written first and asserts the secure behaviour. A failing test is a finding. The smallest fix turns it green, and the test stays.',
        why: 'It proves the hole existed and that the fix closes it.',
        instead: 'Fixing by reading code.',
        cost: 'Some effort before any visible change.',
      },
      {
        title: 'A continuous-integration workflow',
        chosen:
          'A GitHub Actions workflow (an automatic pipeline) runs lint, type-check, formatting, both test suites, builds, a dependency audit and the browser tests. It has been checked command by command locally but has not run on GitHub yet.',
        why: 'The checks should run on every change without anyone remembering to.',
        instead: 'Running checks by hand.',
        cost: 'Not yet proven in the hosted environment.',
      },
    ],
  },
];
