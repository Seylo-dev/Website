# api.seylo.dev and install.seylo.dev, the site API. Easypanel builds it from the repo root:
# Build Path "/", Dockerfile "apps/api/Dockerfile" (locally: docker build -f apps/api/Dockerfile .).
# The data lives in Postgres: set DATABASE_URL to the Postgres service's internal URL. No volume.
FROM oven/bun:1.4.4-slim
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile --production --filter @seylo-site/api
# Rate limits key on the address Traefik appends to X-Forwarded-For (cf-connecting-ip when that is a
# Cloudflare address): keep the container reachable through Traefik only (root README).
ENV NODE_ENV=production PORT=80 TRUST_PROXY=true
USER bun
EXPOSE 80
CMD ["bun", "apps/api/src/index.ts"]
