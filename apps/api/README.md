# Site API (`apps/api`)

Bun + Elysia, with Postgres in production and a SQLite file in dev. Three jobs, all public and
unauthenticated:

| Route | What |
| --- | --- |
| `POST /telemetry` | Anonymous ping from a panel: `{ installId, version, nodes, services }`. Stored as one row per install per day, install id hashed. 60 pings per hour per IP (IPv6: per /64). |
| `GET /telemetry/summary?days=30` | Daily totals and the version spread. Needs `Authorization: Bearer $STATS_TOKEN`; 404 when the token isn't set. |
| `POST /l` | Upload a troubleshoot report (Markdown body, max 512 KB, 20 uploads per hour per IP, IPv6 per /64). Refused with 422 if it still contains something that looks like a secret. Returns `{ id, url, expiresAt, deleteToken }`. |
| `GET /l/:id` | The report as a locked-down HTML page (no scripts, no remote images, `noindex`). `GET /l/:id/raw` returns the Markdown. |
| `DELETE /l/:id` | Deletes a report early with `Authorization: Bearer <deleteToken>`. |
| `GET /install.sh` | The installer from the latest GitHub release, served only after it matches the release's signed manifest, cached for 5 minutes. On the `install.` host it is also served at `/`, which is what `curl -fsSL https://install.seylo.dev \| sudo sh` hits. `X-Installer-Version` and `X-Installer-Sha256` name the release and the hash. |
| `GET /healthz` | JSON: `status` (`ok` or `degraded`) and `installer` (what is served and how the last release check went). 200 unless there is no verified installer to serve, then 503. |

Reports expire 30 days after upload: reads hide them right away and an hourly sweep deletes them.

## Run

```bash
bun run dev      # from this folder, or `bun run dev:api` from the repo root
bun test
bun run start    # what the Docker image runs: src/index.ts, no build step
```

Settings are environment variables, see `.env.example`. All are optional in dev; production needs
`DATABASE_URL`.

## Data

Storage goes through Bun's built-in SQL client (`src/db.ts`), with one set of queries for two
databases:

- `DATABASE_URL=postgres://...` set: Postgres. On Easypanel, use the Postgres service's internal
  connection URL (host `<project>_<service>`), not an exposed one. `sslmode` in the URL is honoured
  (`?sslmode=require`). No volume: the container keeps nothing on disk.
- unset, outside production: a SQLite file, `site.db` in `DATA_DIR` (`./data`), so dev needs nothing.
- unset with `NODE_ENV=production` (the Docker image): the API refuses to start and says why.

The tables are created at boot if they are missing. Timestamps are unix milliseconds in BIGINT
columns, days are `YYYY-MM-DD` text, so the same SQL runs on both.

Nothing is copied from an older `site.db`: an API that ran with a `/data` volume before starts on
Postgres with no telemetry history and no reports, so the report links it handed out show the
404 page. Export the rows first if they matter.

`bun test` runs on SQLite in memory and needs nothing. To run the same tests on Postgres as well,
point `SITE_API_PG_URL` at a server where the tests may create and drop throwaway databases:

```bash
docker run -d --name site-api-pg -e POSTGRES_PASSWORD=test -p 127.0.0.1:55432:5432 postgres:17-alpine
SITE_API_PG_URL=postgres://postgres:test@127.0.0.1:55432/postgres bun test
```

## Where it sits

- `install.seylo.dev` and `api.seylo.dev` both point at this process.
- The landing page rewrites `/l/*` here, so report links read `https://seylo.dev/l/<id>`.
- `curl | sudo sh` runs the installer as root before it can check anything itself, so this API checks
  it first (`src/installer/source.ts`). Every check, at boot and then every 5 minutes:
  1. resolves `releases/latest` to a tag, once, and downloads `manifest.json`, `manifest.json.minisig`
     and `install.sh` from that tag, so the three can never come from two releases;
  2. verifies the manifest's minisign signature with `minisignPublicKey` from `brand/brand.json`
     (`src/installer/minisign.ts`, the same check as the panel's);
  3. requires the manifest's `version` to be the tag's and `sha256(install.sh)` to equal
     `installer.sha256` in the manifest (and its `size`, when set), and the script to start with `#!`.

  Only a script that passes all of it is cached and served. When a check fails (GitHub down, a
  release without a manifest, a replaced `install.sh`, a bad signature), the last good copy keeps being
  served, the log gets an `[installer]` error line (`!!! REFUSED` when the files did not check out) and
  `/healthz` shows `installer.state: "stale"` with the reason. Failed checks are retried every 30 seconds.
  With no good copy at all, `/install.sh` answers 503 and so does `/healthz` (`"failing"`).

- The release key is not an environment variable on purpose. When the app repo's key changes, change
  `brand/brand.json` here in the same release, or the site keeps serving the last installer signed with
  the old key.

## Code map

- `src/app.ts` builds the Elysia app (tests drive it with `app.handle()`); `src/index.ts` opens the
  database, listens, runs the hourly report sweep and shuts down cleanly on SIGTERM.
- `src/db.ts`: the connection (Postgres or SQLite), the pool and the tables.
- `src/telemetry/`, `src/reports/`, `src/installer/`: one folder per job, each with its routes and store.
- `src/reports/redaction.ts`: the secret patterns a report is checked against. The agent redacts
  before upload; this is the second line of defence. Add a rule here with a test in
  `test/redaction.test.ts` when a new kind of credential shows up in reports.
- `src/client-ip.ts`: the rate-limit key. With `TRUST_PROXY=true` it is the last `X-Forwarded-For` hop (what
  Traefik appended), or `cf-connecting-ip` when that hop is in Cloudflare's ranges, kept in the same file.
  Update the list when Cloudflare announces a change to https://www.cloudflare.com/ips/.
