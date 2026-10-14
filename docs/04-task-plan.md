# Stage 4 — Task Breakdown and Roadmap

Status: **DRAFT. Awaiting your approval before any code is written.**
Complexity: S ≈ <½ day, M ≈ ½–1 day, L ≈ 1–2 days (midpoints 0.25 / 0.75 / 1.5).

**Honest budget check.** Summing midpoints: core backend + docs (T-01–T-18, T-20, T-26, T-27) ≈ 15 days; UI (T-19, T-21, T-22) ≈ 4 more; extras (T-23–T-25) ≈ 1.5 more. That is ≈ 20 working days human-paced. The brief says "2-week solo", which I read as 10 working days. **The full plan does not fit 10 days without cuts or without leaning on generated code (which compresses typing, not understanding or verification).** See "Scope cuts" below, and tell me the real budget.

Requirement IDs refer to `01-requirements-analysis.md`.

## Tasks

| ID | Task | Reqs | Depends | Files / modules | Acceptance | Tests | Pri | Cx | You should understand |
|---|---|---|---|---|---|---|---|---|---|
| T-01 | Repo init, npm workspaces (`apps/api`, `apps/web`), TS strict, ESLint/Prettier, `.gitignore`, `.env.example` | OPS-01 | — | root configs | `npm run lint` and `typecheck` pass on empty apps | CI job | High | S | Workspaces, strict TS |
| T-02 | `compose.yaml` with `db` only, healthcheck, volume, port 5436 | OPS-01 | T-01 | `compose.yaml` | `docker compose up db` healthy; `psql` connects | manual | Critical | S | Healthchecks, volumes, service names |
| T-03 | **Spike:** Prisma 7 setup + hand-written migration for `pg_trgm`, `search_tsv`, GIN indexes; prove `migrate dev` + `migrate diff` show no drift | FR-04, FR-05 | T-02 | `prisma/` | Decision recorded in ADR-003 with evidence. **Fallback if drift cannot be eliminated:** hand-written SQL migrations applied only with `migrate deploy` (never `migrate dev` after the first one), plus a CI/test check against `pg_indexes`/`information_schema` that the search and trigram indexes and `search_tsv` exist | `migrate diff` empty (or fallback check green); apply on fresh DB | Critical | M | Prisma migration model, shadow DB, `Unsupported` |
| T-04 | Full schema (§4 of Stage 3) + migrations | FR-02, FR-08, FR-15 | T-03 | `schema.prisma`, migrations | Fresh DB migrates; constraints present | schema test (unique, FK, CHECK) | Critical | M | M:N modelling, indexes |
| T-05 | API Dockerfile (bookworm-slim, non-root), entrypoint runs `migrate deploy` then seed-if-empty, compose `api` service; `COOKIE_SECURE=false` by default for local http (Safari drops `Secure` cookies on http://localhost); **Docker command catalogue** | OPS-01 | T-04 | `apps/api/Dockerfile`, `compose.yaml`, `docs/docker.md` | `docker compose up` brings api healthy | clean-clone run | Critical | M | Image layers, readiness, networking |
| T-06 | API foundation: Zod env config, pino + request ID, error handler (uniform shape), `/health`, graceful shutdown | SEC-01 | T-01 | `config/`, `http/` | Bad env fails fast; errors never leak stack | unit + supertest | High | M | Express 5 error flow |
| T-07 | Seed: deterministic 5,000 questions, 2 clients, grants, roles, named marker fixtures | NFR-01, FR-08 | T-04 | `prisma/seed.ts` | Idempotent guard; counts match | seed test | High | M | Seeding strategy |
| T-08 | **Test harness:** `qb_test` DB, global migrate, **files run serially** (Vitest file-parallelism off; option name to verify for v5) with truncate per file, fixture builders, `loginAs(role)` that mints cookies via the T-09 token helper | AUTH-03 | T-04, T-06, T-09 | `test/` | Isolated, repeatable runs | self-test | Critical | M | DB isolation |
| T-09 | Auth: login (Argon2id, uniform errors, dummy hash), cookie issue, `/auth/me`, auth middleware (load user by PK) | SEC-02 | T-06, T-04 | `modules/auth` | Cookies httpOnly/Strict; no token in body | login/me tests, cookie-flag test | Critical | L | JWT, cookies, Argon2 |
| T-10 | Refresh rotation + reuse detection + logout; `csrfOrigin` middleware | SEC-02 | T-09 | `modules/auth`, `http/` | Replay revokes family; bad Origin rejected | auth tests (ADR-006 list) | Critical | M | Token families, CSRF |
| T-11 | `validate()` middleware + Zod schemas; `tagParser` (`category:value`, group by category) | SEC-01 | T-06 | `http/validate.ts`, `modules/tags` | Empty text, unknown category, no-auth rejected before service | validation tests with service spy | Critical | M | Trust boundaries |
| T-12 | **Write SEC-04 and IMP-02 tests first (red)**, then `question.repo.ts` search + visibility predicate; `GET /questions` | FR-03..07, SEC-04, IMP-01, IMP-02, IMP-08, FR-17 | T-07, T-08, T-09, T-11 | `modules/questions/*` | Zero-match indistinguishable; positive control passes; combined filter+keyword correct | **SEC-04 parameterised** over: keyword only; tag filter matching only restricted rows; keyword + tags; `clientId` filter; offset past end. Each compares the unpermitted response (status, headers minus `Date`/`X-Request-Id`, body) to a genuine no-match control, plus a permitted-user positive control. Also filter, keyword, pagination tests | **Critical** | L | The core of the POC |
| T-13 | `GET /questions/:id`, `GET /tags`, `GET /clients` under visibility | FR-16, FR-18, IMP-01 | T-12 | routes | Invisible ≡ nonexistent | per-path tests | High | S | |
| T-14 | `POST /questions` (tags, client grant check, audit `QUESTION_CREATED` in one tx) | FR-01, FR-02, FR-15, IMP-05 | T-12 | service, repo, `audit.repo` | `clientId` set only here, requires a grant (ungranted ≡ nonexistent → 404). Tx rolls back whole write on failure | create tests, tx rollback test | Critical | M | Prisma `$transaction` + raw |
| T-15 | Duplicate detection + override + `DUPLICATE_REJECTED/OVERRIDDEN` audit + tune threshold on seed | FR-12..14, IMP-04, AUD-01 | T-14 | repo, service | 409 with matches; override stores; restricted near-dup accepted silently | dup tests incl. restricted | High | M | pg_trgm, `similarity` |
| T-16 | `PATCH /questions/:id` + role/ownership rules + `QUESTION_UPDATED` diff audit + `GET .../history` | FR-09..11, FR-15, IMP-03, IMP-05, AUTH-03 | T-14 | service, routes | Matrix correct; invisible → 404 before 403; **`clientId` is immutable: PATCH containing it → 400** | **AUTH-03 matrix** (3 roles × own/other, by ID) + immutable-client test | Critical | M | AuthZ vs AuthN |
| T-17 | Hardening: helmet/CSP, rate limits (login, search) with `trust proxy` set so limits key on the real client IP behind nginx, route-sweep 401 test, no-secret-in-logs test, architecture-guard test (scoped to `src/`, excluding `prisma/seed.ts` and test fixtures), ban `$queryRawUnsafe` | SEC-02, ADR-005 | T-16 | middleware, `test/guard` | All pass | sweep, guard, log-redaction tests | High | M | OWASP mapping |
| T-18 | Audit assertions: row + structured log for all 3 event types | AUD-01 | T-15, T-16 | tests | Who/when present | log-capture test | High | S | |
| T-19 | Web scaffold (Vite, Router, Query, Tailwind), `apiFetch` w/ single-flight refresh, login page, auth guard, nginx conf (forwards `X-Forwarded-For`), `web` Docker service; verify rate limit and cookies **through :3000**, not only :4000 | OPS-01, SEC-02 | T-10, T-05 | `apps/web` | Login works through :3000; no browser storage used | component test + manual check of Application tab | High | M | Same-origin proxy, cookie flow |
| T-20 | Perf: `EXPLAIN (ANALYZE, BUFFERS)` of combined query at 5k (and 10k ◇); document plan, adjust indexes only with evidence | NFR-01, O-01 | T-12 | `docs/perf.md` | Index scans; measured p95 reported honestly | timing script | High | M | Reading query plans |
| T-21 | UI: list with FilterPanel, debounced search, URL state, skeleton/empty/error, pagination | FR-03..06, FR-17 | T-19, T-12 | `features/questions` | Behaviours in ADR-009 | component tests | High | L | Server-state UX |
| T-22 | UI: create/edit form, DuplicateDialog, detail + history, read-only mode for USER | FR-01, FR-12..16 | T-21, T-16 | `features/questions` | Dup dialog flow; edit hidden for others | component tests | High | L | Forms, focus management |
| T-23 | A11y pass (axe on main screens, keyboard walk, 360px width) ◇ | NFR | T-22 | UI | No axe violations on 3 screens | axe test | Medium | S | WCAG basics |
| T-24 | GitHub Actions: lint, typecheck, test with Postgres service, `npm audit` | R-07 | T-17 | `.github/workflows` | Green on push | CI run (needs your GitHub repo) | Medium | S | CI |
| T-25 | Playwright golden-path spec ◇ | E2E | T-22 | `e2e/` | login → search → add dup → override | e2e | Low | M | |
| T-26 | Docs: README, API table, ADR finalisation, walkthrough script mapped to brief §7 Q1-3, security review, known limitations | all | T-22 | `README.md`, `docs/` | Another person can run it from README | clean-clone follow-through | High | M | Explaining decisions |
| T-27 | Final verification: traceability report with real results, clean-clone `docker compose up`, `down -v` reset | OPS-01, all | all | `docs/verification.md` | Each requirement marked verified / not verified with evidence | full test run | Critical | M | |

## Critical path

T-01 → T-02 → **T-03** → T-04 → T-06 → T-09 → T-08/T-07/T-11 → **T-12** → T-14 → T-15/T-16 → T-17 → T-26 → T-27. T-12 is the make-or-break; T-03 is the biggest technical risk.

## Scope cuts (MoSCoW) — proposed order if the budget is 10 days

| Tier | Tasks | Note |
|---|---|---|
| Must | T-01–T-18, T-20 (5k only), T-26 (lean), T-27 | This is what the brief grades. Backend-first; UI never starts before T-17 is green. |
| Should | T-19, T-21, T-22 | UI reduced to: login, list+filters+search, create form with duplicate dialog, detail+history. Edit form shares the create form. |
| Could (cut first, in this order) | T-25 Playwright → T-24 CI → T-23 a11y pass → 10k perf run | Cut from the bottom of this row up. Accessibility basics (labels, keyboard, semantics) are still built into T-21/T-22. |

## Suggested calendar (assumes the Must + Should tiers, generated code reviewed by you)

| Days | Tasks |
|---|---|
| 1 | T-01, T-02, T-03 |
| 2 | T-04, T-06, T-05 |
| 3–4 | T-09, T-10, T-11, T-07, T-08 |
| 5–6 | **T-12**, T-13 |
| 7 | T-14, T-15, T-16 |
| 8 | T-17, T-18, T-20 |
| 9–10 | T-19, T-21, T-22 |
| 11–12 | T-26, T-27, plus any Could tasks |

That is 12 days, i.e. 2 over a 10-day budget; trimming the UI to the minimum above and writing docs incrementally (each task updates its docs) is the recovery plan. If the budget is a hard 10 days, tell me and I will drop the UI to a read-mostly list + create form.

## Git strategy

Trunk-based, `main` protected by convention. One short branch per task (`feat/T-12-visibility-search`), squash merge, conventional commit messages (`feat(search): enforce client visibility in query`). Never commit `.env`. Tag `poc-v0.1` at T-27. Repo is not initialised until you approve this plan.

## Per-task working agreement (Stage 5)

For each task I will give: objective + req IDs, design/alternatives, files, complete code, key-section explanation, run commands, tests, manual verification, traceability update. I will run the tests myself and show real output. Anything I could not run (e.g. CI needing your GitHub repo) will be labelled **unverified**.

## Open items and risks

| Item | Status |
|---|---|
| Prisma 7 driver-adapter setup and migration drift | Unverified; resolved by T-03 |
| Zod 4 / Vitest 5 / Vite 8 are new majors relative to common tutorials; API differences possible | Pin and read changelogs at install time |
| Plan has ~0 slack; ◇ tasks are cuttable | Tell me if the deadline is tighter than 2 weeks |
| Refresh-token race across tabs | Mitigated, residual risk documented |
| Your account needed: GitHub repo (for CI/PR only) | Not blocking until T-24 |

## Traceability: requirement → task → verification

| Requirement | Task(s) | Verified by |
|---|---|---|
| FR-01, FR-02 | T-04, T-14 | create tests, schema test |
| FR-03, FR-04, FR-06 | T-12, T-20 | filter tests, EXPLAIN |
| FR-05 | T-12 | keyword test (notes-only match) |
| FR-07, FR-08, SEC-04, IMP-01, IMP-02, IMP-08 | T-04, T-07, T-12, T-13 | parameterised SEC-04, per-path tests |
| FR-09, FR-10, FR-11, AUTH-03, IMP-03 | T-16 | 3-role × own/other matrix by ID |
| FR-12, FR-13, FR-14, IMP-04 | T-15 | duplicate tests incl. restricted near-dup |
| FR-15, AUD-01, IMP-07 | T-14, T-15, T-16, T-18 | audit row + log assertions |
| FR-16 | T-13, T-16 | detail/history tests |
| FR-17 | T-12 | pagination tests |
| FR-18 | T-13 | tags test |
| IMP-05 | T-14 (clientId set on create only, immutable after, T-16) | grant + immutability tests |
| IMP-06, SEC-01 | T-11 | validation tests with service spy |
| SEC-02 | T-09, T-10, T-17 | route-sweep test |
| NFR-01 | T-07, T-12, T-20 | seeded 5k, query plan |
| OPS-01 | T-02, T-05, T-19, T-27 | clean-clone `docker compose up` |
| R-01 (Zod) | T-11 | validation tests |
| R-02 (Argon2id + JWT) | T-09, T-10 | auth tests |
| R-03 (helmet, rate limit) | T-17 | header + 429 tests |
| R-04 (pino) | T-06, T-18 | log tests |
| R-05 (RLS) | deferred (ADR-005) | not built |
| R-06 (OpenAPI) | dropped; API table in docs (T-26) | n/a |
| R-07 (CI) | T-24 (Could) | CI run (needs your GitHub repo) |
| R-08 (UI) | T-19, T-21, T-22 | component tests, manual |
| O-02 (second client) | T-07 (seed has 2 clients) | cross-client SEC-04 variant |
| O-01, O-03 | O-01 partial via T-20 at 10k (Could); O-03 not planned | |
