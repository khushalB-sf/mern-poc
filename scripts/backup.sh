#!/bin/sh
# Logical backup of the compose database: ./scripts/backup.sh [outfile]
# Custom format (compressed, restorable selectively). Run from the repo root; uses the same .env as compose.
set -eu
out="${1:-backup-$(date +%Y%m%d-%H%M%S).dump}"
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner' > "$out"
[ -s "$out" ] || { rm -f "$out"; echo "backup failed: empty dump" >&2; exit 1; }
echo "wrote $out ($(wc -c < "$out") bytes)"
