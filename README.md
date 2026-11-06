# Seylo website

The repo behind [seylo.dev](https://seylo.dev): the landing page, the small site API behind telemetry,
troubleshoot reports and the installer, and the tool that captures the landing's hero screenshot.

The rest of Seylo lives in two public repos:

- [Seylo-dev/App](https://github.com/Seylo-dev/App): the panel, the agent, the installer and the templates.
- [Seylo-dev/Docs](https://github.com/Seylo-dev/Docs): the docs at [docs.seylo.dev](https://docs.seylo.dev),
  with the API and CLI references.

| Folder                               | Stack               | Serves                                                                             |
| ------------------------------------ | ------------------- | ---------------------------------------------------------------------------------- |
| [`apps/landing`](apps/landing)       | Next 16, Tailwind 4 | `seylo.dev`                                                                        |
| [`apps/api`](apps/api)               | Bun, Elysia, SQLite | `api.seylo.dev`, `install.seylo.dev`, and `seylo.dev/l/*` through the landing page |
| [`tools/hero-shot`](tools/hero-shot) | Playwright          | The landing's hero image, captured from a running panel                            |

Names, domains and the GitHub repos come from [`brand/brand.json`](brand/brand.json).

## Setup

Needs Bun 1.4 (Node 24 is only used by Next's tooling).

```bash
bun install            # landing + api (workspaces)
```

`tools/hero-shot` has its own install; see its README.

## Scripts

| Script                                | What                                      |
| ------------------------------------- | ----------------------------------------- |
| `bun run dev`                         | Both apps: api on :4000, landing on :3000 |
| `bun run dev:api` / `dev:landing`     | One app                                   |
| `bun run build`                       | Builds both                               |
| `bun run build:api` / `build:landing` | One app                                   |
| `bun run start:api` / `start:landing` | Run a production build                    |
| `bun run test`                        | The API's tests                           |
| `bun run typecheck`                   | Type-check both apps                      |

## How the pieces connect

- `curl -fsSL https://install.seylo.dev | sudo sh` hits the API, which serves `install.sh` from the latest release
  of the app repo (`https://github.com/Seylo-dev/App/releases/latest/download/install.sh`, cached). Outside
  production it falls back to `installer/install.sh` in a checkout of the app repo next to this one
  (`../seylo`).
- Panels whose owner turned telemetry on (it is off by default) send one anonymous report a day to
  `api.seylo.dev/telemetry` (documented in the docs under Telemetry).
- `seylo troubleshoot` uploads a redacted report to `seylo.dev/l`, which the landing page proxies to the API, and
  prints `seylo.dev/l/<id>`.
- The landing links to the docs at `docs.seylo.dev` and redirects old `seylo.dev/docs/*` links there.

## Deploy

- Landing: Vercel project on this repo with Root Directory `apps/landing`, env `SITE_API_URL=https://api.seylo.dev`,
  domains `seylo.dev` and `www.seylo.dev` (redirect to the apex).
- Site API: a Seylo App service built from this repo with `deploy/api.Dockerfile` (build context: the repo root),
  port 4000, a volume at `/data`, env from `apps/api/.env.example` (`DATA_DIR=/data`, `SITE_URL=https://seylo.dev`,
  `TRUST_PROXY=true` behind Seylo's Traefik, a random `STATS_TOKEN`), domains `api.seylo.dev` and
  `install.seylo.dev`, health check `GET /healthz`.

## Conventions

- Exact dependency versions, no ranges.
- Prettier with a 120-column width: `bunx prettier --write .`
- Plain hyphens, never em dashes, in code, comments and docs.

## License

The code is under the [MIT License](LICENSE). The Seylo name and logo are not covered by it: please don't use
them for your own product.
