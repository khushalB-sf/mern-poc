# Interview Question Bank

A shared, searchable bank of interview questions. Everything requires signing in (there is no anonymous access). Signed-in users can browse and search; authors add questions with answer notes and tags and edit their own (every new or edited question goes to review); reviewers approve or reject pending questions with a note; plain users are read-only and see approved questions only; admins can do everything: add, edit and delete users (reviewers included), departments (with a description) and any question. Deletes are soft: the record disappears from the app and its history is kept. Questions tied to a department (called a _client_ in the API and code) are visible **only** to people granted it (admins excepted), and that rule is enforced inside the database query, so a search never hints that a restricted question exists.

**Stack:** React 19 + Vite + Tailwind (UI) · Express 5 + TypeScript (API) · PostgreSQL 17 + Prisma 7 · Docker Compose · Vitest

## Quick start

```bash
cp .env.example .env                 # defaults work as-is for local use
docker compose up -d --build         # database + API + web
```

Open **http://localhost:3000** and sign in. The first start migrates the database and seeds about 1,500 questions.

| Name            | Account                          | Role                                                     |
| --------------- | -------------------------------- | -------------------------------------------------------- |
| Priya Sharma    | `priya.sharma@mailinator.com`    | Admin, sees all questions, manages users and departments |
| Aarav Mehta     | `aarav.mehta@mailinator.com`     | Author in MERN and MEAN                                  |
| Sofia Rossi     | `sofia.rossi@mailinator.com`     | Author in Python and AI-ML                               |
| Daniel Okafor   | `daniel.okafor@mailinator.com`   | Author in Data Engineering and DevOps                    |
| Isabella Nguyen | `isabella.nguyen@mailinator.com` | Author in every department                               |
| Chloe Martin    | `chloe.martin@mailinator.com`    | Author, no department access                             |
| Rohan Verma     | `rohan.verma@mailinator.com`     | Reviewer for MERN and MEAN                               |
| Hannah Schmidt  | `hannah.schmidt@mailinator.com`  | Reviewer for every department                            |
| Emma Brooks     | `emma.brooks@mailinator.com`     | Read-only user in MERN                                   |
| Lucas Meyer     | `lucas.meyer@mailinator.com`     | Read-only user in Python                                 |
| Noah Fischer    | `noah.fischer@mailinator.com`    | Read-only user, no department access                     |

The addresses are on [Mailinator](https://www.mailinator.com), a public inbox service, so they look real but anyone can read their mail. That is fine for demo data and wrong for real accounts. All demo users share `SEED_PASSWORD`.

Departments: MERN, MEAN, Python, AI-ML, Data Engineering, DevOps. Each department's questions use only its own technologies (a MERN question never mentions Spark); about 15% of questions are global (behavioural and general engineering) and visible to everyone.

Password for all of them: `Passw0rd!demo` (the `SEED_PASSWORD` in `.env`). These are demo accounts for local use only.

The login page has a **Demo accounts** panel that fills in both the email **and the password** with one click. That password is compiled into the web bundle, so the panel is for local demos only: set `VITE_SHOW_DEMO_ACCOUNTS=false` for anything shared. The panel always uses the default `Passw0rd!demo`; if you change `SEED_PASSWORD`, the one-click fill will no longer log in (type the password instead). The `VITE_DEMO_PASSWORD` override that the code reads is not passed through `compose.yaml` or the web Dockerfile.

Try the main guarantee: search `zebrafish` as `chloe.martin@mailinator.com` (no results, indistinguishable from a search that matches nothing), then as `aarav.mehta@mailinator.com` (one MERN-only question).

## Three ways to run it

Pick based on what you are working on. All three use the same `.env`.

|                                          | What runs in Docker | What runs on your machine                        | Best for                          |
| ---------------------------------------- | ------------------- | ------------------------------------------------ | --------------------------------- |
| **1. Everything in Docker**              | database, API, web  | nothing                                          | trying it out, demos, final check |
| **2. Frontend local, backend in Docker** | database, API       | web (Vite, hot reload)                           | UI work                           |
| **3. Everything local**                  | database only       | API (tsx, hot reload) and web (Vite, hot reload) | full-stack work                   |

### Option 1: everything in Docker

```bash
cp .env.example .env
docker compose up -d --build
docker compose ps                    # wait until db, api and web show (healthy)
```

| What                  | URL                              |
| --------------------- | -------------------------------- |
| App                   | http://localhost:3000            |
| API health            | http://localhost:4000/api/health |
| API docs (Swagger UI) | http://localhost:4000/api/docs   |

nginx serves the UI and forwards `/api` to the API, so the browser sees a single origin.

### Option 2: frontend on your machine, backend in Docker

```bash
cp .env.example .env
docker compose up -d db api          # backend only
docker compose stop web              # optional: free the nginx container
npm install                          # first time only, at the repo root
npm run dev -w @qb/web               # UI with hot reload
```

Open the URL Vite prints (usually http://localhost:5173; it moves to 5174 if 5173 is taken). Vite forwards `/api` to the API container on port 4000, so cookies work exactly as they do behind nginx.

After you change **backend** code, rebuild its container: `docker compose up -d --build api`.

### Option 3: frontend and backend on your machine

Only the database stays in Docker.

```bash
cp .env.example .env
docker compose up -d db
docker compose stop api web          # port 4000 must be free for the local API
npm install                          # first time only, at the repo root
npm run generate -w @qb/api          # builds the Prisma client (it is git-ignored)
(cd apps/api && npx prisma migrate deploy)
npm run seed -w @qb/api              # only on an empty database; it refuses otherwise

npm run dev -w @qb/api               # terminal 1: API on http://localhost:4000
npm run dev -w @qb/web               # terminal 2: UI on http://localhost:5173
```

The API reads the repo-root `.env`. Its `DATABASE_URL` points at `localhost:5436`, the database port that Compose publishes on your machine.

## Ports

| Service     | Host port | Setting in `.env`    |
| ----------- | --------- | -------------------- |
| web (nginx) | 3000      | `WEB_HOST_PORT`      |
| api         | 4000      | `API_HOST_PORT`      |
| database    | 5436      | `POSTGRES_HOST_PORT` |

The API and database ports are published on `127.0.0.1` only; the web port is the one public entry point.

If a port is taken (`port is already allocated`), change it in `.env` and run `docker compose up -d` again. The database default is 5436 because 5432 to 5435 were already in use on the development machine. If you change `POSTGRES_HOST_PORT`, update the port in `DATABASE_URL` too (that URL is used by Options 2 and 3 only).

## Tests

```bash
docker compose up -d db              # the API tests need Postgres
npm test -w @qb/api                  # creates and migrates its own qb_test database
npm test -w @qb/web
npm run test:cov -w @qb/api          # coverage report (also: -w @qb/web)
npm run lint && npm run typecheck
npm run e2e -w @qb/web               # real-browser journeys (Playwright, see below)
npm run mutate -w @qb/api            # mutation testing of the pure helpers (also: -w @qb/web)
```

Besides the example-based tests there are **property tests** (`fast-check`: CSV escaping, name keys, cursors, tokens, URL filters), an **OpenAPI contract test** (`apps/api/test/contract.test.ts`: real responses must match the documented schemas, with no undocumented fields) and **mutation testing** (Stryker, on the small pure files; scores were about 92% when last run, the survivors being equivalent mutants).

**End-to-end tests** (`apps/web/e2e`) drive a real Chromium through sign-in, who-sees-what, the review workflow, keyboard use of the filters and an axe scan (including colour contrast) of the main pages. They use their **own database `qb_e2e` and ports 14001 / 15174**, reset on every run, and never touch the development database or servers. One-time setup: `npx playwright install chromium` (in `apps/web`). They need Postgres running (`docker compose up -d db`).

**CI** (`.github/workflows/ci.yml`): lint, type-check, formatting, API and web tests against a Postgres service, builds, a dependency audit (fails on critical), and the E2E job; mutation testing runs weekly and on demand. The workflow has been checked locally command by command but has not yet run on GitHub.

The security attack suites (`security.*.test.ts`) try to break authentication, access control, input handling and HTTP headers; see [docs/06-security-review.md](docs/06-security-review.md) for the findings and recommendations. The API tests run against a real database (no mocks). The most important ones are in `apps/api/test/visibility.test.ts` (client restriction cannot be detected through search, filters, paging or by ID) and `apps/api/test/questions.write.test.ts` (who may add and edit, including direct-by-ID attempts).

## Everyday commands

```bash
docker compose logs -f api           # follow API logs
docker compose stop                  # stop everything, keep data
docker compose up -d --build api     # rebuild after backend changes
docker compose down                  # remove containers, keep data
docker compose down -v               # DESTROYS the database (full reset, re-seeds on next start)
```

The full command reference, with expected output, is in [docs/docker.md](docs/docker.md).

## Configuration

Everything is in `.env` (copy of `.env.example`). Notable settings:

| Setting                                                   | Meaning                                                                                                                                                                                  |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`                 | Token signing secrets. The defaults are dev-only placeholders; replace them (`openssl rand -base64 48`) for anything shared. The API refuses the placeholders when `COOKIE_SECURE=true`. |
| `COOKIE_SECURE`                                           | `true` only when served over https. Safari drops secure cookies on plain `http://localhost`.                                                                                             |
| `SEED_ON_START`                                           | Seed demo data on start when the database is empty.                                                                                                                                      |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`                           | The first admin of a real deployment, created by the `migrate` job when there is no active admin (set both; password 12+ characters). Use this instead of the demo seed.               |
| `METRICS_TOKEN`                                           | Enables `GET /api/metrics` (Prometheus) for `Authorization: Bearer <token>`. Unset: the endpoint does not exist.                                                                         |
| `REDIS_URL`                                               | Shared store for the rate limits when running more than one API process. Unset: counters live in memory. Redis down: limits stop applying rather than failing requests.                 |
| `DB_STATEMENT_TIMEOUT_MS`                                 | Aborts any database statement that runs longer (default 15,000).                                                                                                                         |
| `ALLOWED_ORIGINS`                                         | Origins allowed to make state-changing requests (CSRF check). Same-origin requests are always allowed.                                                                                   |
| `DOCS_ENABLED`                                            | Serves Swagger UI at `/api/docs`. Off by default in production; `.env.example` sets it to `true` for the local demo.                                                                     |
| `TRUST_PROXY`                                             | Number of reverse proxies whose `X-Forwarded-For` is trusted (default `0`; Compose sets `1` for nginx). Only above 0 if clients cannot reach the API port directly.                      |
| `RATE_LIMIT_OTHER_PER_MIN`, `RATE_LIMIT_AUTH_PER_MIN` | Per-user allowance (120/min) shared by `/tags`, `/clients` and `/admin/*`, and per-address allowance (30/min) for `/auth/refresh` and `/auth/logout`. The questions API has its own (`RATE_LIMIT_API_PER_MIN`, 120/min). |
| `RATE_LIMIT_LOGIN_PER_MIN`, `RATE_LIMIT_LOGIN_IP_PER_MIN` | Failed-login limits per IP and email (5) and per IP across all emails (30).                                                                                                              |
| `VITE_SHOW_DEMO_ACCOUNTS`                                 | Shows the Demo accounts panel on the login page; clicking one fills in the email **and the demo password** (which is therefore in the web bundle). Set `false` for real deployments (Compose defaults it to `false`).     |

## Troubleshooting

| Symptom                                                                   | Fix                                                                                                         |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `Cannot connect to the Docker daemon`                                     | Start Docker Desktop (`open -a Docker`), then retry.                                                        |
| `input/output error` during a build, database `unhealthy`                 | The host disk is full. Free space, restart Docker, run `docker compose up -d`. Data in the volume survives. |
| `port is already allocated`                                               | See the ports section above.                                                                                |
| Login works in Swagger or curl but not in the UI (or the other way round) | Use one origin per session: `localhost:3000` (Docker) or the Vite URL. Cookies are per origin.              |
| API exits on start with `Invalid environment configuration`               | A required setting in `.env` is missing or too short. The message names the setting, never its value.       |
| `Cannot find module .../generated/prisma/client.js`                       | Run `npm run generate -w @qb/api` (Options 2 and 3 after a fresh clone).                                    |
| Seed says `database not empty, refusing`                                  | Expected. To start over: `docker compose down -v`, then `docker compose up -d`.                             |

## Project layout

```
apps/api/       Express API: modules/{auth,questions,tags,clients,notifications,admin,audit}, prisma/, seed, tests
apps/web/       React UI: features/{auth,questions,admin,notifications,how-it-works}, shared/{api,ui}, nginx config, tests, e2e/
docs/           requirements, technology decisions (ADRs), architecture, task plan, progress, perf notes, security review
deploy/         Caddyfile for the optional TLS profile
scripts/        backup.sh and restore.sh (database dumps)
.github/        CI workflow
compose.yaml    db + migrate job + api + web (+ caddy with --profile tls)
```

Glossary: the product says **department**; the data model, paths and fields still say `client` (`/clients`, `clientId`). See the glossary in [docs/03-architecture.md](docs/03-architecture.md).

Key design rule: `apps/api/src/modules/questions/question.repo.ts` is the **only** file that reads the question tables, and every function in it takes the acting user and applies the client-visibility rule inside the SQL. A test fails if any other file touches them.

## Documentation

| Document                                                             | What it covers                                     |
| -------------------------------------------------------------------- | -------------------------------------------------- |
| [docs/01-requirements-analysis.md](docs/01-requirements-analysis.md) | Requirements register, assumptions, open questions |
| [docs/02-technology-selection.md](docs/02-technology-selection.md)   | Decision log, SQL vs NoSQL, ADRs                   |
| [docs/03-architecture.md](docs/03-architecture.md)                   | Architecture, API contract, data model, security   |
| [docs/04-task-plan.md](docs/04-task-plan.md)                         | Task breakdown and traceability                    |
| [docs/05-progress.md](docs/05-progress.md)                           | What is done, with evidence, and known issues      |
| [docs/07-poc-walkthrough.md](docs/07-poc-walkthrough.md)             | Every feature explained end to end, mapped to the React to Full Stack 101 path |
| [docs/perf.md](docs/perf.md)                                         | Query plans and timings                            |
| [docs/docker.md](docs/docker.md)                                     | Docker commands and troubleshooting                |
| http://localhost:4000/api/docs                                       | Live API reference (Swagger UI)                    |

## Known limitations

See [docs/05-progress.md](docs/05-progress.md) for the full list. The main ones: duplicate detection is trigram-based (it misses paraphrases and can flag genuinely different questions, which the "add it anyway" override handles); two people editing one question get a conflict message instead of silently overwriting each other, but the second person must reapply their change; performance was measured at 5,000 questions on one machine (not under load); the question search pages with an offset capped at 10,000 rather than a cursor; sign-in is email and password only (no multi-factor, and no self-service password change or reset: an admin sets passwords); there is no error tracking or tracing service (Sentry/OpenTelemetry); the CI workflow, Let's Encrypt certificates and a live database restore over the running database have not been exercised end to end; and there is no cloud deployment.
