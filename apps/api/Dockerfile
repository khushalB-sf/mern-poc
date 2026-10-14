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

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
# Prisma's schema engine needs libssl, which the slim image lacks.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# Production deps only. `prisma` is a runtime dep because the entrypoint runs `migrate deploy`.
RUN npm ci -w @qb/api --omit=dev && npm cache clean --force
COPY --from=build /app/apps/api/dist apps/api/dist
COPY apps/api/prisma apps/api/prisma
COPY apps/api/prisma.config.ts apps/api/docker-entrypoint.sh apps/api/
RUN chown -R node:node /app
USER node
WORKDIR /app/apps/api
EXPOSE 4000
ENTRYPOINT ["./docker-entrypoint.sh"]
