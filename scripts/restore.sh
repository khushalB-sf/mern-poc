#!/bin/sh
# Restore a dump made by backup.sh into a database that is NOT in use: ./scripts/restore.sh file.dump [dbname]
# Default target is a new database `<POSTGRES_DB>_restore`, so a restore can be checked before it replaces
# anything. To go live, stop the api, restore into the real name (drop it first), then start the api.
set -eu
file="${1:?usage: restore.sh file.dump [dbname]}"
docker compose exec -T db sh -c '
  target="${1:-${POSTGRES_DB}_restore}"
  createdb -U "$POSTGRES_USER" "$target"
  pg_restore -U "$POSTGRES_USER" -d "$target" --no-owner --exit-on-error
  echo "restored into database $target"' sh "${2:-}" < "$file"
