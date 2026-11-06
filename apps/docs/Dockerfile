# docs.seylo.dev. Easypanel builds it from the repo root: Build Path "/",
# Dockerfile "apps/docs/Dockerfile" (locally: docker build -f apps/docs/Dockerfile .).
# NEXT_PUBLIC_SITE_URL (canonical URLs, sitemap, OG images) is baked in at build time.
FROM node:24.22.1-slim AS build
COPY --from=oven/bun:1.4.4-slim /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /src
COPY . .
ARG NEXT_PUBLIC_SITE_URL=https://docs.seylo.dev
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun install --frozen-lockfile --filter @seylo-site/docs && bun run --cwd apps/docs build

FROM node:24.22.1-slim
WORKDIR /app
COPY --from=build --chown=node:node /src/apps/docs/.next/standalone ./
COPY --from=build --chown=node:node /src/apps/docs/.next/static apps/docs/.next/static
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=80
USER node
EXPOSE 80
CMD ["node", "apps/docs/server.js"]
