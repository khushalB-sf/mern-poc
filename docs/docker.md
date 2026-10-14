# Docker: commands and behaviour

Setup once: `cp .env.example .env` (the defaults work locally). macOS-compatible; all commands run from the repo root.
Marks: ✅ = I ran it in this project and saw the stated result; 📝 = standard Compose behaviour, not yet exercised here.

| # | Need | Command | Expect | Data |
|---|---|---|---|---|
| 1 | Is Docker up? | `docker --version && docker info --format '{{.ServerVersion}}' && docker compose version` ✅ | Versions print. "Cannot connect to the Docker daemon" → start Docker Desktop (`open -a Docker`). | n/a |
| 2 | Build images | `docker compose build` ✅ | `interview-qb-api Built`. First build is slow, later ones use the layer cache. | keeps |
| 3 | Start everything (foreground) | `docker compose up` 📝 | Logs from all services; Ctrl-C stops them. | keeps |
| 4 | Start detached | `docker compose up -d` ✅ | Containers start in the background; `api` waits until `db` is healthy. | keeps |
| 5 | What is running? | `docker compose ps` ✅ | `db` and `api` show `(healthy)`. | keeps |
| 6 | Logs | `docker compose logs -f api` (omit `-f` to just print) ✅ | JSON log lines; migrations output at the top. Ctrl-C leaves containers running. | keeps |
| 7 | Reach the services | API: `curl -i localhost:4000/api/health` ✅ → `200 {"status":"ok"}`. API docs (Swagger UI): `http://localhost:4000/api/docs` ✅, raw spec `/api/openapi.json`. Web UI: `http://localhost:3000` ✅ (nginx serves the UI and proxies `/api` to the API). | | keeps |
| 8 | DB ready? | `docker compose exec db pg_isready -U qb -d qb` 📝 and `docker compose exec db psql -U qb -d qb -c '\dt'` ✅ | `accepting connections`; table list. | keeps |
| 9 | Migrations / seed | Migrations run automatically on every `api` start (idempotent). Manually: `docker compose exec api ../../node_modules/.bin/prisma migrate deploy` 📝. Seed: with `SEED_ON_START=true` it runs on start when the DB is empty (added in T-07). | "No pending migrations to apply." | keeps |
| 10 | Stop | `docker compose stop` 📝 | Containers stop; they and the volume remain. | keeps |
| 11 | Restart one service | `docker compose restart api` 📝 | Brief unavailability; re-runs migrate on boot. | keeps |
| 12 | Rebuild after code/config change | `docker compose up -d --build api` ✅ | Rebuilds `api` and recreates only that container. Changing `.env` needs `docker compose up -d` to recreate. | keeps |
| 13 | Remove containers | `docker compose down` 📝 | Containers and network removed. **Volume kept**, so data survives. | keeps |
| 14 | **Full database reset** | `docker compose down -v` ✅ | Containers, network **and the `pgdata` volume are deleted. All data is lost.** Next `up` re-migrates and re-seeds. | **DESTROYS** |

## Ports

| Service | Host port | Why |
|---|---|---|
| web | 3000 | the one URL users need (`WEB_HOST_PORT`; nginx listens on 8080 inside the container) |
| api | 4000 | curl and tests (`API_HOST_PORT`) |
| db | 5436 | `POSTGRES_HOST_PORT`; 5432-5435 were already used by other local Postgres containers on the dev machine |

**Port already allocated** (`Bind for 0.0.0.0:5436 failed`): find the holder with `docker ps --format '{{.Names}}\t{{.Ports}}'` or `lsof -nP -iTCP:5436 -sTCP:LISTEN`, then either stop it or set another `POSTGRES_HOST_PORT` / `API_HOST_PORT` in `.env` and `docker compose up -d`. Only the host side changes; containers always talk on 5432/4000.

## Service-to-service networking

Inside the Compose network services reach each other by **service name**: the API's `DATABASE_URL` host is `db:5432`, not `localhost` (inside a container `localhost` is the container itself). `compose.yaml` builds that URL itself. The `DATABASE_URL` in `.env` (`localhost:5436`) is only for running the API on your Mac with `npm run dev`.

## Troubleshooting seen in this project

- `input/output error` during build, db `unhealthy`: the Mac's disk was full. Free space, `open -a Docker`, then `docker compose up -d`. Data in the volume survived.
- Prisma warns about `libssl`: the runtime image installs `openssl` (fixed in the Dockerfile).
- Verified on 2026-10-14: a second Compose project (`-p qbfresh`, other ports, own volume) started from empty, applied the migration and reached `healthy`; then `down -v` removed only that project's volume.
