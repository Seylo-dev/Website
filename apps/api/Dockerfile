# api.seylo.dev and install.seylo.dev, the site API. Easypanel builds it from the repo root:
# Build Path "/", Dockerfile "apps/api/Dockerfile" (locally: docker build -f apps/api/Dockerfile .).
# site.db lives in /data: mount a volume there.
FROM oven/bun:1.4.4-slim
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile --production --filter @seylo-site/api \
  && mkdir -p /data && chown bun:bun /data
# Rate limits key on the forwarded client IP: keep the host reachable only through Cloudflare (root README).
ENV NODE_ENV=production DATA_DIR=/data PORT=80 TRUST_PROXY=true
USER bun
EXPOSE 80
CMD ["bun", "apps/api/src/index.ts"]
