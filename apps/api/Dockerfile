# api.seylo.dev and install.seylo.dev, the site API. Easypanel builds it from the repo root:
# Build Path "/", Dockerfile "apps/api/Dockerfile" (locally: docker build -f apps/api/Dockerfile .).
# The data lives in Postgres: set DATABASE_URL to the Postgres service's internal URL. No volume.
FROM oven/bun:1.4.4-slim
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile --production --filter @seylo-site/api
# The geolocation database GET /geo reads (DB-IP City Lite, CC BY 4.0), downloaded into the image so
# /geo answers from the first request; the API downloads the next month's file by itself
# (GEO_AUTO_UPDATE). A failed download leaves that to the API instead of failing the build.
RUN mkdir -p apps/api/data/geo && chown -R bun:bun apps/api/data
USER bun
RUN bun apps/api/src/geo/update.ts || echo "[geo] no database in the image: the API downloads it when it starts"
# Rate limits key on the address Traefik appends to X-Forwarded-For (cf-connecting-ip when that is a
# Cloudflare address): keep the container reachable through Traefik only (root README).
ENV NODE_ENV=production PORT=80 TRUST_PROXY=true
EXPOSE 80
CMD ["bun", "apps/api/src/index.ts"]
