#!/bin/sh
set -eu
# Apply pending migrations, optionally seed an empty database, then start. Safe on every boot.
../../node_modules/.bin/prisma migrate deploy
if [ "${SEED_ON_START:-false}" = "true" ]; then
  node dist/seed/run.js --if-empty
fi
exec node dist/server.js
