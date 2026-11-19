# POC walkthrough, mapped to "React to Full Stack: 101"

This explains **every functionality of the Interview Question Bank** using the structure of the *React to Full Stack 101* learning path: its five stages (request flow, data, safety, implementation path, test/observe/run) and its "engineering flow":

> requirement → validation → authorization → application logic → database → response → logging → testing

Part A answers "what problem does this solve". Part B maps each topic of the path to where it lives in this code. Part C walks **each feature** through the flow above, one vertical slice at a time. Part D is a list of questions you should be able to answer in the technical walkthrough. Part E says plainly what the path asks for that this POC does **not** do.

File references use function names (line numbers drift). Paths are relative to `apps/api/src` for the API and `apps/web/src` for the UI unless stated.

---

## Part A. The problem (the path's "Understand the problem")

**Problem.** Interviewers keep interview questions in scattered documents, so they are hard to search, duplicated, and some are meant only for one team. The POC is a shared, searchable question bank with a review step and department-restricted questions.

**Users (roles).** One global role per account:

| Role | Can do |
|---|---|
| Read-only (`USER`) | Search and read **approved** questions they are allowed to see |
| Author (`AUTHOR`) | Everything above, plus add questions, edit their own (an edit goes back to review), withdraw their own until approved |
| Reviewer (`REVIEWER`) | See every status in their departments, approve or reject pending questions (not their own) with a note |
| Admin (`ADMIN`) | Everything: all questions, users, departments, technologies, tags, restores, audit trail |

**Key business rules** (each is enforced on the server and has a test):
1. *What you can see* is decided by **department grants**; *what you can change* by **role**. Visibility is checked first.
2. A restricted question must never leak: not through a list, a count, a search rank, a duplicate warning or a guessed id. "Hidden" and "does not exist" give the same 404.
3. New and edited questions start `PENDING`; users only see `APPROVED` ones. Admins' own questions go live at once.
4. Nothing is destroyed: deletes are soft and an admin can restore.
5. A technology belongs to departments (many-to-many); a department question may only use its department's technologies.
6. Every important change writes an audit event that can never be edited or deleted.

---

## Part B. The learning path mapped to this code

| Path topic | Where it is in this POC | Covered? |
|---|---|---|
| **Node.js runtime**: startup, shutdown, env config | `server.ts` (starts the app, handles SIGTERM/SIGINT, drains connections, hard stop after 10 s); `config/env.ts` (Zod-validated environment; refuses to start on bad or placeholder secrets) | Yes |
| **HTTP and REST APIs**: methods, status codes, headers, body/query/route params | `modules/*/routes.ts`; statuses 200/201/204/400/401/403/404/409/413/429/500; `Cache-Control: no-store`, helmet headers, cookies | Yes |
| **PostgreSQL**: tables, keys, relations, constraints, indexes | `prisma/schema.prisma` (11 models), hand-written SQL migrations; GIN full-text and trigram indexes | Yes |
| **Prisma ORM**: schema, relations, migrations, CRUD, filtering, sorting, pagination, transactions | `prisma/schema.prisma`, `prisma/migrations/*`, `db/prisma.ts` (driver adapter, statement timeout); writes via Prisma inside `db.$transaction`; reads of the question table via tagged-template raw SQL | Yes |
| **CRUD** | Questions, users, departments, tags, technologies: every one has create/read/update/soft-delete/restore | Yes |
| **Pagination, sorting, filtering** | Questions: `limit`/`offset`, relevance or newest sort, filters (text, tags, department, status, mine). Admin lists: cursor (keyset) paging | Yes |
| **Validation** | Zod `strictObject` schemas next to each route; `http/validate.ts` runs them before any logic | Yes |
| **Error handling** | `http/errors.ts`: one `AppError`, one `errorHandler`, stable JSON shape, safe 500s | Yes |
| **Authentication** | JWT in httpOnly cookies, rotating refresh tokens, Argon2id passwords: `modules/auth/*` | Yes (own login, **not Azure Entra ID**) |
| **Authorization** | `requireRole` for coarse gates; visibility SQL + service checks for resource-level; ownership checks | Yes |
| **Express path** (routing, middleware, controllers/services/repositories) | `http/app.ts` → `routes.ts` → `service.ts` → `*.repo.ts` | Yes |
| **Next.js path** (Route Handlers, Server Actions, tRPC) | Not used: the web app is React + Vite and talks to a separate Express API | No (Path A only) |
| **Vertical slice** | Part C below: each feature goes browser → API → database and back | Yes |
| **Automated testing** | Vitest + supertest on a real Postgres; web tests with Testing Library; property, contract, mutation and E2E tests | Yes |
| **Structured logging** | `pino` + `pino-http`: JSON logs, a server-made request id on every request and in the `X-Request-Id` header, cookies and tokens redacted | Yes (request id; no separate correlation id across services) |
| **Docker** | `apps/api/Dockerfile`, `apps/web/Dockerfile`, `compose.yaml` | Yes |
| **Azure production** (App Service, Key Vault, managed identity, App Insights) | Not built | **No** |
| **OpenTelemetry** (reference list) | Not built; Prometheus-style metrics exist at `GET /api/metrics` | **No** |

---

## Stage 01. How a request travels (Node runtime, HTTP and REST)

Take `GET /api/questions?q=closure&tags=technology:react`. Everything below is real code.

```
Browser (React)                      nginx                    Express API                          PostgreSQL
 fetch('/api/questions?...')  ──►  /api/ proxied  ──►  1  metrics timer
 cookie access_token sent                              2  trust proxy + request id + pino logger
                                                       3  helmet security headers
                                                       4  Cache-Control: no-store on /api
                                                       5  express.json (100 kB cap) + cookie parser
                                                       6  reject NUL bytes  → 400
                                                       7  Origin check (CSRF) for writes
                                                       8  router: /api/questions
                                                       9  requireAuth     → 401
                                                      10  per-user rate limit → 429
                                                      11  validateQuery (Zod) → 400
                                                      12  handler → resolveTagGroups → searchQuestions()
                                                      13                                   ──►  SELECT … WHERE visible(actor) AND …
                                                      14  res.json({ items, page })   ◄──
 React Query caches it         ◄──────────────────────  15  error handler catches anything thrown above
```

Where each step is: steps 1-7 in `http/app.ts` (`createApp`, in that order); 8-12 in `modules/questions/routes.ts` (`questionRoutes`); 15 in `http/errors.ts` (`errorHandler`). The order matters: *authenticate → rate-limit → validate → authorize → service*, so a bad request is rejected as cheaply as possible and validation always runs before business logic.

**Node runtime points to be able to explain**
- *Startup*: `server.ts` loads config (a bad environment throws immediately, so a broken deploy fails at once), opens the database pool, builds the app, starts listening and a background job that purges expired refresh tokens.
- *Async*: every handler is `async`; Express 5 forwards a rejected promise to the error handler, so there is no try/catch in handlers.
- *Shutdown*: on SIGTERM the server stops accepting connections, closes idle ones, disconnects the database, and force-exits after 10 s.
- *Environment*: nothing secret is in code; `.env` is git-ignored and Docker passes variables explicitly.

**HTTP and REST points**
- Resources are nouns: `/questions`, `/questions/:id`, `/questions/:id/history`, `/admin/users`. Actions that are not plain CRUD are sub-resources: `POST /questions/:id/review`, `POST /admin/clients/:id/restore`.
- Methods carry meaning: `GET` reads and changes nothing; `POST` creates or performs an action; `PATCH` partial update; `PUT /admin/users/:id/clients` replaces a set; `DELETE` soft-deletes.
- Status codes are chosen on purpose: `201` create, `204` nothing to return, `400` invalid input, `401` not signed in, `403` signed in but not allowed, `404` missing **or not yours to know about**, `409` conflict (duplicate, edit conflict, already reviewed, last admin), `429` rate limited.
- Headers: `X-Request-Id` (correlate a user report with a log line), `Cache-Control: no-store`, CSP and friends from helmet.

---

## Stage 02. Application data (PostgreSQL, Prisma, CRUD, paging)

### The data model (`prisma/schema.prisma`)

| Model (table) | Purpose | Notable design |
|---|---|---|
| `AppUser` (`app_user`) | Accounts | unique email; `active` flag; `deleted_at` (soft delete) |
| `Client` (`client`) | A **department** (the code still says "client") | unique name; `deleted_at` |
| `ClientGrant` (`client_grant`) | "this user may see this department" | composite primary key (user, department): the visibility check is a key lookup |
| `Question` | Text, answer notes, author, optional department, status, reviewer, review note | `client_id` set at creation and never changed; `deleted_at`; **no unique constraint on text** by design |
| `TagCategory`, `Tag` | Categories (technology, seniority, type) and their values | `archived_at` hides a tag without removing it from old questions |
| `ClientTag` (`client_tag`) | Which technologies a department offers (many-to-many) | composite primary key |
| `QuestionTag` (`question_tag`) | Question ↔ tag (many-to-many) | composite primary key |
| `AuditEvent` (`audit_event`) | Who did what, when, with a JSON payload | a database trigger refuses UPDATE and DELETE |
| `RefreshToken` (`refresh_token`) | Server-side record of each refresh token, **hashed** | one "family" per login; used/revoked timestamps |
| `Notification` | "Your question was approved/rejected" | stores ids only, no question text |

Relationships to be able to draw: user ─< grants >─ department ─< questions >─< tags; department ─< client_tag >─ tag. Indexes: a GIN index on the full-text expression and a trigram index on normalised text (for the duplicate check). Both are created in SQL migrations and **must match the query expression exactly**, or Postgres will not use them (`SEARCH_VECTOR` and `NORMALISED_TEXT` in `question.repo.ts` carry that warning).

### Why Prisma for writes and raw SQL for question reads
- **Writes** use the Prisma client inside `db.$transaction(...)`: a change and its audit row commit together or not at all.
- **Reads of `question`** are raw SQL (`$queryRaw` tagged templates, never string concatenation) because the visibility rule is a `WHERE` fragment appended to the same statement as search, count and paging. `question.repo.ts` is the **only** file allowed to touch the question tables; a test (`hardening.test.ts`, "architecture guard") fails if any other file does.
- **Migrations**: committed SQL files in `prisma/migrations`, applied with `prisma migrate deploy` (in Docker, by a one-shot `migrate` job before the API starts).

### CRUD, as it appears in the code
| | Questions | Users | Departments | Technologies / tags |
|---|---|---|---|---|
| Create | `createQuestion` | `createUser` | `createClient` | `addDepartmentTechnology`, `addTag` |
| Read | `searchQuestions`, `getVisibleQuestion` | `listUsers` | `listClients` | `listDepartmentTechnologies`, `listTagCategories` |
| Update | `updateQuestion`, `reviewQuestion` | `updateUser`, `setUserClients` | `updateClient` | rename |
| Delete | `deleteQuestion` (soft) | `deleteUser` (soft) | `deleteClient` (soft) | unlink / archive |
| Restore | `restoreDeletedQuestion` | `restoreUser` | `restoreClient` | restore |

Missing records follow one rule: a lookup returns `null`, the service throws `notFound()`, the error handler sends `404 {error:{code:"NOT_FOUND"}}`.

### Pagination, sorting, filtering
- **Questions** (`GET /questions`): filters are all applied in the database `WHERE`: text (`websearch_to_tsquery`), tags (OR within a category, AND across categories), department, status, `mine=true`. Sort is relevance (`ts_rank`) when searching, otherwise newest first, always with `id` as a tiebreaker so pages are stable. `limit` is 1-50 (default 20); `offset` is capped at **10,000**: past that the API answers 400 and the UI says "narrow your search". The response carries `page: { limit, offset, total }`, with `total` from a second query with the same `WHERE`.
- **Allowlisted fields**: sort fields are not client-chosen; the schema is a `strictObject`, so an unknown parameter is a 400, not silently ignored.
- **Admin lists** (users, deleted questions, audit): **cursor (keyset) paging**: `nextCursor` encodes the last row's sort key, so deep pages stay fast (`http/cursor.ts`).
- *Remember the path's rule*: nothing loads "everything" into memory; filtering, sorting and paging are in SQL.

---

## Stage 03. Safe and reliable (validation, errors, authentication, authorization)

### Validation
- Every route declares a Zod schema: `validateBody`, `validateQuery`, `validateParams` (`http/validate.ts`). Schemas are `strictObject`s (unknown fields rejected), with length caps (question text 1-1000, notes ≤10,000, ≤30 tags, search ≤200).
- Ids are `z.uuid()`, so a malformed id is a clean 400, never a database error.
- NUL bytes are rejected globally (`http/nul.ts`) because Postgres cannot store them (it would be a 500).
- The same schemas generate the request-body part of the OpenAPI document, so docs cannot drift from validation (`docs/`).

### Error handling
- **Expected errors**: code throws `AppError(status, code, message)` (helpers `badRequest`, `unauthorized`, `forbidden`, `notFound`).
- **One handler** (`errorHandler`) turns everything into the same shape: `{ "error": { "code", "message", ...extra } }`. Zod errors become `400 VALIDATION_ERROR` with the failing paths; bad JSON `400`; oversized body `413`.
- **Unexpected errors** are logged in full on the server (with the request id) and the client gets only `500 INTERNAL "Internal server error"`: no stack, no SQL.

### Authentication (who are you?)
- `POST /auth/login`: email + password. Unknown email, wrong password and disabled account all give the **same** 401 and the same work (a dummy hash is verified for unknown emails), so the response does not reveal which emails exist. Passwords are hashed with Argon2id (`modules/auth/password.ts`).
- Two tokens, both in **httpOnly, SameSite=Strict cookies**, so JavaScript can never read them (`auth/cookies.ts`):
  - *Access token* (JWT, 15 minutes, `Path=/api`): carries the user id and the session id.
  - *Refresh token* (JWT, 7 days, `Path=/api/auth` so it is sent nowhere else): stored hashed in `refresh_token`; each one works **once** (rotation); replaying a used one revokes the whole session ("family").
- `requireAuth` (`auth/middleware.ts`) runs one query: the user **and** whether the session behind the token is still alive. Role and `active` come from the database, not the token, so a role change or deactivation applies on the very next request, and signing out ends the access token immediately.
- The browser never stores a token: `apps/web/src/shared/api/client.ts` just calls the API; on a 401 it refreshes once (single-flight, also across tabs via a Web Lock) and retries.
- CSRF: SameSite=Strict plus an `Origin` check on state-changing requests (`http/csrf.ts`).
- *Not used*: Azure Entra ID / OAuth. The path lists it as a concept to understand; this POC implements its own credentials login.

### Authorization (what may you do?)
Two separate questions, always in this order:
1. **Can you see it?** (`visible(actor)` in `question.repo.ts`.) Soft-deleted or in a deleted department: gone for everyone. Admin: stops there. Otherwise the question must be global **or** you hold the grant, **and** the status your role may read (read-only: approved; author: approved or your own; reviewer: any). If not visible, the answer is `404`, identical to "does not exist".
2. **May you do this?** (service layer.) Examples in `questions/service.ts`: edit = Admin or the Author who wrote it; review = Reviewer/Admin and **not your own** question; delete = Admin, or the author of their own question until it is approved.

Coarse gates use `requireRole('AUTHOR','ADMIN')`; the whole `/admin/*` router sits behind `requireRole('ADMIN')`. A test (`hardening.test.ts`, "route sweep") walks a manifest of **every route** and fails the build if one is added without being covered for authentication. *The path's reminder holds here: hiding a button in the UI protects nothing; every rule above is re-checked on the server.*

---

## Stage 04. The implementation path (Express) and the engineering flow

### Layers (the path's "controllers, services, repositories")
```
routes.ts   (controller)  parse + validate input, call one service function, shape the response. Thin.
service.ts  (rules)       visibility, role, duplicates, conflicts, transactions, audit, notifications.
*.repo.ts   (data)        SQL / Prisma. Only question.repo.ts may touch the question tables.
```
`http/app.ts` wires middleware and routers; `http/errors.ts` is the single place errors become responses.

### The vertical slice: how to read Part C
Each feature below follows the path's flow. **Web** = what the user does and which React code runs. Then the API route, validation, authorization, logic, database rows touched, response, logging, and the test that proves it.

---

## Part C. Every functionality, end to end

Logging, for every feature: `pino-http` logs each request as JSON with a server-generated `reqId` (also returned as `X-Request-Id`), method, URL, status and timing; cookies/authorization/set-cookie headers are redacted; unexpected errors log the full error with that id. Audit events (below) are the *business* log; pino is the *operational* log.

### C1. Sign in
- **Requirement**: only registered, active users get in; no hint which emails exist.
- **Web**: `features/auth/LoginPage.tsx` (React Hook Form + a Zod schema for email shape and non-empty password) → `useLogin` → `POST /api/auth/login`. On success the cache is cleared (never show a previous user's data) and `/auth/me` data is set. Demo accounts panel (dev/demo builds only) fills the form.
- **API**: `auth/routes.ts`. Chain: IP rate limit (30/min) → body validation (email trimmed, lower-cased, ≤254; password 1-200 so Argon2 can't be used as a CPU lever) → per-IP+email limit (5/min) → `auth/service.ts: login`.
- **Logic**: look up user, verify Argon2id hash (or burn equal time if the user is unknown), reject inactive. Create a session id, issue both tokens, store the hashed refresh token.
- **Database**: `app_user` read; `refresh_token` insert.
- **Response**: `200 { user }` and two `Set-Cookie` headers. Tokens are never in the body.
- **Errors**: 400 shape, 401 `UNAUTHENTICATED` (same for every failure), 429 `RATE_LIMITED`.
- **Tests**: `auth.test.ts`, `security.auth.test.ts` (login flooding, rotating emails, timing equalisation, alg=none/forged tokens), `ratelimit.test.ts`; web `login.test.tsx`; E2E sign-in journey.

### C2. Stay signed in, and sign out
- **Requirement**: a short-lived access token that renews without logging people out, and a real sign-out.
- **Web**: `shared/api/client.ts` (refresh once on 401, retry; single-flight so parallel requests don't burn the rotating token). Sign out: sidebar button → `POST /api/auth/logout`.
- **API**: `POST /auth/refresh`, `POST /auth/logout` (per-IP limit). `auth/service.ts: refresh` claims the token atomically (`updateMany where usedAt is null`): if two requests race, only one wins; reuse of a spent token revokes the whole family. `logout` revokes the family.
- **Database**: `refresh_token` rows marked used/revoked and a new one inserted. A background job (`maintenance.ts`) purges expired ones every 6 hours.
- **Tests**: `auth.test.ts` (rotation, reuse detection), `ops.test.ts` (purge), `security.auth.test.ts`.

### C3. Search and filter questions
- **Requirement**: find questions by words and by technology/level/type/department/status; never reveal hidden ones.
- **Web**: `QuestionListPage.tsx` + `components/FilterBar.tsx`. Filters live in the URL (`filters.ts`: `parseFilters`/`toSearchParams`), so a search is bookmarkable and Back works. The box waits 300 ms after typing. Filter dropdowns are keyboard-operable (arrows, Home/End, typeahead). Results come from React Query (`useQuestionSearch`), cached 30 s, previous results stay while the next load.
- **API**: `GET /api/questions` (validation shown in Stage 03; `resolveTagGroups` turns `technology:react` into ids and rejects unknown tags with 400).
- **Database**: one statement with `visible(actor)` + filters + ranking, plus a count with the same `WHERE`, plus a lookup of the tags of the returned rows. Reads only.
- **Response**: `{ items: [...], page: { limit, offset, total } }`.
- **Tests**: `visibility.test.ts` (client restriction cannot be detected via search, filters, paging or id), `security.access.test.ts`, `security.input.test.ts` (injection payloads, tsquery operators, NUL), `filters.property.test.ts` (URL round trip), E2E "who sees what" (the word *zebrafish* is a MERN-only seeded question: only MERN-granted users find it).

### C4. Open a question and read its history
- **Web**: `QuestionDetailPage.tsx` → `GET /api/questions/:id` and `/:id/history`. Buttons (Edit, Review, Delete) appear only when `auth/hooks.ts` helpers (`canEdit`, `canReview`, `canDelete`) say so. These mirror the server for UX only.
- **API**: `getVisibleQuestion` first. Not visible ⇒ `404` (never 403). History is fetched **only after** visibility is confirmed.
- **Database**: `question` + tags read; `audit_event` read by `question_id`. The history shows edit diffs, never the raw audit payload.
- **Tests**: `visibility.test.ts` (every by-id route answers identically for hidden vs random id), `security.access.test.ts`.

### C5. Add a question (with near-duplicate detection)
- **Requirement**: authors add questions with tags and an optional department; similar questions are flagged but can be overridden; every new question awaits review (Admins' go live).
- **Web**: `QuestionForm.tsx` / `QuestionFormPage.tsx`: React Hook Form, length counters, the "Who can see this question?" select (only departments you may use), `TagPicker` (technologies limited to the chosen department's). If the API answers `409 DUPLICATE_SUSPECTED`, `DuplicateDialog` lists the matches; "add it anyway" resends with `confirmNotDuplicate: true`.
- **API**: `POST /api/questions`. Chain: auth → rate limit → **role gate (Author/Admin)** → body validation → `createQuestion`.
- **Logic** (`questions/service.ts: createQuestion`), cheapest checks first: department exists and you hold a grant (else 404, same as nonexistent); every tag exists and a department question uses only that department's technologies (else 400); then, **inside the transaction after taking an advisory lock on the normalised text**, a trigram similarity search (threshold 0.6) over only the questions **you can see**. A match without `confirmNotDuplicate` ⇒ 409 and a `DUPLICATE_REJECTED` audit row (committed separately so the attempt leaves a trace). The lock means two people submitting the same text at once cannot both pass.
- **Database (one transaction)**: `question` insert (status `PENDING`, or `APPROVED` for an Admin), `question_tag` inserts, `audit_event` `QUESTION_CREATED` (+ `DUPLICATE_OVERRIDDEN` if overridden).
- **Response**: `201 { question }`.
- **Tests**: `questions.write.test.ts` (who may add, direct attempts), `duplicates.concurrency.test.ts` (the race), `workflow.test.ts`, web `questions.form.test.tsx`.

### C6. Edit a question (with conflict detection)
- **Requirement**: authors fix their own questions; an edit returns to review; two people must not silently overwrite each other.
- **Web**: `QuestionFormPage.tsx` (EditView) remembers `question.updatedAt` and sends it as `expectedUpdatedAt`. On `409 EDIT_CONFLICT` it shows a banner with **Load their version**. The department is shown but locked ("can't be changed").
- **API**: `PATCH /api/questions/:id`; body must contain at least one of text/notes/tags (plus the two optional control fields).
- **Logic** (`updateQuestion`), in this order inside one transaction with the question row locked: visibility (404) → role: Admin, or the Author who wrote it (403) → freshness: `expectedUpdatedAt` must equal the stored version (409 `EDIT_CONFLICT`) → compute what changed (no change ⇒ return untouched, record nothing) → a changed text gets the same duplicate check as a new question (never against itself) → update.
- **Database**: `question` update (status back to `PENDING` for non-admins), `question_tag` replaced only if tags changed, `audit_event` `QUESTION_UPDATED` with `{changes: {field: {from, to}}}`.
- **Why 404 before 403**: if you cannot see it, you must not learn that it exists.
- **Tests**: `concurrency.test.ts`, `questions.write.test.ts`, `review.test.ts` (an edit resets the review), web `form.freshness.test.tsx`.

### C7. Review: approve or reject
- **Requirement**: a reviewer decides on pending questions, not their own; a rejection explains why; the author is told.
- **Web**: `components/ReviewPanel.tsx` (note field, Approve/Reject). The sidebar's **Review queue** link shows a waiting count.
- **API**: `POST /api/questions/:id/review` with `{ decision, note }` (note ≤2,000, required when rejecting).
- **Logic** (`reviewQuestion`), one transaction, **row lock first** (`lockQuestion`, `SELECT … FOR UPDATE`) so two reviewers deciding at once are serialised: visibility (404) → Reviewer or Admin (403) → not your own question, Admins excepted (403) → still `PENDING`, Admins may overturn an earlier decision (409 `NOT_PENDING`).
- **Database**: `question` status + note + reviewer + time; `notification` insert for the author (not when they decided it themselves); `audit_event` `QUESTION_APPROVED`/`QUESTION_REJECTED` with the note.
- **Tests**: `review.test.ts`, `workflow.test.ts`, web `review.test.tsx`, E2E "author submits → reviewer approves → everyone finds it".

### C8. Delete (withdraw) a question
- **Web**: Delete button on the detail page, behind a confirm dialog.
- **API**: `DELETE /api/questions/:id` → `204`.
- **Logic** (`deleteQuestion`): locked, visibility (404), then Admin may delete any; an Author only their own while it is **not approved** (approved questions are shared content); everyone else 403.
- **Database**: `question.deleted_at = now`, `audit_event` `QUESTION_DELETED` with the text. It vanishes from every list and lookup, for admins too; history stays.
- **Tests**: `questions.write.test.ts`, `admin.manage.test.ts`.

### C9. Sidebar counts and notifications
- **Requirement**: tell people what needs them without making them hunt.
- **Web**: `app/AppShell.tsx` polls two cheap queries: `GET /api/questions/summary` (reviewers: how many wait; authors: your pending/rejected/approved) and `GET /api/notifications` (unread count). `features/notifications/NotificationsPage.tsx` lists them and marks read (`POST /api/notifications/read` with `ids` or `all: true`).
- **Logic**: `reviewSummary` counts through the same visibility rule. A notification stores ids and the outcome only; the question text is looked up when shown and **only while you can still see that question** (`visibleQuestionTexts`).
- **Tests**: `workflow.test.ts`; web `workflow.test.tsx`.

### C10. Admin: users
- **Web**: `admin/AdminUsersPage.tsx` + `UserDialog.tsx`: search by name/email (debounced), **Load more** (cursor paging), add/edit dialog (name, email, role, active, password, department checkboxes), delete with confirm, a **Deleted users** list with Restore.
- **API** (`modules/admin/routes.ts`, all behind `requireAuth` → rate limit → `requireRole('ADMIN')`): `GET/POST /admin/users`, `PATCH/DELETE /admin/users/:id`, `PUT /admin/users/:id/clients`, `POST /admin/users/:id/restore`.
- **Logic** (`admin/users.ts`): email unique (409 `EMAIL_EXISTS`), password hashed before the transaction (Argon2 is slow by design); you cannot change your own role or deactivate yourself; **the last active admin cannot be removed or demoted** (checked inside the transaction, so two admins can't demote each other at once); setting a password or deactivating signs the user out everywhere; a restored user comes back **inactive** until activated.
- **Database**: `app_user`, `client_grant` (replaced as a set), `refresh_token` (revoked), `audit_event` (`USER_CREATED`, `USER_UPDATED`, `USER_ROLE_CHANGED`, `USER_DELETED`, `USER_RESTORED`, `USER_CLIENTS_CHANGED`).
- **Tests**: `admin.test.ts`, `admin.manage.test.ts`, `admin.paging.test.ts`; the `%`/`_` in a search is escaped so it finds them literally.

### C11. Admin: departments
- **Web**: `AdminDepartmentsPage.tsx` (list with user counts, create/edit dialog, delete confirm that first shows the **impact**, deleted list with Restore).
- **API**: `GET/POST /admin/clients`, `PATCH/DELETE /admin/clients/:id`, `GET /admin/clients/:id/impact`, `POST /admin/clients/:id/restore`.
- **Logic** (`admin/departments.ts`): unique name (409 `DEPARTMENT_EXISTS`); `impact` = how many questions, how many pending, how many users, how many technologies would be hidden; **delete** hides the department (its questions disappear via the visibility rule) and archives the technologies **only it used**, tagging them with `archived_by_client_id`; **restore** brings back exactly those, and a technology an admin archived by hand stays archived.
- **Tests**: `admin.manage.test.ts`, web `admin.departments.test.tsx`, `admin.restore.test.tsx`.

### C12. Admin: technologies per department, and "Other"
- **Requirement**: a Python question should offer Django, not React; a shared technology like Node.js appears under two departments but is one technology.
- **Web**: `DepartmentTechnologies.tsx` (inside the department dialog: active list with Rename/Remove, Archived list with Restore, suggestions of technologies other departments already have), `OtherTechnologies.tsx` (technologies with no department).
- **API**: `GET/POST /admin/clients/:id/technologies`, `DELETE/POST …/technologies/:tagId[/restore]`, `PATCH /admin/technologies/:id`, `GET /admin/technologies/other`, archive/restore for "Other".
- **Logic** (`admin/technologies.ts`): names are matched by a normalised key (`keyOf`: NFKC, lower-case, ignore spaces `.` `-` `_`) so "Next.js" and "next js" are one technology; the stored `value` is a URL-safe slug (`slugOf`: `C++` → `c-plus-plus`); adding links an existing technology or creates it; **remove** unlinks when shared, archives when exclusive; concurrent adds of the same name are handled by retrying on the unique-constraint error.
- **Database**: `tag`, `client_tag`, `audit_event` (`TAG_CREATED`, `TAG_LINKED`, `TAG_UNLINKED`, `TAG_ARCHIVED`, `TAG_RESTORED`, `TAG_UPDATED`).
- **Tests**: `admin.manage.test.ts`, `properties.test.ts` (name keys/slugs over generated input), web `department.technologies.test.tsx`, `admin.other.test.tsx`.

### C13. Admin: seniority and type tags
- **Web**: `AdminTagsPage.tsx`. **API**: `GET /admin/tag-categories`, `POST /admin/tag-categories/:slug/tags`, `PATCH /admin/tags/:id`, `POST /admin/tags/:id/archive|restore`. (Technology tags are managed per department, not here.)
- **Logic** (`admin/tags.ts`): rename changes the label only (the stored `value` stays, so saved links still work); duplicates (by name key) are refused; archived tags disappear from pickers/filters but stay on old questions. Usage counts come from `tagUsageCounts`.
- **Tests**: `admin.tags.test.ts`, web `admin.tags.test.tsx`.

### C14. Admin: restore deleted questions
- **Web**: `AdminDeletedQuestionsPage.tsx` (Load more). **API**: `GET /admin/deleted-questions`, `POST /admin/questions/:id/restore`.
- **Logic**: restore refuses with `409 DEPARTMENT_DELETED` while the question's department is deleted (restore the department first). **Database**: `question.deleted_at = null`; `audit_event` `QUESTION_RESTORED`.
- **Tests**: `admin.manage.test.ts`, web `admin.restore.test.tsx`.

### C15. Admin: audit trail
- **Requirement**: a trustworthy record of who did what.
- **Web**: `AdminAuditPage.tsx` (filter by type, person, dates; Load more; **Download CSV**).
- **API**: `GET /admin/audit` (cursor paging), `GET /admin/audit/export` (CSV, capped at 5,000 rows; `http/csv.ts: csvCell` quotes every cell and prefixes a `'` when a cell starts with `= + - @`, so a spreadsheet cannot run user text as a formula).
- **Database**: `audit_event` is **append-only**: a trigger (`migrations/…_audit_append_only`) raises on UPDATE/DELETE, even for the application's own database role.
- **Tests**: `audit.viewer.test.ts`, `audit.immutable.test.ts`, `pure.examples.test.ts` + `properties.test.ts` (CSV safety).

### C16. Reference data used by every screen
- `GET /api/tags` (`?for=filter` narrows Technology to the caller's departments and hides archived) and `GET /api/clients` (only the departments **you** hold, each with its technologies). Both go through the same rate limit as the admin pages. Used to build filters and the form.

### C17. How-it-works page, API docs, health, metrics
- **How it works** (`/how-it-works`, public): this application explained in the browser with feature walkthroughs, roles, grants, request flow, database and security tabs.
- **API docs**: `/api/docs` (Swagger UI) and `/api/openapi.json` are **off by default in production** (`DOCS_ENABLED`). The request schemas are generated from the Zod validators; `contract.test.ts` checks real responses against the response schemas.
- **Health**: `/api/health/live` (process is up, never touches the DB) and `/api/health/ready` (DB reachable): what Docker/Kubernetes probes use.
- **Metrics**: `/api/metrics` (Prometheus text), only with `Authorization: Bearer $METRICS_TOKEN`; otherwise the route does not exist.

---

## Stage 05. Test, observe, run

### Automated testing: what each kind proves
| Kind | Files | What it proves |
|---|---|---|
| **Unit** (no DB) | `unit.test.ts`, `pure.examples.test.ts`, web `filters.test.ts`, `permissions.test.ts` | pure logic: tokens, CSRF check, name keys, error handler, role helpers |
| **Integration / API** (real Postgres, supertest, no mocks) | `visibility`, `questions.write`, `review`, `admin*`, `auth`, `workflow`, `concurrency`, `ops`… | success **and** failure paths, authorization matrix, transactions |
| **Security / attack** | `security.auth|access|input|http.test.ts`, `hardening.test.ts` | tries to break auth, access control, input handling, headers; the route sweep and architecture guard |
| **Regression** | each attack and each bug report keeps its test | e.g. the dropdown crash has a test |
| **Property-based** | `properties.test.ts`, `filters.property.test.ts` | thousands of generated inputs against pure helpers |
| **Contract** | `contract.test.ts` | real responses match the OpenAPI document, no undocumented fields |
| **Mutation** | `npm run mutate` (Stryker) | the tests fail when the code is deliberately broken |
| **UI** | `apps/web/test/*` (Testing Library, axe) | behaviour by role and accessible name, accessibility |
| **End-to-end** | `apps/web/e2e/journeys.spec.ts` (Playwright, own DB and ports) | real browser: sign-in, who-sees-what, review workflow, keyboard, accessibility incl. colour contrast |

API tests run against an isolated `qb_test` database that the suite creates, migrates and truncates; the end-to-end suite uses its own `qb_e2e` and ports, so neither touches development data. **TDD** was used for hardening: the attack test is written first and asserts the *secure* behaviour; a failing test is a finding; the smallest fix turns it green and the test stays.

### Structured logging
See the paragraph at the start of Part C. To investigate a problem: take the `X-Request-Id` from the response (or the error report), search the JSON logs for that `reqId`, and read the request line, any `unhandled error` entry and the audit row if it was a business action.

### Docker
- `apps/api/Dockerfile`: multi-stage. A `build` stage compiles; a `migrate` stage (has the Prisma CLI) runs migrations and creates the first admin; the small `runtime` stage has production dependencies only, **no Prisma CLI**, runs as a non-root user.
- `apps/web/Dockerfile`: builds the React app, serves it with unprivileged nginx, which also proxies `/api` to the API (so cookies are first-party and no CORS is needed).
- `compose.yaml`: `db` (Postgres, healthcheck) → `migrate` (one-shot) → `api` (healthcheck) → `web`; database and API ports bound to loopback; optional `caddy` TLS profile. Configuration comes from environment variables (`.env.example`).

### Production (Azure)
Not built. What exists that maps to the concepts: environment-based configuration and secrets validation (Key Vault concept), health probes and Prometheus metrics (Application Insights concept), a container image per service (Container Apps concept).

---

## Part D. Questions to be able to answer (the "technical walkthrough")

1. Trace `GET /api/questions` from the browser to the database and back. *(Stage 01 diagram.)*
2. Why is visibility in the SQL rather than "fetch, then filter"? *(Counts, ranks, paging and duplicate warnings would all leak; one `WHERE` appended to every read; only `question.repo.ts` may read the table, enforced by a test.)*
3. Why `404` and not `403` for a restricted question? *(No existence oracle.)*
4. What happens if two reviewers approve at once? *(Row lock: the second waits, then sees the first result and gets 409 `NOT_PENDING`.)*
5. What happens if two authors submit the same question at once? *(Advisory lock on the normalised text inside the transaction.)*
6. Two people edit the same question; what does the second one see? *(409 `EDIT_CONFLICT`, "Load their version".)*
7. How does a user stay signed in, and what if a refresh token is stolen? *(Rotation; replay revokes the family; httpOnly cookies; access token tied to the session.)*
8. Where is validation, and why before authorization logic? *(Zod strict schemas in the route chain; bad input never reaches business code.)*
9. How are errors shaped, and what does a client see on a bug? *(One `AppError`/`errorHandler`; a generic 500 with the detail only in the server log under the request id.)*
10. Why Prisma for writes but raw SQL for reads here? *(Transactions and audit consistency vs. one composable `WHERE` for the visibility rule, full-text and trigram search.)*
11. How do you page efficiently? *(Offset with a cap for relevance-ranked search; cursor paging for admin lists; everything in SQL.)*
12. Why soft delete, and how is restore safe? *(History/authorship stay valid; restore of a department revives exactly the technologies its delete archived.)*
13. What stops an admin removing the last admin? *(A check inside the transaction.)*
14. How do you know authorization is not skipped on a new route? *(The route manifest sweep fails the build.)*
15. How would you prove a change is safe to ship? *(Tests at each level; mutation testing; contract test; E2E; CI.)*

---

## Part E. What the learning path asks for that this POC does not do

- **Azure**: no App Service/Container Apps deployment, Key Vault, managed identity, managed PostgreSQL or Application Insights.
- **Azure Entra ID / OAuth**: sign-in is the app's own email-and-password with JWT cookies. There is no multi-factor sign-in and no self-service password change or reset (an admin sets passwords).
- **Next.js path** (Route Handlers, Server Actions, tRPC): not used; this is the Express path.
- **OpenTelemetry / correlation across services**: not built; there is a single service, a request id and Prometheus metrics.
- **CI/CD**: a GitHub Actions workflow is written (`.github/workflows/ci.yml`) and each of its commands was run locally, but it has not yet run on GitHub.
- Things that are real but limited: the question search pages by offset (capped), and sessions/rate limits are per-process unless `REDIS_URL` is set.

For the 201 path: concurrency (advisory/row locks, edit conflicts), transactions, repository pattern, observability and CI/CD are already started here and are the natural things to deepen.
