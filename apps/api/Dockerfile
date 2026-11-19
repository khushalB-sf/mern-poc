# Build context is the repo root (npm workspaces share one lockfile): see compose.yaml.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci -w @qb/api
COPY tsconfig.base.json ./
COPY apps/api apps/api
# prisma.config.ts reads DATABASE_URL even for `generate`; any syntactically valid value works here.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npm run build -w @qb/api

# One-shot job (compose service `migrate`): migrations, optional demo seed, first admin. It has the Prisma
# CLI and the dev dependencies and never serves traffic; the runtime image below has neither.
FROM build AS migrate
ENV NODE_ENV=production
# Prisma's schema engine needs libssl, which the slim image lacks.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
# The Prisma CLI writes into its own engines folder on first use.
RUN chown -R node:node /app/node_modules/@prisma /app/node_modules/prisma
WORKDIR /app/apps/api
USER node
ENTRYPOINT ["./docker-migrate.sh"]

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
# The client library may still look for libssl.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# Production dependencies only: no test or build tooling. npm still installs the Prisma CLI as a peer of
# @prisma/client, so delete it: migrations run in the `migrate` job and the API never needs it.
RUN npm ci -w @qb/api --omit=dev && npm cache clean --force \
 && rm -rf node_modules/prisma node_modules/.bin/prisma
COPY --from=build /app/apps/api/dist apps/api/dist
RUN chown -R node:node /app
USER node
WORKDIR /app/apps/api
EXPOSE 4000
ENTRYPOINT ["node", "dist/server.js"]
