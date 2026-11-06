# The site API (apps/api): telemetry, troubleshoot reports and install.sh.
# Build from the repo root: docker build -f deploy/api.Dockerfile .
# Data (site.db) lives in /data; mount a volume there.
FROM oven/bun:1.4.4-slim AS build
WORKDIR /src
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/landing/package.json apps/landing/
RUN bun install --frozen-lockfile --filter @seylo-site/api
COPY brand brand
COPY apps/api apps/api
RUN cd apps/api && bun run build

FROM oven/bun:1.4.4-slim
WORKDIR /app
COPY --from=build /src/apps/api/dist ./dist
RUN mkdir -p /data && chown bun:bun /data
ENV NODE_ENV=production PORT=4000 DATA_DIR=/data
EXPOSE 4000
USER bun
CMD ["bun", "dist/index.js"]
