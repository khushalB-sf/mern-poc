# Docker: commands and behaviour

Setup once: `cp .env.example .env` (the defaults work locally). macOS-compatible; all commands run from the repo root.
Marks: ✅ = I ran it in this project and saw the stated result; 📝 = standard Compose behaviour, not yet exercised here.

| # | Need | Command | Expect | Data |
|---|---|---|---|---|
| 1 | Is Docker up? | `docker --version && docker info --format '{{.ServerVersion}}' && docker compose version` ✅ | Versions print. "Cannot connect to the Docker daemon" → start Docker Desktop (`open -a Docker`). | n/a |
| 2 | Build images | `docker compose build` ✅ | `interview-qb-api Built`. First build is slow, later ones use the layer cache. | keeps |
| 3 | Start everything (foreground) | `docker compose up` 📝 | Logs from all services; Ctrl-C stops them. | keeps |
| 4 | Start detached | `docker compose up -d` ✅ | Containers start in the background; `api` waits until `db` is healthy. | keeps |
| 5 | What is running? | `docker compose ps` ✅ | `db`, `api` and `web` show `(healthy)` (`web` waits for `api`). `migrate` is a one-shot job: it shows as exited (0) once it has finished, and `api` starts only after that. | keeps |
| 6 | Logs | `docker compose logs -f api` (omit `-f` to just print) ✅ | JSON log lines; migrations output at the top. Ctrl-C leaves containers running. | keeps |
| 7 | Reach the services | API: `curl -i localhost:4000/api/health` ✅ → `200 {"status":"ok"}`. API docs (Swagger UI): `http://localhost:4000/api/docs` ✅, raw spec `/api/openapi.json`. Web UI: `http://localhost:3000` ✅ (nginx serves the UI and proxies `/api` to the API). | | keeps |
| 8 | DB ready? | `docker compose exec db pg_isready -U qb -d qb` 📝 and `docker compose exec db psql -U qb -d qb -c '\dt'` ✅ | `accepting connections`; table list. | keeps |
| 9 | Migrations / seed / first admin | The `migrate` service runs before `api` on every `up` (idempotent): `prisma migrate deploy`, then the demo seed when `SEED_ON_START=true` and the DB is empty, then the first admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD` when there is no active admin. Run it again by hand: `docker compose run --rm migrate` ✅. Output: `docker compose logs migrate` ✅. The `api` image has no Prisma CLI. | "All migrations have been successfully applied." / `bootstrap: admin created` or `skipped` | keeps |
| 10 | Stop | `docker compose stop` 📝 | Containers stop; they and the volume remain. | keeps |
| 11 | Restart one service | `docker compose restart api` 📝 | Brief unavailability. Migrations are not re-run by a restart (run `docker compose run --rm migrate`, or `up -d`, for that). | keeps |
| 12 | Rebuild after code/config change | `docker compose up -d --build api` ✅ | Rebuilds `api` and recreates only that container. Changing `.env` needs `docker compose up -d` to recreate. | keeps |
| 13 | Remove containers | `docker compose down` 📝 | Containers and network removed. **Volume kept**, so data survives. | keeps |
| 14 | **Full database reset** | `docker compose down -v` ✅ | Containers, network **and the `pgdata` volume are deleted. All data is lost.** Next `up` re-migrates and re-seeds. | **DESTROYS** |

## Ports

| Service | Host port | Why |
|---|---|---|
| web | 3000 | the one URL users need (`WEB_HOST_PORT`; nginx listens on 8080 inside the container) |
| api | 4000 | curl and tests (`API_HOST_PORT`); bound to 127.0.0.1 only |
| db | 5436 | `POSTGRES_HOST_PORT`; bound to 127.0.0.1 only; 5432-5435 were already used by other local Postgres containers on the dev machine |

**Port already allocated** (`Bind for 0.0.0.0:5436 failed`): find the holder with `docker ps --format '{{.Names}}\t{{.Ports}}'` or `lsof -nP -iTCP:5436 -sTCP:LISTEN`, then either stop it or set another `POSTGRES_HOST_PORT` / `API_HOST_PORT` in `.env` and `docker compose up -d`. Only the host side changes; containers always talk on 5432/4000.

## Service-to-service networking

Inside the Compose network services reach each other by **service name**: the API's `DATABASE_URL` host is `db:5432`, not `localhost` (inside a container `localhost` is the container itself). `compose.yaml` builds that URL itself. The `DATABASE_URL` in `.env` (`localhost:5436`) is only for running the API on your Mac with `npm run dev`.

## Troubleshooting seen in this project

- `input/output error` during build, db `unhealthy`: the Mac's disk was full. Free space, `open -a Docker`, then `docker compose up -d`. Data in the volume survived.
- Prisma warns about `libssl`: the runtime image installs `openssl` (fixed in the Dockerfile).
- Verified on 2026-10-14: a second Compose project (`-p qbfresh`, other ports, own volume) started from empty, applied the migration and reached `healthy`; then `down -v` removed only that project's volume.

## Operations

Marks as above. Verified on 2026-11-19 in a throwaway Compose project (`-p qbtest`, own ports and volume, torn down afterwards): the image builds, `migrate` applies all migrations and creates the first admin, `api` becomes healthy only after that, `/api/health/ready` answers, login works, `/api/metrics` is 401 without the token and serves metrics with it, `/api/docs` is 404 by default, and the runtime image has no `prisma` CLI.

**Demo data vs a real first admin.** For a demo: `SEED_ON_START=true` (users share `SEED_PASSWORD`, and set `VITE_SHOW_DEMO_ACCOUNTS=true` to show the accounts on the login page). For anything shared: leave both off and set `ADMIN_EMAIL` and `ADMIN_PASSWORD` (12+ characters). The default for `VITE_SHOW_DEMO_ACCOUNTS` in Compose is `false`.

**TLS.** `docker compose --profile tls up -d` starts Caddy in front of the web container (`deploy/Caddyfile`). Set `SITE_ADDRESS` to the public hostname (Caddy then gets and renews a Let's Encrypt certificate itself; ports 80 and 443 must be reachable), `ALLOWED_ORIGINS=https://<hostname>`, `COOKIE_SECURE=true` and `TRUST_PROXY=2` (Caddy then nginx, both before the API). Caddy adds `Strict-Transport-Security`. ✅ with `SITE_ADDRESS=localhost` (Caddy's own certificate): HTTPS answers over HTTP/2 with the HSTS header and the API is reachable through it. 📝 Not exercised: a real hostname and Let's Encrypt; the rate-limit key seen by the API behind Caddy with `TRUST_PROXY=2`.

**Backup and restore.** `./scripts/backup.sh [file]` writes a compressed `pg_dump` (custom format). `./scripts/restore.sh file [dbname]` restores into a **new** database (default `<POSTGRES_DB>_restore`) so it can be checked first. ✅ A dump restored into a second database had the same rows. 📝 Not exercised: replacing the live database (stop `api`, drop and recreate the database, restore into that name, start `api`), and scheduling. Copy dumps off the machine: a backup on the same disk is not a backup.

**Shared rate limits.** With more than one API process set `REDIS_URL=redis://host:6379`; the limits are then counted in Redis. If Redis is unreachable the limits stop applying (fail open) instead of taking the API down. ✅ Two app instances shared one allowance through a real Redis, and requests still succeeded after the connection was closed (`REDIS_TEST_URL=redis://localhost:6379 npm test -w @qb/api`). 📝 Not exercised: a Redis outage in the middle of load, TLS to Redis (`rediss://` is accepted).
