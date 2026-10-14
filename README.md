# Interview Question Bank

A shared, searchable bank of interview questions. Anyone can browse; authors add questions with answer notes and tags; reviewers can edit any entry. Questions tied to a client are visible **only** to people granted that client, and that rule is enforced inside the database query, so a search never hints that a restricted question exists.

**Stack:** React 19 + Vite + Tailwind (UI) · Express 5 + TypeScript (API) · PostgreSQL 17 + Prisma 7 · Docker Compose · Vitest

## Quick start

```bash
cp .env.example .env                 # defaults work as-is for local use
docker compose up -d --build         # database + API + web
```

Open **http://localhost:3000** and sign in. The first start migrates the database and seeds about 5,000 questions.

| Account                   | Role                                    |
| ------------------------- | --------------------------------------- |
| `author.acme@example.com` | Author, has access to the Acme client   |
| `author.none@example.com` | Author, no client access                |
| `reviewer@example.com`    | Reviewer, has access to the Acme client |
| `user@example.com`        | Read-only user                          |

Password for all of them: `Passw0rd!demo` (the `SEED_PASSWORD` in `.env`). These are demo accounts for local use only.

Try the main guarantee: search `zebrafish` as `author.none@example.com` (no results, indistinguishable from a search that matches nothing), then as `author.acme@example.com` (one Acme-only question).

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

If a port is taken (`port is already allocated`), change it in `.env` and run `docker compose up -d` again. The database default is 5436 because 5432 to 5435 were already in use on the development machine. If you change `POSTGRES_HOST_PORT`, update the port in `DATABASE_URL` too (that URL is used by Options 2 and 3 only).

## Tests

```bash
docker compose up -d db              # the API tests need Postgres
npm test -w @qb/api                  # creates and migrates its own qb_test database
npm test -w @qb/web
npm run lint && npm run typecheck
```

The API tests run against a real database (no mocks). The most important ones are in `apps/api/test/visibility.test.ts` (client restriction cannot be detected through search, filters, paging or by ID) and `apps/api/test/questions.write.test.ts` (who may add and edit, including direct-by-ID attempts).

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

| Setting                                   | Meaning                                                                                                                                                                                  |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Token signing secrets. The defaults are dev-only placeholders; replace them (`openssl rand -base64 48`) for anything shared. The API refuses the placeholders when `COOKIE_SECURE=true`. |
| `COOKIE_SECURE`                           | `true` only when served over https. Safari drops secure cookies on plain `http://localhost`.                                                                                             |
| `SEED_ON_START`                           | Seed demo data on start when the database is empty.                                                                                                                                      |
| `ALLOWED_ORIGINS`                         | Origins allowed to make state-changing requests (CSRF check). Same-origin requests are always allowed.                                                                                   |
| `DOCS_ENABLED`                            | Serves Swagger UI at `/api/docs`.                                                                                                                                                        |
| `VITE_SHOW_DEMO_ACCOUNTS`                 | Shows demo-account emails (never a password) on the login page. Set `false` for real deployments.                                                                                        |

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
apps/api/       Express API: modules/{auth,questions,tags,clients,audit}, prisma/, seed, tests
apps/web/       React UI: features/{auth,questions}, shared/{api,ui}, nginx config, tests
docs/           requirements, technology decisions (ADRs), architecture, task plan, progress, perf notes
compose.yaml    db + api + web
```

Key design rule: `apps/api/src/modules/questions/question.repo.ts` is the **only** file that reads the question tables, and every function in it takes the acting user and applies the client-visibility rule inside the SQL. A test fails if any other file touches them.

## Documentation

| Document                                                             | What it covers                                     |
| -------------------------------------------------------------------- | -------------------------------------------------- |
| [docs/01-requirements-analysis.md](docs/01-requirements-analysis.md) | Requirements register, assumptions, open questions |
| [docs/02-technology-selection.md](docs/02-technology-selection.md)   | Decision log, SQL vs NoSQL, ADRs                   |
| [docs/03-architecture.md](docs/03-architecture.md)                   | Architecture, API contract, data model, security   |
| [docs/04-task-plan.md](docs/04-task-plan.md)                         | Task breakdown and traceability                    |
| [docs/05-progress.md](docs/05-progress.md)                           | What is done, with evidence, and known issues      |
| [docs/perf.md](docs/perf.md)                                         | Query plans and timings                            |
| [docs/docker.md](docs/docker.md)                                     | Docker commands and troubleshooting                |
| http://localhost:4000/api/docs                                       | Live API reference (Swagger UI)                    |

## Known limitations

See [docs/05-progress.md](docs/05-progress.md) for the full list. The main ones: duplicate detection is trigram-based (it misses paraphrases and can flag genuinely different questions, which the "add it anyway" override handles), concurrent edits are last-write-wins, performance was measured at 5,000 questions on one machine (not under load), and there is no cloud deployment or CI pipeline yet.
