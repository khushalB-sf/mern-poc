# Progress log

| Task | Status | Evidence |
|---|---|---|
| T-01 repo, workspaces, TS strict, ESLint, Prettier | Done | `npm run lint`, `npm run typecheck`, `prettier --check` all pass |
| T-02 compose `db` | Done | `docker compose up -d db` → healthy; Postgres 17.11; host port **5436** (5432-5435 are used by other local containers) |
| T-03 Prisma spike | Done | Generated columns drift; expression indexes do not. See ADR-003 |
| T-04 schema + migration | Done | 9 tables, `prisma migrate diff` empty, CHECK/FK/unique verified by hand in psql (rolled back); **automated schema test still to write in T-08** |
| T-06 API foundation | Done | 16 vitest tests pass: env validation (no secret echo, dev-only placeholder guard), uniform error shape, no stack/DB-detail leaks, own X-Request-Id, helmet headers, cookie/authorization never logged, `/api/health` 200/503. `npm run lint` + `typecheck` clean |
| T-05 API Dockerfile + compose `api` | Done (web service added in T-19) | Image builds; `api` healthy; migrations auto-apply; a throwaway second Compose project started from an empty DB, migrated, seeded and went healthy, then was removed with only its own volume. Commands in `docs/docker.md` |
| T-07 Seed | Done | 7 users, 2 clients, 5,004 unique questions (~10% client-restricted), 2.0-4.2 s; runs on start when `SEED_ON_START=true` and DB empty; refuses to reseed a non-empty DB |
| T-08 Test harness | Done | `qb_test` auto-created and migrated by vitest globalSetup; per-file truncate refuses non-`_test` DBs; files run serially; fixture world with 8 users in every role/grant combination |
| T-09 Auth | Done | 44 tests (see below) |
| T-10 Refresh rotation + CSRF origin check | Done | rotation, family revoke on replay, atomic single-use (concurrent refresh: exactly one wins), logout, Origin allow-list |
| T-11 Validation + tag parser | Done | Zod strictObject query schema; unknown category/value/param, bad uuid, limits all 400 |
| T-12 Visibility search | Done | `question.repo.ts` is the only reader; visibility, filters, FTS and paging in SQL. SEC-04 parameterised over 7 query shapes x 4 unpermitted users, each compared (status, headers, body) with a genuine no-match control, plus permitted-user positive controls |
| T-13 get-by-id, tags, clients | Done | invisible == nonexistent 404 (identical status, headers, body); `/clients` lists only own grants; `/tags` global, no counts |
| T-14 Create question | Done | POST with tags, client grant check (ungranted == nonexistent), atomic with audit (trigger-forced failure rolls everything back) |
| T-15 Duplicate detection | Done | trigram >= 0.6 over *visible* rows; 409 with matches + `DUPLICATE_REJECTED` audit; `confirmNotDuplicate` override recorded; restricted near-duplicates neither flagged nor leaked |
| T-16 Edit + history | Done | AUTH-03 matrix (12 role/ownership/visibility cells, direct by ID); invisible -> 404 before 403; `clientId` immutable; history hides duplicate-override payloads |
| T-17 Hardening | Mostly done | architecture-guard test (+ proof the guard bites), route sweep (12/12 routes), per-user rate limit with no RateLimit headers (they would break SEC-04 indistinguishability), unsafe raw SQL banned. helmet/CSP, log redaction, login limit done earlier |
| T-18 Audit assertions | Done | row + structured log for created / updated / rejected duplicate / overridden, with actor and time |
| T-20 Perf | Partial | `docs/perf.md`: 19.5 ms combined / 1.3 ms filter at 5k rows, index use confirmed; 10k not done |
| API docs (Swagger UI) | Done | `/api/docs` + `/api/openapi.json` (OpenAPI 3.1). Request bodies generated from the Zod schemas; a test fails if any route is missing from the spec or the spec lists a route that does not exist. Page renders under the strict CSP (checked with headless Chrome). **Not verified in a browser:** the Try-it-out login-then-call cookie flow (server side covered by a same-origin test) |
| T-19 Web scaffold + nginx + `web` service | Done | Vite 8 / React 19 / Router 8 / TanStack Query 5 / RHF + Zod / Tailwind 4. nginx serves the build and proxies `/api` (single origin), unprivileged, strict CSP. Stack healthy; login, cookies, CSRF Origin check, search verified through `:3000` |
| T-21 List UI | Done | URL-synced filters and keyword (shareable, Back-safe), debounced search, removable filter chips, skeleton / empty / error / refreshing states, pagination, mobile filter sheet, restricted-question marking |
| T-22 Form / detail UI | Done | add + edit form (RHF + Zod, counters, inline and server field errors, focus to first error), duplicate dialog with side-by-side comparison and similarity bar, detail with history, role-aware controls, neutral not-found |
| T-23 Accessibility | Done | axe-core in unit tests (9 screen states) and in **real Chrome on the production build, light and dark, 8 screens each, incl. colour contrast: 0 violations**. Native dialog / fieldset / checkbox semantics, skip link, focus management, reduced motion respected. `eslint-plugin-jsx-a11y` could not be used (it does not support ESLint 10) |
| T-24 CI, T-25 Playwright | Not started (cuttable) | Real-browser checks were done with puppeteer-core scripts kept outside the repo |
| T-26 README / walkthrough | Partial | `README.md` (three ways to run, ports, config, troubleshooting) and `docs/docker.md` are written and the docs were reconciled with the code on 2026-10-16. **Not written:** the walkthrough script mapped to brief §7 (Q1-3), the security review, and final ADR wording |
| T-27 final verification | Not started | `docs/verification.md` (requirement-by-requirement traceability with results) does not exist; the clean-clone `docker compose up` check from the brief §6 has not been repeated end to end |

**Test run (2026-10-16, re-run for this review): API 154 passed, 0 failed. Web 62 passed, 1 FAILED.** Lint, typecheck and prettier clean. (On 2026-10-14 the web run was 63/63.)
The one failing web test is `test/login.test.tsx` "fills the email from a demo account … without touching the password". It still asserts the old behaviour: commit 0832f51 made the Demo accounts panel fill the password too (see Known issues), so the test needs updating, not the code. Not fixed as part of the docs pass.
**Mutation checks (each restored afterwards):** dropping the visibility predicate from search fails 11 tests and from get-by-id fails the IMP-02 test; dropping the edit-permission check fails 5; making the duplicate search see restricted rows fails 2; returning 403 instead of 404 for invisible edits fails 5.

## Known issues
- **Host disk space.** A full disk blocked Docker earlier (see T-05, `docs/docker.md`); Docker works now, but the host was at ~80% with ~3 GB free on 2026-10-16.
- `npm audit --omit=dev` reports 4 high findings, all via the `prisma` CLI's transitive `deepmerge-ts` and `mysql2` (MySQL driver is unused here). `npm audit fix --force` would downgrade to Prisma 6, so it was not applied. Re-check when Prisma 7 ships a patched `@prisma/config`; document in the security review (T-26).
- Duplicate-detection performance (for T-15/T-20): on 5k seeded rows the planner picks a Seq Scan for the trigram `%` query (72 ms) although the GIN index answers it in 5.7 ms when forced (`enable_seqscan=off`), because it mis-estimates `%` selectivity. **Done:** `findSimilarQuestions` runs in a transaction that sets `pg_trgm.similarity_threshold` to the rule's 0.6 and `enable_seqscan = off` locally (both via `set_config(..., true)`), with a `ponytail:` comment in `question.repo.ts`. Forcing the index is fine at 5k rows; revisit on a much larger table. The post-change timing was not re-measured (`docs/perf.md` still quotes the forced-index figure).
- `/api/questions` runs two statements (page + count) with the same WHERE instead of the "one statement" in the plan; both carry the visibility predicate. Done so `total` stays correct when the offset is past the end.
- Search ordering uses `ts_rank` only when a keyword is given; otherwise newest first.
- Two concurrent identical submissions can both pass the duplicate check (no DB unique constraint by design, IMP-04). Accepted; a later cleanup or reviewer pass handles it.
- The duplicate rule has a real false positive: "How would you design a cache in Node.js?" scores 0.64 against "...a rate limiter in Node.js?" and is flagged. Reordered words score 1.00 (trigram ignores order); a typo variant scores 0.74. The override path exists for exactly this.
- Duplicate check runs on create only, not on edit.
- Concurrent edits are last-write-wins (no version check).
- Web bundle is one 506 kB JS file (156 kB gzipped). Route-level code splitting would shrink the first load; not done.
- The Try-it-out cookie flow in Swagger is still untested in a real browser (UI login flow is).
- **Demo accounts panel now fills the password too** (changed in commit 0832f51; earlier it filled only the email and pointed to the README). The password (`DEMO_PASSWORD`, default `Passw0rd!demo`) is compiled into the web bundle whenever `VITE_SHOW_DEMO_ACCOUNTS` is true (build-time; default true in compose, and always on in `vite dev`). Acceptable for a local demo, wrong for anything shared: set it to `false`. `VITE_DEMO_PASSWORD` can override the default but is not passed through the Dockerfile or `compose.yaml`, so in Docker the one-click fill breaks if `SEED_PASSWORD` is changed.
- The login test for that panel still expects the old behaviour and fails (see the test run above).
- Not built, and not claimed anywhere as built: CI (T-24), Playwright (T-25), the 10k-row performance run, the §7 walkthrough script, the security review, `docs/verification.md`, Postgres RLS (deferred, ADR-005).
