# Build context is the repo root (npm workspaces share one lockfile): see compose.yaml.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci -w @qb/web
COPY tsconfig.base.json ./
COPY apps/web apps/web
# Shows demo-account hints (emails only, never a password) on the login page. Set false for real deployments.
ARG VITE_SHOW_DEMO_ACCOUNTS=true
ENV VITE_SHOW_DEMO_ACCOUNTS=$VITE_SHOW_DEMO_ACCOUNTS
RUN npm run build -w @qb/web

# Unprivileged nginx: runs as a non-root user and listens on 8080.
FROM nginxinc/nginx-unprivileged:1.29-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/web/security-headers.inc /etc/nginx/conf.d/security-headers.inc
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
