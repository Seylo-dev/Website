# seylo.dev, the landing page. Easypanel builds it from the repo root: Build Path "/",
# Dockerfile "apps/landing/Dockerfile" (locally: docker build -f apps/landing/Dockerfile .).
FROM node:24.22.1-slim AS build
COPY --from=oven/bun:1.4.4-slim /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /src
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun install --frozen-lockfile --filter @seylo-site/landing && bun run --cwd apps/landing build

FROM node:24.22.1-slim
WORKDIR /app
COPY --from=build --chown=node:node /src/apps/landing/.next/standalone ./
COPY --from=build --chown=node:node /src/apps/landing/.next/static apps/landing/.next/static
COPY --from=build --chown=node:node /src/apps/landing/public apps/landing/public
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=80
USER node
EXPOSE 80
CMD ["node", "apps/landing/server.js"]
