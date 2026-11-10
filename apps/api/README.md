# Site API (`apps/api`)

Bun + Elysia, with Postgres in production and a SQLite file in dev. Four jobs, all public and
unauthenticated:

| Route | What |
| --- | --- |
| `POST /telemetry` | Anonymous ping from a panel: `{ installId, version, nodes, services }`. Stored as one row per install per day, install id hashed. 60 pings per hour per IP (IPv6: per /64), and at most 100 new installs per IP per day (429). |
| `GET /telemetry/summary?days=30` | Daily totals and the version spread. Needs `Authorization: Bearer $STATS_TOKEN`; 404 when the token isn't set. |
| `POST /l` | Upload a troubleshoot report (Markdown body, max 512 KB, 20 uploads per hour per IP, IPv6 per /64). Refused with 422 if it still contains something that looks like a secret. Returns `{ id, url, expiresAt, deleteToken }`. |
| `GET /l/:id` | The report as a locked-down HTML page (no scripts, no remote images, `noindex`). `GET /l/:id/raw` returns the Markdown. |
| `DELETE /l/:id` | Deletes a report early with `Authorization: Bearer <deleteToken>`. |
| `GET /geo?ip=<address>` | Where a public IPv4 or IPv6 address is: `{ city, region, country, countryCode, attribution }`, each `null` when unknown, `attribution` always `"Geolocation by DB-IP (https://db-ip.com)"`. The panel asks once per node to fill in its Location. 400 `{ error: "invalid_ip" \| "not_public" }` for anything but one public address, 503 `{ error: "unavailable" }` with `Retry-After` while no database is loaded. 120 lookups per hour per IP (IPv6: per /64). Answered with `Cache-Control: no-store`; the address is never logged or stored. |
| `GET /install.sh` | The installer from the latest GitHub release, served only after it matches the release's signed manifest, cached for 5 minutes. On the `install.` host it is also served at `/`, which is what `curl -fsSL https://install.seylo.dev \| sudo sh` hits. `X-Installer-Version` and `X-Installer-Sha256` name the release and the hash. |
| `GET /healthz` | JSON: `status` (`ok` or `degraded`), `installer` (what is served and how the last release check went) and `geo` (the geolocation database: `ok`, `stale` when the last update failed, `missing`). 200 unless there is no verified installer to serve, then 503; `geo` changes neither. |

Reports expire 30 days after upload: reads hide them right away and an hourly sweep deletes them.

## Limits

The per-IP limits above keep one client from flooding the site, but not many: every IPv4 address and
every IPv6 /64 gets its own allowance, and an IPv6 /48 holds 65,536 of those. So the site also takes
a fixed amount per UTC day from everyone together:

| Setting | Default | What |
| --- | --- | --- |
| `REPORT_MIB_PER_DAY` | `2048` | MiB of reports, counted as stored. Reports live 30 days, so the table holds at most about 31 days of this. |
| `TELEMETRY_INSTALLS_PER_DAY` | `50000` | Installs that start a telemetry row. An install already counted that day keeps updating its row. |

Past a budget, `POST /l` or a new install's `POST /telemetry` answers 503 `{ "error": "daily_limit" }` with
`Retry-After` until 00:00 UTC, and the log gets one `[budget] ... is spent` line per day. Reading reports
and `/install.sh` never depend on it. `0` turns uploads or telemetry off. The amounts taken are kept in the
`daily_budget` table (one row per kind per day), so a restart doesn't hand out a second budget; the
per-IP counts live in memory only, so no address is ever stored.

When the log shows a budget spent by real use, raise it. When it is a flood, add a Cloudflare rate
limiting rule on `POST /l` and `POST /telemetry` for the `seylo.dev` and `api.seylo.dev` hosts: it
drops the requests before they reach this process.

## Run

```bash
bun run dev      # from this folder, or `bun run dev:api` from the repo root
bun test
bun run start    # what the Docker image runs: src/index.ts, no build step
bun run geo:update  # downloads the geolocation database (about 60 MB) for /geo in dev
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

## Geolocation

`GET /geo` reads DB-IP's [IP to City Lite](https://db-ip.com/db/download/ip-to-city-lite) database, a
MaxMind-format `.mmdb` DB-IP publishes at the start of every month under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The license asks for attribution: every answer
carries `"attribution": "Geolocation by DB-IP (https://db-ip.com)"`, and a page that shows a result (the
panel's node Location, the docs) says "Geolocation by DB-IP" with a link to https://db-ip.com.

- The file lives at `GEO_DB_PATH` (default `apps/api/data/geo/dbip-city-lite.mmdb`), with
  `dbip-city-lite.mmdb.json` next to it saying which month it is.
- `src/geo/update.ts` (`bun run geo:update`) downloads
  `https://download.db-ip.com/free/dbip-city-lite-<YYYY-MM>.mmdb.gz` for this month, or last month's while
  this month's is not out, unpacks it next to the old one, checks that it opens as an IPv6 city database,
  and only then renames it into place. A download that fails or doesn't check out leaves the old file as
  it was. A file that is already the newest is not downloaded again.
- The Docker image runs it at build time, so a new container answers from its first request. A failed
  download there doesn't fail the build: the API tries again at start.
- With `GEO_AUTO_UPDATE=true` (the default in production) the API checks at boot and every 6 hours whether
  the loaded file is this month's, and downloads the new one when it is out. The new file is loaded
  without a restart; until one loads, `/geo` answers 503. In dev it is off: run `bun run geo:update` once.
- The database is read memory-mapped from a private copy, so it stays out of the heap (it is over
  100 MB) and replacing the file under a running API is safe.
- Without a volume the file is downloaded again with every new image. To keep it across deploys, mount a
  volume at `/app/apps/api/data/geo`.

The address asked about is looked up and forgotten: it is not logged and not stored, and the answer is
sent with `Cache-Control: no-store`. The rate limit counts the caller in memory like on every other route.

## Where it sits

- `install.seylo.dev` and `api.seylo.dev` both point at this process.
- The landing page redirects `/l` and `/l/*` here with a 307, so report links read `https://seylo.dev/l/<id>`
  and uploads to `https://seylo.dev/l` arrive here from the visitor, through Cloudflare.
- `curl | sudo sh` runs the installer as root before it can check anything itself, so this API checks
  it first (`src/installer/source.ts`). Every check, at boot and then every 5 minutes:
  1. resolves `releases/latest` to a tag, once, and downloads `manifest.json`, `manifest.json.minisig`
     and `install.sh` from that tag, so the three can never come from two releases;
  2. verifies the manifest's minisign signature with `minisignPublicKey` from `brand/brand.json`
     (`src/installer/minisign.ts`, the same check as the panel's);
  3. requires the manifest's `version` to be the tag's and `sha256(install.sh)` to equal
     `installer.sha256` in the manifest (and its `size`, when set), and the script to start with `#!`;
  4. refuses a release older than the newest one this process has verified, compared as semver
     (`src/installer/semver.ts`: `0.2.0-rc.1` is older than `0.2.0`, `0.10.0` newer than `0.9.0`), so
     marking an older signed release "latest" on GitHub can't roll new installs back. The newer copy
     keeps being served, the log says `!!! REFUSED` and `/healthz` shows `"stale"` with error kind
     `downgrade`. The floor lives in memory: to roll back on purpose, restart the API.

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
- `src/telemetry/`, `src/reports/`, `src/installer/`, `src/geo/`: one folder per job, each with its routes
  and store (for geo: `database.ts` reads the file, `update.ts` downloads it, `source.ts` keeps it loaded,
  `address.ts` refuses private and reserved addresses). The tests build a small `.mmdb` of their own
  (`test/mmdb.ts`) and never download DB-IP's.
- `src/reports/redaction.ts`: the secret patterns a report is checked against. The agent redacts
  before upload; this is the second line of defence. Add a rule here with a test in
  `test/redaction.test.ts` when a new kind of credential shows up in reports.
- `src/daily-limits.ts`: the daily budgets (in the database) and the per-IP daily count of new installs
  (in memory).
- `src/client-ip.ts`: the rate-limit key. With `TRUST_PROXY=true` it is the last `X-Forwarded-For` hop (what
  Traefik appended), or `cf-connecting-ip` when that hop is in Cloudflare's ranges, kept in the same file.
  Update the list when Cloudflare announces a change to https://www.cloudflare.com/ips/.
