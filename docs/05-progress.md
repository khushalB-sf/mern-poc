# Progress log

| Task | Status | Evidence |
|---|---|---|
| T-01 repo, workspaces, TS strict, ESLint, Prettier | Done | `npm run lint`, `npm run typecheck`, `prettier --check` all pass |
| T-02 compose `db` | Done | `docker compose up -d db` → healthy; Postgres 17.11; host port **5436** (5432-5435 are used by other local containers) |
| T-03 Prisma spike | Done | Generated columns drift; expression indexes do not. See ADR-003 |
| T-04 schema + migration | Done | 9 tables, `prisma migrate diff` empty, CHECK/FK/unique verified by hand in psql (rolled back); **automated schema test still to write in T-08** |
| T-06 API foundation | Done | 16 vitest tests pass: env validation (no secret echo, dev-only placeholder guard), uniform error shape, no stack/DB-detail leaks, own X-Request-Id, helmet headers, cookie/authorization never logged, `/api/health` 200/503. `npm run lint` + `typecheck` clean |
| T-05 API Dockerfile + compose `api` | Done (web service added in T-19) | Image builds; `api` healthy; migrations auto-apply; a throwaway second Compose project started from an empty DB, migrated, seeded and went healthy, then was removed with only its own volume. Commands in `docs/docker.md` |
| T-06 API foundation | Done | env validation, uniform errors, request ids, helmet, redaction, `/api/health` |
| T-07 Seed | Done | 7 users, 2 clients, 5,004 unique questions (~10% client-restricted), 2.0-4.2 s; runs on start when `SEED_ON_START=true` and DB empty; refuses to reseed a non-empty DB |
| T-08 Test harness | Done | `qb_test` auto-created and migrated by vitest globalSetup; per-file truncate refuses non-`_test` DBs; files run serially; fixture world with 8 users in every role/grant combination |
| T-09 Auth | Done | 44 tests (see below) |
| T-10 Refresh rotation + CSRF origin check | Done | rotation, family revoke on replay, atomic single-use (concurrent refresh: exactly one wins), logout, Origin allow-list |
| T-11 Validation + tag parser | Done | Zod strictObject query schema; unknown category/value/param, bad uuid, limits all 400 |
| T-12 Visibility search | Done | `question.repo.ts` is the only reader; visibility, filters, FTS and paging in SQL. SEC-04 parameterised over 7 query shapes x 4 unpermitted users, each compared (status, headers, body) with a genuine no-match control, plus permitted-user positive controls |
| T-13 get-by-id, tags, clients | Done | invisible == nonexistent 404 (identical status, headers, body); `/clients` lists only own grants; `/tags` global, no counts |
| T-14 … T-27 | Not started | |

**Test run (2026-10-14): 73 passed, 0 failed** (`npm test -w @qb/api`; lint, typecheck, prettier clean).
**Mutation check:** removing the visibility predicate from search fails 11 tests; removing it from get-by-id fails the IMP-02 test. Both restored, suite green again.

## Known issues
- **Disk full on the host** blocks all Docker work (see T-05).
- `npm audit --omit=dev` reports 4 high findings, all via the `prisma` CLI's transitive `deepmerge-ts` and `mysql2` (MySQL driver is unused here). `npm audit fix --force` would downgrade to Prisma 6, so it was not applied. Re-check when Prisma 7 ships a patched `@prisma/config`; document in the security review (T-26).
- Duplicate-detection performance (for T-15/T-20): on 5k seeded rows the planner picks a Seq Scan for the trigram `%` query (72 ms) although the GIN index answers it in 5.7 ms when forced (`enable_seqscan=off`), because it mis-estimates `%` selectivity. Plan: wrap the dup query in a transaction with `SET LOCAL enable_seqscan = off` and `SET LOCAL pg_trgm.similarity_threshold = 0.6`, then re-measure.
- `/api/questions` runs two statements (page + count) with the same WHERE instead of the "one statement" in the plan; both carry the visibility predicate. Done so `total` stays correct when the offset is past the end.
- Search ordering uses `ts_rank` only when a keyword is given; otherwise newest first.
