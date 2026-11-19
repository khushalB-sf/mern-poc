# Security review and red-team report

Scope: the API (`apps/api`), the web app (`apps/web`), `compose.yaml`, `nginx.conf`, dependencies.
Method: read the code, then try to break it. Every attack is a test that asserts the **secure** behaviour. A test that failed on the old code is a confirmed finding; it was fixed with the smallest change and the test stays as a regression guard (TDD). Live probes were also sent to the running local stack.

Attack suites: `apps/api/test/security.auth.test.ts`, `security.access.test.ts`, `security.input.test.ts`, `security.http.test.ts`, `apps/web/test/security.xss.test.tsx`. Pure logic: `apps/api/test/unit.test.ts`, `apps/web/test/dropdown.test.tsx`. Run with `npm test -w @qb/api` and `npm test -w @qb/web`; coverage with `npm run test:cov -w @qb/api` (or `-w @qb/web`).

## Result in one table

| ID | Severity | Finding | Evidence (test) | Status |
|---|---|---|---|---|
| R1 | High | Login rate limit was per IP **and email**, so trying a different email each time was unlimited: credential stuffing, and every guess costs an Argon2 hash (CPU/memory DoS) | `A1 login flood` | **Fixed**: second limiter per IP across all emails (`RATE_LIMIT_LOGIN_IP_PER_MIN`, default 30) |
| R2 | High | `trust proxy 1` hard-coded, so a client reaching the API port directly chose its own rate-limit key with `X-Forwarded-For` | `A2 X-Forwarded-For spoofing` | **Fixed**: `TRUST_PROXY` (default 0); compose sets 1 for nginx |
| R3 | High | Postgres (5436) and the API (4000) were published on every interface, bypassing nginx and its headers | `docker ps`, `compose.yaml` | **Fixed**: both bound to `127.0.0.1`; only the web port is public |
| R4 | High | Two admins demoting/deactivating/deleting each other at the same moment left **zero admins** (each request passed its own check) | `A8 last admin` | **Fixed**: active admins locked (`FOR UPDATE`, id order) and counted in the transaction, `409 LAST_ADMIN` |
| R5 | Medium | A NUL byte (`\u0000`) in any string (search, question, notes, names) reached Postgres and became an unhandled **500** | `C1`, `C3` NUL tests | **Fixed**: one gate (`http/nul.ts`) returns `400` for any NUL in body or query |
| R6 | Medium | A validly signed token with a non-UUID subject (or refresh `jti`/family) caused a database error (**500**) instead of 401 | `A3 not a UUID` | **Fixed**: ids validated at the token boundary (`tokens.ts`) |
| R7 | Medium | Authenticated, per-user JSON had no `Cache-Control`, so browsers and shared caches could store and replay it (back button after logout, proxy caches) | `D1` | **Fixed**: `Cache-Control: no-store` on `/api` (API and nginx) |
| R8 | Medium | Seeding demo accounts with the published default password was allowed on an https (`COOKIE_SECURE=true`) deployment | `A7` | **Fixed**: the API refuses to start (same pattern as the dev-only JWT secret guard) |
| R9 | Medium | Swagger (the whole API contract) defaulted to **on in production** | `D5` | **Fixed**: default is off when `NODE_ENV=production`; `.env.example` turns it on for the local demo |
| R10 | Medium | Runtime dependency advisories: `body-parser` (high), `qs`, `fast-uri` | `npm audit` | **Fixed** with a non-forced `npm audit fix` (lockfile only); all tests re-run |
| R11 | Low | nginx advertised its version and accepted unbounded request bodies | `nginx.conf` | **Fixed**: `server_tokens off`, `client_max_body_size 200k` (config verified with `nginx -t`) |
| R12 | Medium | An access token kept working after logout until it expired (up to 15 minutes): it was stateless and not tied to a session | `A3 an access token dies with its session` (was `it.fails`) | **Fixed**: the token carries the session id (`sid`, the refresh-token family) and each request checks that session is still live, in the same query that loads the user |
| G2 | Low | Remaining `npm audit` items are the Prisma CLI's transitive `deepmerge-ts`/`mysql2`/`@prisma/config`. `--force` would downgrade Prisma to 6 | `npm audit` | **Accepted**, re-check when Prisma 7 ships a patch |

## What I tried that did NOT work (verified secure, kept as regression tests)

- **Authorization sweep (BFLA):** every `/api/admin/*` route in the manifest: anonymous 401, every non-admin role 403, admin passes the gate. Authors/reviewers/readers cannot create, edit others' questions, review (incl. their own), promote themselves, or grant themselves departments.
- **Existence oracles:** a question or department you may not see is byte-identical to one that does not exist on GET, history, PATCH, DELETE, review, create, search-by-department. The duplicate check never reveals a restricted question. Other teams' departments and technologies are never listed.
- **Mass assignment:** `status`, `authorId`, `id`, `deletedAt`, `archivedAt`, `clientId` (on edit), `client` are rejected with 400 on questions and admin bodies (strict schemas).
- **Soft-delete leaks:** deleted questions/departments/users and archived technologies are gone on every read path, even for admins; sessions of deleted users die; restore routes are admin-only and only for things actually deleted; restoring a department does not widen anyone's access.
- **Tokens:** `alg=none`, wrong secret/issuer/algorithm, refresh used as access (and the reverse), tampered subject, replayed refresh token (family revoked), password reset / deactivate / delete revoke refresh families at once.
- **CSRF:** `Origin: null`, other port/scheme, look-alike hosts, upper-cased origin, method-override headers.
- **Injection:** SQL and tsquery payloads in search (`'; DROP TABLE`, `pg_sleep`, operators), query-parameter abuse (negative/huge/duplicate/array/`__proto__`), prototype pollution, deep JSON, oversized bodies (413), wrong content types, log forging with newlines/escape codes.
- **XSS (browser):** question text/notes/review notes, history actors, user, department and technology names are rendered as text in list, detail, history, admin pages and dialogs; no `javascript:` links; no tokens in `localStorage`/`sessionStorage`; a `?from=` style parameter cannot redirect off site.
- **Errors and headers:** no stack/SQL/path leakage in any error body, generic 500, helmet headers, no `X-Powered-By`, no CORS headers for foreign origins, request ids generated server-side.
- **Secrets:** `.env` is git-ignored; a scan of git history found no committed keys or tokens (only the documented dev-only placeholders in `.env.example`).

## Live probes (local dev stack, before/after the fixes)

| Probe | Before | After |
|---|---|---|
| 8 logins, one email, rotating `X-Forwarded-For` (limit 5/min) | all allowed (limiter reset each time) | 5 x 401 then 429 |
| 36 logins, 36 different emails from one IP | all allowed | 429 after 30 |
| `Cache-Control` on `/api/*` | absent | `no-store` |
| Cross-origin preflight | no CORS headers | no CORS headers |
| `POST` with `Origin: https://evil.example` | 403 | 403 |
| Published ports (`docker ps`) | `0.0.0.0:5436`, `0.0.0.0:4000` | config now `127.0.0.1` (applies when the stack is recreated with `docker compose up -d`) |

## Loopholes and the better approach (ranked), with status after the follow-up round

Status key: **Done** = built and covered by a test; **Open** = not done. Where a test could not prove it (needs real infrastructure) the status says what was and was not run.

1. **Admin is one super-role (Medium).** Deleting a department, resetting passwords and promoting users need one account. Better: MFA (TOTP/WebAuthn) for admins, and a second approver (or at least an email notification) for destructive admin actions. The audit log already records them.
   **Status: Open.** Two-factor sign-in (TOTP) was built and then removed at the project owner's request, so admins sign in with a password only. The second approver for destructive admin actions was not built. Mitigation that exists: every admin action is in the append-only audit trail, and the last active admin cannot be removed or demoted.**
2. **Audit log is writable by the app (Medium).** `audit_event` can be edited or deleted with the application's database role. Better: grant only `INSERT`/`SELECT`, or add a trigger that rejects `UPDATE`/`DELETE`; ship the stream to an external log store.
   **Status: Done.** A database trigger refuses `UPDATE` and `DELETE` on `audit_event` (`audit.immutable.test.ts`); admins can browse and export the trail. Shipping it to an external log store is not done.**
3. **Review-queue flooding (Medium).** Any author can submit up to the API rate limit per minute, burying reviewers. Better: a per-author quota of pending questions and a daily cap, with the existing duplicate check as the first filter.
   **Status: Open.** No per-author quota. Reviewers do get a queue count, and the duplicate check runs on create and edit.**
4. **Passwords (Medium).** Length 8 is the only rule, and the demo password is public. Better: minimum 12, check against a breached-password list (k-anonymity API or a local list), force change on first login for admin-created accounts.
   **Status: Open.** A stronger password policy and a forced change were built and then removed at the project owner's request: the rule is again a minimum of 8 characters (12 for `ADMIN_PASSWORD`), set by admins, and the demo password remains public unless the demo seed is off.**
5. **Rate limits are per process and in memory (Low until scaled out).** Better: a shared store (Redis) and `limit_req` in nginx for `/api/auth/` as a second layer.
   **Status: Done, behind config.** `REDIS_URL` moves the counters to Redis (verified with a real Redis: two app instances share one allowance, and requests pass when Redis is unreachable). The nginx `limit_req` second layer is not done.**
6. **Database hardening (Low).** Add `statement_timeout` (stops a pathological search holding a connection), `sslmode=require` if the database is ever off-host, a least-privilege database role for the API (no DDL), and row-level security later (deferred in ADR-005).
   **Status: Partly done.** `statement_timeout` is set (`DB_STATEMENT_TIMEOUT_MS`, tested). `sslmode`, a least-privilege database role and row-level security are not done.**
7. **Retention (Low).** Expired refresh tokens are never purged (table grows); soft-deleted users keep their email forever. Better: a nightly purge job and an anonymisation step for erasure requests.
   **Status: Partly done.** A purge job removes expired and revoked refresh tokens (tested). Anonymisation of deleted users is not done.**
8. **Container supply chain (Low).** `prisma` (CLI) is a runtime dependency only to run migrations. Better: run migrations from a separate build stage so the CLI and its vulnerable transitive packages are not in the runtime image.
   **Status: Done.** Migrations run in a separate `migrate` image target; the built API image was inspected and has no Prisma CLI. The four high advisories that remain in `npm audit` are in the CLI's tooling.**
9. **CI (Low).** No pipeline yet. Better: run `npm test`, `npm audit --omit=dev`, lint and a secret scan on every push (the suites here run in about 40 seconds).
   **Status: Written, not yet run on GitHub.** `.github/workflows/ci.yml` runs lint, type-check, formatting, tests, builds, `npm audit` (fails on critical) and the E2E job; each step was run locally.**

## Test inventory and coverage

Counts change with every commit, so run the suites rather than trusting a number here: `npm test -w @qb/api`, `npm test -w @qb/web`, `npm run e2e -w @qb/web`. At the time of the first security round the API had 278 tests and the web 156; the API coverage was 98.9% statements / 95.0% branches and the web 93.6% / 87.8% (`npm run test:cov`, excluding seed, server entry and the generated client).

Kinds of test now in the repo: unit (no database), integration (supertest against the isolated `qb_test` database, no mocks), the attack suites (`security.*.test.ts`), property tests (`fast-check`), an OpenAPI contract test, mutation testing (Stryker) and end-to-end tests in real Chromium (own database and ports).
