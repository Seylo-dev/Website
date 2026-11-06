# Seylo website

The repo behind [seylo.dev](https://seylo.dev): the landing page, the docs and the small site API. One Bun
workspace, one `bun.lock`. Seylo itself (the panel, the agent, the installer and the templates) lives in
[Seylo-dev/App](https://github.com/Seylo-dev/App).

| Folder                               | Stack               | Serves                                                    |
| ------------------------------------ | ------------------- | --------------------------------------------------------- |
| [`apps/landing`](apps/landing)       | Next 16, Tailwind 4 | `seylo.dev`; proxies `seylo.dev/l/*` (reports) to the API |
| [`apps/docs`](apps/docs)             | Next 16, Fumadocs   | `docs.seylo.dev`, with the API and CLI references         |
| [`apps/api`](apps/api)               | Bun, Elysia, SQLite | `api.seylo.dev` (telemetry, reports), `install.seylo.dev` |
| [`tools/hero-shot`](tools/hero-shot) | Playwright          | The landing's hero image, captured from a running panel   |

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
| api     | `apps/api/Dockerfile`     | `api.seylo.dev`, `install.seylo.dev` | a volume mounted at `/data`                 |

The api image trusts proxy headers (`cf-connecting-ip`, `X-Forwarded-For`) for its rate limits, so the api must
only be reachable through Cloudflare: limit the Easypanel host's ports 80 and 443 to Cloudflare's IP ranges (or
use Authenticated Origin Pulls).

Every image listens on port 80, Easypanel's default, so there is nothing to type in the domain's port. No env
is needed. Optional:

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
