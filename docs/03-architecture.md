# Stage 3 — Architecture, API Contract, Data Model, Security

Status: **Implemented (T-01..T-23). Written before the code and corrected against the code on 2026-10-16; where the build differs from the original plan the text says so.** Decisions referenced (D#, ADR-#) are in `02-technology-selection.md`. What is verified: `05-progress.md`.

## 1. System architecture

```mermaid
flowchart LR
  B[Browser SPA] -->|same origin: 3000| N[nginx: static UI + /api proxy]
  N -->|http://api:4000| A[Express API]
  A -->|SQL over Docker network: db:5432| P[(PostgreSQL 17)]
  A -->|JSON logs| L[stdout / docker logs]
```

Data flow: the browser only ever talks to nginx. Cookies are therefore first-party and `SameSite=Strict` works; no CORS is configured. nginx forwards `/api/*` to the `api` container by service name. The API sets `trust proxy` so rate limiting keys on the real client IP from `X-Forwarded-For`, not nginx's.

## 2. Backend layout (`apps/api/src`)

```
src/config/    env parsing (Zod), fails fast on bad .env
src/http/      app.ts (request id + pino-http + helmet + body/cookie parsing), csrf.ts (Origin check), validate.ts, errors.ts
src/modules/
  auth/        routes (login rate limit), service (login/refresh/logout), tokens, cookies, password, middleware (requireAuth/requireRole)
  questions/   routes (per-user rate limit), service, question.repo.ts  <- ONLY file that reads the question tables
  tags/        routes (GET /tags), tags.ts (tag string parser + category:value -> ids)
  clients/     routes (GET /clients: only the caller's grants)
  audit/       audit.repo.ts (write inside the caller's transaction; history read)
src/docs/      openapi.ts (OpenAPI 3.1 built from the Zod schemas), routes.ts (Swagger UI + spec)
src/db/        prisma client (driver adapter)
src/seed/      deterministic seed (data.ts, seed.ts, run.ts)
prisma/        schema.prisma, migrations/ (hand-written SQL for the GIN indexes and the CHECK)
test/          globalSetup (creates and migrates qb_test), helpers/fixture world, integration tests
```

Layers: **route** (wire + `validate(schema)`), **service** (business rules, transactions, audit), **repo** (SQL). No separate controller layer: route handlers are 5-10 lines, so a controller would only rename them. Rate limiting is applied inside the auth and questions routers, not in `http/`.

### Request lifecycle (`GET /api/questions?q=closure&tags=technology:react`)

```mermaid
sequenceDiagram
  participant C as Client
  participant M as Middleware
  participant S as Service
  participant R as question.repo
  participant D as Postgres
  C->>M: GET (cookies)
  M->>M: requestId, log, rateLimit
  M->>M: auth: verify access JWT, load user by PK (else 401)
  M->>M: validate query (Zod): unknown category => 400
  M->>S: search(actor, filters)
  S->>R: search(actor, filters)
  R->>D: page query: visibility + tag EXISTS + tsquery + LIMIT/OFFSET
  R->>D: count query: same WHERE (run in parallel)
  D-->>R: rows, total
  R-->>S: items, total
  S-->>C: 200 {items, page}
```

Order matters: **auth → validate → authorize → service**. Validation runs before business logic (SEC-01). For `POST /questions` the role gate runs before body validation (a read-only user gets 403 whatever the body); `PATCH` validates, then the service checks visibility and then role. The original plan was to prove SEC-01 by spying on the service; the tests instead assert that each bad input is a 400 **and nothing was written** (`questions.write.test.ts`, `visibility.test.ts`). The page and count queries both carry the visibility predicate; the plan said "one statement", but two keep `total` correct when the offset is past the end.

## 3. API contract

Base path `/api`. JSON only. All routes except `login`, `refresh`, `logout`, `health` and the docs require a valid access cookie (401 otherwise; SEC-02). Success bodies wrap the resource: `GET/POST/PATCH /questions...` return `{question}`; `GET /questions/:id/history` returns `{items:[{id,type,at,actor:{id,name},changes?}]}` (`changes` only on `QUESTION_UPDATED`). The questions API also has a per-user rate limit (default 120/min, `RATE_LIMIT_API_PER_MIN`) that returns 429 `RATE_LIMITED` and deliberately sends no `RateLimit-*` headers, since a decrementing counter would make hidden and genuinely empty search responses differ (SEC-04).

| Method | Route | Purpose | Auth / authorization | Success | Errors |
|---|---|---|---|---|---|
| GET | `/health` | liveness + DB ping | none | 200 `{status:"ok"}` | 503 |
| GET | `/docs`, `/openapi.json` | Swagger UI and the OpenAPI 3.1 spec (contract only, no data); on unless `DOCS_ENABLED=false` | none | 200 | |
| POST | `/auth/login` | email + password → cookies | none; rate-limited 5/min per IP+email | 200 `{user}` + 2 cookies | 400, 401 (same body for bad email/password), 429 |
| POST | `/auth/refresh` | rotate refresh token → new cookies | refresh cookie | 204 + cookies | 401 (reuse revokes family) |
| POST | `/auth/logout` | revoke family, clear cookies | refresh cookie (idempotent) | 204 | |
| GET | `/auth/me` | current user `{id,name,email,role}` | access cookie | 200 | 401 |
| GET | `/tags` | categories with values (non-sensitive, global) | authenticated | 200 `{categories:[{slug,name,tags:[{value,label}]}]}` | 401 |
| GET | `/clients` | clients the **caller** is granted | authenticated | 200 `{items}` (only granted) | 401 |
| GET | `/questions` | search + filter, paginated | authenticated; visibility in SQL | 200 `{items,page}` | 400, 401, 429 |
| GET | `/questions/:id` | one question | visibility in SQL; invisible ≡ nonexistent | 200 | 400 (bad uuid), 401, **404** |
| GET | `/questions/:id/history` | audit events for the question | visible first, then 404 otherwise | 200 `{items}` | 401, **404** |
| POST | `/questions` | create | role AUTHOR/REVIEWER; client grant if `clientId` | 201 | 400, 401, 403 (role), 404 (unknown/ungranted client, identical), **409 duplicate** |
| PATCH | `/questions/:id` | partial edit | visible → else 404; then AUTHOR owns it or REVIEWER; else 403 | 200 | 400, 401, 403, 404 |

**Why 403 vs 404 order on PATCH:** visibility first. A `USER`/other-author editing a *visible* question gets 403 (they know it exists, no leak). Any edit of an *invisible* question gets 404, same as a random ID.

**`GET /questions` query:** `q` (≤200 chars, `websearch_to_tsquery`), `tags` (comma list of `category:value`, grouped by category server-side: OR within, AND across), `clientId` (uuid; just an extra predicate: ungranted ≡ nonexistent ≡ zero rows), `limit` (1-50, default 20), `offset` (≥0). Sort: `ts_rank` desc when `q` present, else `created_at` desc; tiebreak `id`. Unknown category → 400; unknown value in a known category → 400.

**Response shapes**
```jsonc
// 200 GET /questions
{ "items": [{ "id", "text", "answerNotes", "client": {"id","name"}|null,
              "tags": [{"category","value"}], "author": {"id","name"},
              "createdAt", "updatedAt" }],
  "page": { "limit": 20, "offset": 0, "total": 0 } }
// error (identical body for invisible and nonexistent; no requestId in body)
{ "error": { "code": "NOT_FOUND", "message": "Question not found" } }
// 409
{ "error": { "code": "DUPLICATE_SUSPECTED", "message": "...", "matches": [{"id","text","similarity"}] } }
```
`X-Request-Id` goes in a **header** so bodies are byte-identical for the SEC-04 and IMP-02 tests.

**`POST /questions` body:** `{ text: string 1..1000 (trimmed), answerNotes?: string ≤10000, clientId?: uuid, tags: string[] ("category:value"), confirmNotDuplicate?: boolean }`. **`PATCH`:** `text`, `answerNotes`, `tags` only, all optional, at least one required; unknown keys (including `clientId`) → 400. Duplicate check runs on create only (documented limitation; extending to edits is a one-line change).

**`clientId` is immutable.** It can be set on `POST` only (requires a grant; an ungranted `clientId` returns the same 404 as a nonexistent client). A `PATCH` body containing `clientId` is a 400. Re-scoping would expose restricted content and its history, or strand it from its author.

## 4. Data model

```mermaid
erDiagram
  app_user { uuid id PK
    text email UK
    text name
    text password_hash
    enum role "USER|AUTHOR|REVIEWER"
    bool active }
  client { uuid id PK
    text name UK }
  client_grant { uuid user_id PK,FK
    uuid client_id PK,FK }
  tag_category { uuid id PK
    text slug UK
    text name }
  tag { uuid id PK
    uuid category_id FK
    text value
    text label }
  question { uuid id PK
    text text
    text answer_notes
    uuid author_id FK
    uuid client_id FK "nullable"
    timestamptz created_at
    timestamptz updated_at }
  question_tag { uuid question_id PK,FK
    uuid tag_id PK,FK }
  audit_event { uuid id PK
    enum type
    uuid actor_id FK
    timestamptz at
    uuid question_id "nullable, no FK cascade"
    jsonb payload }
  refresh_token { uuid id PK "jti"
    uuid user_id FK
    uuid family_id
    text token_hash
    timestamptz expires_at
    timestamptz used_at
    timestamptz revoked_at }
  app_user ||--o{ client_grant : has
  client ||--o{ client_grant : grants
  client ||--o{ question : owns
  app_user ||--o{ question : authors
  tag_category ||--o{ tag : contains
  question ||--o{ question_tag : has
  tag ||--o{ question_tag : applied
  question ||--o{ audit_event : traced
```

**Constraints:** `tag UNIQUE(category_id, value)`; `question.text` CHECK non-blank; **no unique on text** (ADR-007); FKs `ON DELETE RESTRICT` (no deletes in scope).

**Indexes (each justified; re-justified by EXPLAIN in T-20):**

| Index | Serves |
|---|---|
| `question_tag (question_id, tag_id)` PK | loading a question's tags; the `EXISTS` probe |
| `question_tag (tag_id, question_id)` | tag → questions probe for the filter |
| `client_grant (user_id, client_id)` PK | visibility `EXISTS` is a PK lookup |
| GIN expression index `question_search_idx` (weighted `to_tsvector` of text + notes) | keyword search |
| GIN expression index `question_text_trgm_idx` (`gin_trgm_ops` over normalised text) | duplicate `%` / `similarity` |
| `question (created_at DESC, id DESC)` | default sort + pagination |
| `question (client_id)` | client filter, visibility join |
| `audit_event (question_id, at)` | history |
| `refresh_token (family_id)` | family revocation |

**No generated columns.** The spike (ADR-003) showed Prisma reports drift on generated columns, so search and trigram use expression indexes and `question.repo.ts` repeats the identical expressions. Implemented as `apps/api/prisma/migrations/*_init`; `prisma migrate diff` reports no drift.

**Migrations / seed:** `prisma migrate deploy` on API start. Seed is deterministic (seeded PRNG, no faker dependency): 9 users (3 USER, 4 AUTHOR, 2 REVIEWER; one of the authors and one USER have no client grants, one author has both clients), 2 clients (Acme Corp, Globex) with different grant sets, 21 tags in 3 categories (technology 12, seniority 4, type 5), 5,000 generated questions (~10% client-restricted) plus 4 **named fixtures** with unique marker keywords (`capybara` global, `zebrafish` Acme, `narwhal` Globex, and a `let/const/var` question for the duplicate demo) = 5,004. The seed has no force flag: it refuses to run on a non-empty DB (`--if-empty` makes that a silent skip, used on container start).

**Retention:** audit and refresh-token tables grow unbounded; a cleanup of expired refresh tokens is noted as future work.

## 5. Security architecture (OWASP mapping)

| Concern | Control |
|---|---|
| A01 Broken access control | Visibility in SQL (ADR-005); role checks in service; 404-not-403 for invisible; architecture-guard test; route sweep |
| A02 Crypto / secrets | Argon2id; two independent JWT secrets from `.env`; `.env` git-ignored, `.env.example` committed; startup fails if secrets < 32 chars, if the two are equal, or if `COOKIE_SECURE=true` with the committed `dev-only` placeholders. Caveat: the login page's Demo accounts panel puts the demo password in the web bundle when `VITE_SHOW_DEMO_ACCOUNTS=true` (default in compose); local demo only |
| A03 Injection | Only bound parameters (`$queryRaw` tagged templates); `$queryRawUnsafe` banned by lint; Zod on every input |
| A04 Insecure design | Threat: probing existence via search, ID, counts, errors, duplicates (IMP-01..08) |
| A05 Misconfiguration | `helmet`, no stack traces in prod errors, `x-powered-by` off, minimal Docker images, non-root user |
| A07 Auth failures | Short access TTL, rotating refresh with reuse detection, rate limit + uniform login errors, timing-equalised unknown user |
| A08 Integrity | Pinned deps, lockfile. `npm audit` is run by hand (no CI): 4 high findings via the `prisma` CLI's transitive deps, see `05-progress.md` |
| A09 Logging | pino; redact `cookie`, `set-cookie`, `password`, tokens; log who/what/when for audit events |
| CSRF | Strict cookies + same-origin + Origin check (ADR-006) |
| XSS | React escapes by default; no `dangerouslySetInnerHTML`; answer notes rendered as plain text; CSP set by helmet on the API and by nginx (`security-headers.inc`) on the UI, both `default-src 'self'`-based; tokens not readable by JS |

Known limitations to document: timing side channels (A15); refresh race across tabs; HS256 shared secret; no account lockout beyond rate limiting.

## 6. Frontend architecture (`apps/web/src`)

```
app/         AppShell, routes, queryClient, pages (not-found / route error)
features/
  auth/      LoginPage, RequireAuth, api + hooks (useMe, useLogin, canEdit)
  questions/ QuestionListPage, QuestionDetailPage, QuestionFormPage, QuestionForm, filters.ts, api + hooks
    components/  FilterPanel, TagPicker, QuestionRow, Pagination, chips, DuplicateDialog, HistoryList
shared/      api/client.ts (apiFetch, single-flight refresh), ui/ (Button, Field, Dialog, Icon, Toast, states.tsx for skeleton/empty/error), hooks/, lib/
```
Routing: `/login`, `/` (list), `/questions/new`, `/questions/:id` (detail + history), `/questions/:id/edit`; the controls to edit show only when `canEdit` allows (cosmetic: the API enforces). Server state only in TanStack Query; URL is the state for filters. Forms: React Hook Form + Zod schemas mirroring the API's.

## 7. Docker and ports

| Service | Container port | Host port | Notes |
|---|---|---|---|
| web (nginx-unprivileged) | 8080 | 3000 | the only URL users need |
| api | 4000 | 4000 | exposed for curl/tests |
| db | 5432 | 5436 | host side moved to avoid a local Postgres on 5432 |

`.env.example` keys: `POSTGRES_USER/PASSWORD/DB`, `POSTGRES_HOST_PORT`, `API_HOST_PORT`, `WEB_HOST_PORT`, `DATABASE_URL` (host-side only), `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ALLOWED_ORIGINS`, `COOKIE_SECURE` (default `false`: Safari drops `Secure` cookies on http://localhost), `SEED_ON_START`, `SEED_PASSWORD`, `VITE_SHOW_DEMO_ACCOUNTS`. Optional, not in `.env.example`: `DOCS_ENABLED` (default true), `RATE_LIMIT_LOGIN_PER_MIN` (5), `RATE_LIMIT_API_PER_MIN` (120), `LOG_LEVEL`, `PORT`. The Docker command catalogue is `docs/docker.md`.
