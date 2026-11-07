# Seylo website

The repo behind [seylo.dev](https://seylo.dev): the landing page, the docs and the small site API. One Bun
workspace, one `bun.lock`. Seylo itself (the panel, the agent, the installer and the templates) lives in
[Seylo-dev/App](https://github.com/Seylo-dev/App).

| Folder                               | Stack                 | Serves                                                    |
| ------------------------------------ | --------------------- | --------------------------------------------------------- |
| [`apps/landing`](apps/landing)       | Next 16, Tailwind 4   | `seylo.dev`; proxies `seylo.dev/l/*` (reports) to the API |
| [`apps/docs`](apps/docs)             | Next 16, Fumadocs     | `docs.seylo.dev`, with the API and CLI references         |
| [`apps/api`](apps/api)               | Bun, Elysia, Postgres | `api.seylo.dev` (telemetry, reports), `install.seylo.dev` |
| [`tools/hero-shot`](tools/hero-shot) | Playwright            | The landing's hero image, captured from a running panel   |

Names, domains and the GitHub repos come from [`brand/brand.json`](brand/brand.json).

## Dev

Needs Bun 1.4 (Node 24 for Next's tooling).

```bash
bun install
bun run dev            # all three: landing :3000, docs :3001, api :4000
bun run dev:landing    # or dev:docs, dev:api
bun run build          # landing + docs
bun run test           # the API's tests
bun run typecheck      # all three
```

## Deploy on Easypanel

Three App services, each from GitHub `Seylo-dev/Website` (branch `main`), Build Path `/`, build type
Dockerfile:

| Service | Dockerfile                | Domains                              | Extra                                       |
| ------- | ------------------------- | ------------------------------------ | ------------------------------------------- |
| landing | `apps/landing/Dockerfile` | `seylo.dev`, `www.seylo.dev`         | a Redirect from `www.seylo.dev` to the apex |
| docs    | `apps/docs/Dockerfile`    | `docs.seylo.dev`                     |                                             |
| api     | `apps/api/Dockerfile`     | `api.seylo.dev`, `install.seylo.dev` | `DATABASE_URL`, see below                   |

The api image sets `TRUST_PROXY=true`: its rate limits key on the last `X-Forwarded-For` hop, the address that
connected to Easypanel's Traefik, and on `cf-connecting-ip` only when that address is in Cloudflare's IP ranges
(the list is in `apps/api/src/client-ip.ts`). A client that skips Cloudflare and talks to the host directly is
limited by its own address, whatever headers it sends. The api container must stay reachable through Traefik only
(no published port), since Traefik is what appends that last hop.

Every image listens on port 80, Easypanel's default, so there is nothing to type in the domain's port.

The api keeps telemetry and reports in Postgres and needs no volume. Add a Postgres service to the same
Easypanel project and set `DATABASE_URL` on the api to that service's internal connection URL
(`postgres://...@<project>_<service>:5432/...`), not an exposed one, so the database never leaves the
private network. The api creates its tables on first start, and refuses to start without `DATABASE_URL`.
An api that already ran with the `/data` volume keeps nothing from it: its telemetry rows and live report links
are not copied to Postgres. Export them first if they matter, then remove the volume.

Nothing else is needed. Optional:

- `STATS_TOKEN` on the api: enables `GET /telemetry/summary` (see `apps/api/.env.example` for the rest).
- `SITE_API_URL` on the landing and `NEXT_PUBLIC_SITE_URL` on the docs, only if the domains change. They are
  baked in at build time (Easypanel passes env to the build), so redeploy after changing them.

To try an image locally: `docker build -f apps/docs/Dockerfile -t seylo-docs . && docker run -p 3001:80 seylo-docs`.

## Conventions

- Exact dependency versions, no ranges.
- Prettier with a 120-column width: `bunx prettier --write .`
- Plain hyphens, never em dashes, in code, comments and docs.

## License

The code is under the [MIT License](LICENSE). The docs' text is under CC BY 4.0
([`apps/docs/LICENSE-CONTENT`](apps/docs/LICENSE-CONTENT)). The Seylo name and logo are not covered by
either: please don't use them for your own product.
