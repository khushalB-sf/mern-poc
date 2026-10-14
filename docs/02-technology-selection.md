# Stage 2 — Technology Selection, Decision Log, ADRs

Status: **DRAFT for review. No implementation code exists.**

## 1. Decision log (Stage 1 questions, now closed)

| # | Decision | Source |
|---|---|---|
| D1 | Express + TypeScript | You |
| D2 | Minimal React UI with good UX (see ADR-009) | You |
| D3 | Seeded users; JWT access + refresh tokens, both in httpOnly cookies; **nothing in localStorage/sessionStorage/JS memory beyond the current profile object** | You |
| D4 | Reviewers need client grants like everyone else (no bypass) | You |
| D5 | Duplicate rule: trigram similarity ≥ 0.6 on visible rows, explicit override recorded in audit | Delegated, my call |
| D6 | Seed includes **two** clients from day one (gives §8 option 2 almost free). **Postgres RLS is deferred**, not in core scope (ADR-005); instead an architecture-guard test enforces the "one query module" rule | Delegated, my call |
| D7 | `USER` role cannot create questions (§2 beats §1's "anyone") | Stage 1 default, unchallenged |
| D8 | **No cloud deployment.** The brief requires only `docker compose up`. CI (lint/typecheck/test) is included; hosting is not. | My call: tell me if you want it |

## 2. Verified facts that changed the plan

I checked these against the npm registry on 2026-10-14. They are facts, not memory.

| Finding | Consequence |
|---|---|
| `npm view prisma dist-tags.latest` → **8.0.0-rc.22** (a release candidate). `prev` tag = 7.10.0. `@prisma/client` latest = 7.10.0 | **Pin `prisma@7.10.x` and `@prisma/client@7.10.x` exactly.** A bare `npm i prisma` would install an RC. A web search also claims the Prisma 8 CLI no longer reads `schema.prisma`; I could not confirm that from a primary source, so I am treating it as a reason to pin, not as fact. |
| Express `latest` = 5.3.0 | Use Express 5 (native async-handler error propagation, no `express-async-errors` hack). |
| Zod `latest` = 4.6.7, Vitest `latest` = 5.0.4, Vite 8.3.4, React 19.3.0, TanStack Query 5.104.2, helmet 8.3.0, pino 10.4.0, argon2 0.45.1, jsonwebtoken 9.0.3, supertest 7.3.1, express-rate-limit 8.7.1, cookie-parser 1.4.7 | Pin exact versions at install time (Stage 5). Re-verify peer-dependency compatibility then. |
| A Prisma GitHub issue ([prisma#24180](https://github.com/prisma/prisma/issues/24180)) reports that a hand-added `tsvector` column and GIN index were **dropped** by `migrate dev --create-only` (reported to happen silently on an empty table) | Treat the search column and indexes as a **risk to spike in task T-03** before building on them. See ADR-003. |

Not yet verified (will be, in the spike): how Prisma 7 declares the Postgres driver (driver adapter), and whether an `Unsupported("tsvector")` field or an expression index survives `migrate dev` without drift.

## 3. Stack, with justification

| Layer | Choice | Why this and not the obvious alternative |
|---|---|---|
| Runtime | Node 22 LTS | Installed locally (22.19); same major in Docker. |
| API | Express 5 + TypeScript strict | See ADR-002. |
| Validation | Zod 4 | One schema = runtime validation + TS types + (optionally) OpenAPI. Alternatives (Joi, class-validator) give weaker inference. |
| DB / ORM | PostgreSQL 17 + Prisma 7 for schema, migrations, simple CRUD; parameterised raw SQL for search | ADR-001, ADR-003. |
| Passwords | `argon2` (Argon2id) | OWASP first choice. Native module, so the Docker base image is `node:22-bookworm-slim`, not Alpine, to avoid musl prebuild issues. bcrypt rejected: older, 72-byte limit. |
| Tokens | `jsonwebtoken`, HS256 pinned, two separate secrets | ADR-006. |
| Cookies | `cookie-parser` | Express does not parse cookies. ~1 small dependency; hand-rolling parsing is not worth it. |
| Security middleware | `helmet`, `express-rate-limit` | Tiny, standard, no reason to write these. |
| Logging | `pino` + `pino-http`, redaction of cookies/passwords | Structured JSON satisfies AUD-01 log traces. |
| Tests | Vitest + Supertest against a **real Postgres** (separate `qb_test` database) | Mocks cannot prove a SQL predicate. |
| UI | React 19 + Vite + React Router + TanStack Query + React Hook Form + Zod + Tailwind | ADR-009. |
| E2E | Playwright, one spec for the golden path, **only if time remains** | The decisive tests are API-level. |
| Infra | Docker Compose: `db`, `api`, `web` (nginx: static UI + `/api` reverse proxy) | ADR-010. |
| CI | GitHub Actions: lint, typecheck, test with a Postgres service | Cheap proof tests really run. |

Deliberately **not** used: Redux/Zustand (the only real state is server state, owned by TanStack Query), Axios (`fetch` suffices), a component library (native `<dialog>`, `<details>`, form controls cover the UI), Swagger UI (a short hand-written API table in docs; OpenAPI generation is an optional extra), a repository pattern (one query module is the only data-access abstraction that earns its place; ADR-005), Passport (we need 60 lines of auth, not a strategy framework).

## 4. SQL vs NoSQL comparison

The brief fixes PostgreSQL, so the outcome is predetermined. The comparison is still worth having for the walkthrough.

| Criterion | PostgreSQL | MongoDB | Winner for this POC |
|---|---|---|---|
| Data shape | Relational: question ↔ tag (M:N), client ↔ user grants | Document: embed tags in question | Postgres: M:N is native, tags are shared entities |
| Visibility enforcement | One `WHERE ... EXISTS` in the same statement as filter and search | Needs `$lookup` to grants or denormalised `allowedUsers[]` on every question (stale on grant change) | **Postgres** |
| Combined filter | `EXISTS` per category over an indexed join | Multikey index on `tags[]`; AND-across-categories works but referential integrity is manual | Postgres (integrity), Mongo is not bad |
| Keyword search | `tsvector` + GIN | Text index (one per collection) or Atlas Search | Tie |
| Near-duplicate | `pg_trgm` + GIN | No built-in trigram similarity | **Postgres** |
| Transactions | Multi-row ACID by default (question + tags + audit in one tx) | Multi-doc transactions exist, need replica set | Postgres |
| Schema/constraints | FKs, `UNIQUE(category_id, value)`, CHECKs | App-level validation | Postgres |
| Migrations | Prisma Migrate (SQL files, reviewable) | Schema-less drift risk | Postgres |
| Ops in Compose | One container, official image includes `pg_trgm` | One container (single node, no transactions) | Tie |
| Future | RLS available as defence in depth | Not available | Postgres |

**Recommendation: PostgreSQL only.** MongoDB would not be chosen merely because the stack is called MERN.

## 5. ADRs

Format: Decision · Problem · Reasoning · Alternatives · Trade-offs · Implementation · Verification · Review questions.

### ADR-001 — PostgreSQL as the single database
- **Decision:** PostgreSQL 17, one database, no cache/search sidecar.
- **Problem:** Needs M:N tags, transactional audit, DB-side filter + keyword + similarity, and an access predicate that cannot be bypassed by a separate service.
- **Reasoning:** Postgres natively does all five (§4). A separate search engine (Elasticsearch/Meilisearch) would need its own copy of the permission data, and every sync gap is a leak.
- **Alternatives:** MongoDB; Postgres + Elasticsearch.
- **Trade-offs:** FTS is less feature-rich than a dedicated engine (no typo tolerance beyond trigram). Fine at thousands of rows.
- **Implementation:** `compose.yaml` `db` service; `pg_trgm` created in a migration.
- **Verification:** `EXPLAIN ANALYZE` at 5k/10k rows (T-20).
- **Review questions:** Why not Elasticsearch? What happens at 5M rows? How do you keep search and permissions consistent? (Answer: they are the same statement.)

### ADR-002 — Express 5 over Next.js
- **Decision:** Express 5 API + separate Vite SPA.
- **Problem:** The POC is an authorization-heavy API; its proof is API tests.
- **Reasoning:** Explicit middleware pipeline (`auth → validate → authorize → service`) is easy to demonstrate. Next.js route handlers/server actions blur the boundary between UI and API, and add an RSC mental model that serves no requirement.
- **Alternatives:** Next.js (App Router); Fastify; NestJS.
- **Trade-offs:** Two deployables instead of one; manual structure. NestJS rejected as heavy for this scope; Fastify is fine but you know Express.
- **Implementation:** `apps/api` (Express), `apps/web` (Vite).
- **Verification:** Route-sweep test asserts every route is behind auth (SEC-02).
- **Review questions:** Why not Next.js? How does Express 5 differ from 4 for async errors?

### ADR-003 — Prisma for schema/CRUD, raw SQL for search and duplicates
- **Decision:** Prisma 7 (pinned) for models, migrations, simple writes. `prisma.$queryRaw` tagged templates (parameterised) for the search, visibility-scoped reads and duplicate query.
- **Problem:** Prisma's query API cannot express `tsvector @@`, `similarity()`, or an `EXISTS` per category with an `ANY` list.
- **Reasoning:** The brief mandates Prisma; forcing the hard query through the ORM would either fail or fetch broadly (the exact anti-pattern the brief warns about). Tagged templates are injection-safe as values are bound parameters.
- **Alternatives:** Kysely/Knex for the query builder (extra dependency; two data-access tools); Prisma's `fullTextSearchPostgres` preview (does not cover trigram, still needs raw for visibility).
- **Trade-offs:** Raw SQL loses compile-time column checks; mitigated by confining it to one module and testing it against real Postgres.
- **Implementation:** `question.repo.ts` is the only file that reads `question`. Search columns/indexes added via hand-written SQL in a migration.
- **Spike T-03 result (measured 2026-10-14, Prisma 7.10.0, Postgres 17.11):**
  - **Generated columns drift.** `search_tsv`/`text_normalized` as `GENERATED ALWAYS ... STORED`, with GIN indexes not declared in `schema.prisma`: `prisma migrate diff` wanted to `DROP INDEX` both GIN indexes and `ALTER COLUMN ... DROP DEFAULT` on both generated columns (Prisma reads the generation expression as a default). `migrate dev` then prompts for a migration name to "fix" it, i.e. the next dev migration would try to destroy the search setup. Rejected.
  - **Expression indexes do not drift.** No extra columns; two GIN indexes on expressions (`setweight(to_tsvector('english', text),'A') || setweight(to_tsvector('english', answer_notes),'B')` and `btrim(regexp_replace(lower(text), '[^[:alnum:]]+', ' ', 'g')) gin_trgm_ops`). `migrate diff` returned "This is an empty migration." **Chosen.**
  - **Cost:** queries must repeat the exact expression to hit the index. The expressions live as two constants in `question.repo.ts` (the only module that reads `question` anyway).
  - **FTS index use confirmed:** `EXPLAIN ANALYZE` on 5,001 rows → Bitmap Index Scan on `question_search_idx`, 0.9 ms.
  - **Trigram caveat:** on my deliberately repetitive synthetic text (every row "Explain topic number N in X") the planner chose a Seq Scan, because `%` at the default 0.3 threshold matches 27% of rows. That says nothing about real text; T-07 seeds varied text and T-15/T-20 re-measure. T-15 will also `SET LOCAL pg_trgm.similarity_threshold = 0.6` so the indexable `%` prefilter and the real threshold agree.
  - **Runtime check:** generated client + `@prisma/adapter-pg` ran a parameterised `$queryRaw` tagged-template FTS query and returned the expected row; `tsc` clean.
  - **Prisma tooling notes:** Prisma 7 keeps the URL in `prisma.config.ts`, not `schema.prisma`; the generator is `prisma-client` with a required `output` (git-ignored, generated at install/build); `migrate reset` refuses to run from an AI agent without explicit user consent, and `migrate dev` blocks on a prompt without a TTY (use `--name` / `--create-only`).
- **Verification:** `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` must print only "empty migration" after every migration; CI repeats this on a fresh DB.
- **Review questions:** Is `$queryRaw` injection-safe? Why not `$queryRawUnsafe`? (Never used; lint rule bans it.)

### ADR-004 — Tag schema and filter query
- **Decision:** `tag_category(id, slug)`, `tag(id, category_id, value)` with `UNIQUE(category_id, value)`, `question_tag(question_id, tag_id)` PK `(question_id, tag_id)` plus index `(tag_id, question_id)`. Filter = one `EXISTS (SELECT 1 FROM question_tag WHERE question_id = q.id AND tag_id = ANY($ids))` per selected category.
- **Problem:** "technology ∈ {React, Node} AND seniority ∈ {Mid, Senior}" as one indexable query.
- **Reasoning:** Within a category tag IDs are OR'd by `ANY`; across categories the `EXISTS` clauses are AND'd. Tag IDs are resolved from `category:value` strings via a tiny lookup on the non-sensitive `tag` table, so the `EXISTS` needs no join to `tag`. Every lookup is a PK or reverse-index hit.
- **Alternatives:** `tag_ids int[]` column + GIN (fast; no FK integrity, tag rename/delete drift); JSONB tags (same); EAV (worse); one join table per category (rigid).
- **Trade-offs:** Several `EXISTS` clauses mean semi-joins; planner handles this well at thousands of rows, measured in T-20. Arrays would win only at much larger scale.
- **Verification:** Correctness tests with fixtures; `EXPLAIN ANALYZE` shows index scans on `question_tag`.
- **Review questions:** Show me the schema and the join. Why `EXISTS` and not `JOIN`+`GROUP BY HAVING`? (Joins multiply rows and need `DISTINCT`.)

### ADR-005 — Visibility enforced inside the query, one choke point
- **Decision:** `question.repo.ts` exports the only functions that read `question`. Each takes `actor` as a required argument and embeds `q.client_id IS NULL OR EXISTS (SELECT 1 FROM client_grant WHERE user_id=$actor AND client_id=q.client_id)`. Invisible and nonexistent are both `null`/empty. Services map `null` → identical 404.
- **Problem:** §3.4: no leak through search, filter, ID access, history, counts, duplicates.
- **Reasoning:** One module means one place to review. Including visibility in the same statement as filter/search/pagination means counts, totals and ranking are computed only over visible rows.
- **Alternatives:** (a) Fetch then filter in app: **rejected**, it is the failure the brief names. (b) Postgres RLS: **deferred**. It gives defence in depth, but with Prisma connection pooling it needs `SET LOCAL` inside every transaction, and the failure mode (silently empty results from a missing setting) is harder to debug in a 2-week solo POC. Recorded as a future hardening step. (c) Per-question `allowed_user_ids` array: stale on grant change.
- **Trade-offs:** Discipline-based guarantee, so we add an **architecture-guard test**: scans application source under `src/` (excluding `prisma/seed.ts` and test fixtures) and fails if any file other than `question.repo.ts` references the `question` table in SQL or `prisma.question`.
- **Verification:** SEC-04 test (indistinguishable response + positive control), one test per path in IMP-01, IMP-02 identical 404 test, guard test.
- **Review questions:** Where is the exclusion? What if a developer adds a new endpoint? (Guard test fails.) Why not RLS?

### ADR-006 — Cookie-based JWT with refresh rotation
- **Decision:** `POST /api/auth/login` sets two httpOnly cookies:
  - `access_token`: JWT, 15 min, `Path=/api`, `SameSite=Strict`, `Secure` outside local dev.
  - `refresh_token`: JWT with `jti` + `family`, 7 days, `Path=/api/auth`, same flags.
  The JSON response carries only the user profile. The frontend stores no token anywhere; it learns who is logged in via `GET /api/auth/me`.
- **Refresh:** `POST /api/auth/refresh` rotates: the presented `jti` is looked up in `refresh_token` (stored as SHA-256 hash), marked used, a new token in the same family is issued. **Reuse of an already-used token revokes the whole family** (theft signal). Logout revokes the family and clears cookies.
- **User loaded per request:** the middleware verifies the access token, then loads the user (role, active) by PK. Role is not trusted from the token, so role/grant changes and deactivation apply instantly. Cost: one PK lookup.
- **CSRF** (cookies make it a real concern): `SameSite=Strict` + same-origin deployment (nginx proxies `/api`, so no CORS at all) + an `Origin` check on unsafe methods (reject if present and not in `ALLOWED_ORIGINS`) + JSON-only bodies. Double-submit CSRF tokens rejected as extra code with no gain under strict same-origin.
- **Login hardening:** Argon2id, a dummy hash compare for unknown emails (no user enumeration by timing), identical error for bad email or password, rate limit 5/min per IP+email.
- **Alternatives:** Bearer token in memory (XSS-exposed, lost on reload, contradicts your requirement); server sessions in Postgres (simpler revocation, but you asked for JWT + refresh); RS256 (key management not justified for one service).
- **Trade-offs / risks:** Parallel refreshes (two tabs, concurrent 401s) can look like reuse. Mitigation: single-flight refresh in the client plus `navigator.locks` across tabs. Residual risk documented. HS256 means API signs and verifies with the same secret, acceptable for a single service.
- **Verification:** Tests: expired access → 401; refresh rotates; replayed refresh revokes family; no `Set-Cookie` without `HttpOnly`; no token in JSON bodies or logs; cross-origin unsafe request rejected.
- **Review questions:** Why not localStorage? How do you handle CSRF? What happens if a refresh token leaks? How do you log out everywhere?

### ADR-007 — Duplicate detection
- **Decision:** On create, find rows whose normalised text (`btrim(regexp_replace(lower(text), '[^[:alnum:]]+', ' ', 'g'))`, the expression in `question_text_trgm_idx`) is similar to the normalised submitted text, **among rows visible to the submitter**. Query shape: `<expr> % $1 AND similarity(<expr>, $1) >= 0.6`. The `%` operator is the GIN-indexable prefilter (it uses `pg_trgm.similarity_threshold`, default 0.3, so it is deliberately looser); the `similarity() >= 0.6` predicate applies the real threshold (config constant). Top 5 by similarity. Hit → `409 DUPLICATE_SUSPECTED` with matches, nothing stored, audit `DUPLICATE_REJECTED`. Resubmit with `confirmNotDuplicate: true` → stored, audit `DUPLICATE_OVERRIDDEN` (records the override and matched IDs).
- **Problem:** §3.6 undefined rule, undefined false-positive behaviour.
- **Reasoning:** Trigram handles reordering/typos in short strings and is index-backed (GIN `gin_trgm_ops` with the `%` operator). Visible-rows-only is mandatory (IMP-04).
- **Alternatives:** Exact-match only (misses near-duplicates); embeddings (needs model, pgvector, overkill); Levenshtein (not indexable); a unique constraint (leaks).
- **Trade-offs:** Semantic duplicates ("explain closures" vs "what is a JS closure") are missed. A user cannot be warned about a duplicate of a restricted question they cannot see (accepted, A16). Threshold is tuned on seed data; I will report precision on a small labelled sample rather than claim accuracy.
- **Verification:** Tests: exact, reordered, typo, and clearly different text; override path; restricted near-duplicate is silently accepted for an unpermitted submitter.
- **Review questions:** How is duplicate detection implemented, and what happens on a false positive? Why 0.6?

### ADR-008 — Single audit table
- **Decision:** `audit_event(id, type, actor_id, at, question_id NULL, payload JSONB)`; types `QUESTION_CREATED`, `QUESTION_UPDATED`, `DUPLICATE_REJECTED`, `DUPLICATE_OVERRIDDEN`. Written in the **same transaction** as the change. Every event also emits a pino log line. A question's history is `audit_event WHERE question_id = $id`, only after the visibility check on the question.
- **Reasoning:** One mechanism covers §3.7, the "rejected duplicate" trace (§6), and the §8 "suggested edit" idea without a parallel table.
- **Alternatives:** `question_history` per-question snapshots only (cannot hold rejected duplicates); DB triggers (hides logic, no actor identity without session variables); event sourcing (overkill).
- **Trade-offs:** JSONB payload is less strictly typed; Zod-validated on write.
- **Verification:** Test asserts row + log line for each event type; transaction rollback leaves no orphan event.

### ADR-009 — Frontend: minimal, strong UX
- **Decision:** React 19, Vite, React Router, TanStack Query, React Hook Form + Zod, Tailwind, native elements. No global client-state library.
- **UX commitments (testable):** filters and keyword live in the URL (shareable/back-button safe); debounced search (300 ms) with `keepPreviousData` so the list does not flash; skeleton rows, explicit empty state ("No questions match" with a clear-filters action), and error state with retry; duplicate warning as a `<dialog>` showing the matches with "Edit my question" and "It's different, submit anyway"; inline field errors from Zod; focus returns to the trigger on dialog close; all controls keyboard-operable with visible focus; layout works at phone width; read-only users see no edit controls (cosmetic only, API enforces).
- **Auth in UI:** React Query `auth/me` is the single source of truth. A fetch wrapper does one single-flight `/auth/refresh` on 401, retries once, otherwise routes to login. `credentials: 'same-origin'`; nothing written to browser storage.
- **Alternatives:** Next.js (ADR-002); MUI/shadcn (dependency weight for ~6 screens); Redux (no client state to manage).
- **Verification:** Component tests for the filter panel, duplicate dialog and login; `axe` check on main screens; optional one Playwright flow.

### ADR-010 — Docker topology
- **Decision:** Compose services: `db` (postgres:17, volume, `pg_isready` healthcheck), `api` (waits for healthy db, runs `prisma migrate deploy`, seeds if empty, then starts), `web` (nginx: static build + `location /api` → `http://api:4000`). Host ports: web **3000**, api **4000**, db **5436** (avoids clashing with a local Postgres on 5432). Services talk by service name (`db`, `api`), never `localhost`. Dev loop: `docker compose up db` + `npm run dev` for api/web.
- **Why nginx proxy:** it gives the browser a single origin, which is what makes `SameSite=Strict` cookies and "no CORS" (ADR-006) work in Docker.
- **Verification:** clean-clone run; healthchecks; `docker compose down -v` reset documented (destructive, called out).

### ADR-011 — Testing strategy
- **Decision:** Pyramid weighted to API integration tests on real Postgres: unit tests for pure logic (tag parsing, normalisation, token helpers), integration tests for everything security-relevant, a few component tests, one optional E2E. Each test file truncates and reseeds a minimal fixture; global setup applies migrations to `qb_test`.
- **Isolation:** Vitest runs test files in parallel by default; a shared `qb_test` database would be flaky, so integration files run serially (option name to verify for Vitest 5) with truncate per file.
- **Non-negotiable tests:** SEC-04 (parameterised: keyword only, tag filter only, keyword + tags, `clientId` filter, offset past end; each with a no-match control and a permitted-user positive control), IMP-01/02 per read path, AUTH-03 matrix (3 roles × own/other × direct-by-ID), SEC-01 validation (assert the service was not called), SEC-02 route sweep, AUD-01, refresh-rotation/reuse.
- **SEC-04 mechanics:** keyword `zebrafish-xyz` exists only in client-X questions. Unpermitted user searches it; the same user searches `qqqq-nomatch`. Assert status, headers (minus `Date`, `X-Request-Id`), and body deep-equal. Then the permitted user searches the first keyword and must see the question, which proves the zero is not vacuous.
- **Limit:** does not cover timing side channels (A15).
