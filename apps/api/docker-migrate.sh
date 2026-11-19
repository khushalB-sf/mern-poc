#!/bin/sh
# One-shot job that runs before the API starts: apply migrations, optionally seed demo data, then make sure
# a first admin exists (from ADMIN_EMAIL / ADMIN_PASSWORD). Safe on every boot. The API image has none of
# the tooling this needs (no Prisma CLI), which is the point of keeping it separate.
set -eu
../../node_modules/.bin/prisma migrate deploy
if [ "${SEED_ON_START:-false}" = "true" ]; then
  node dist/seed/run.js --if-empty
fi
node dist/seed/run.js --admin
