# Site API (`apps/api`)

Bun + Elysia, one SQLite file. Three jobs, all public and unauthenticated:

| Route | What |
| --- | --- |
| `POST /telemetry` | Anonymous ping from a panel: `{ installId, version, nodes, services }`. Stored as one row per install per day, install id hashed. 60 pings per hour per IP. |
| `GET /telemetry/summary?days=30` | Daily totals and the version spread. Needs `Authorization: Bearer $STATS_TOKEN`; 404 when the token isn't set. |
| `POST /l` | Upload a troubleshoot report (Markdown body, max 512 KB, 20 uploads per hour per IP). Refused with 422 if it still contains something that looks like a secret. Returns `{ id, url, expiresAt, deleteToken }`. |
| `GET /l/:id` | The report as a locked-down HTML page (no scripts, no remote images, `noindex`). `GET /l/:id/raw` returns the Markdown. |
| `DELETE /l/:id` | Deletes a report early with `Authorization: Bearer <deleteToken>`. |
| `GET /install.sh` | The installer from the latest GitHub release, cached for 5 minutes. On the `install.` host it is also served at `/`, which is what `curl -fsSL https://install.seylo.dev \| sudo sh` hits. |
| `GET /healthz` | `ok` |

Reports expire 30 days after upload: reads hide them right away and an hourly sweep deletes them.

## Run

```bash
bun run dev      # from this folder, or `bun run dev:api` from the repo root
bun test
bun run build    # single-file bundle in dist/, run with `bun dist/index.js`
```

Settings are environment variables, all optional. See `.env.example`.

## Where it sits

- `install.seylo.dev` and `api.seylo.dev` both point at this process.
- The landing page rewrites `/l/*` here, so report links read `https://seylo.dev/l/<id>`.
- The installer fetch only accepts a body that starts with `#!`, so a GitHub error page can never be
  piped into someone's shell. If GitHub is down the last good copy keeps being served.

## Code map

- `src/app.ts` builds the Elysia app (tests drive it with `app.handle()`); `src/index.ts` listens.
- `src/telemetry/`, `src/reports/`, `src/installer/`: one folder per job, each with its routes and store.
- `src/reports/redaction.ts`: the secret patterns a report is checked against. The agent redacts
  before upload; this is the second line of defence. Add a rule here with a test in
  `test/redaction.test.ts` when a new kind of credential shows up in reports.
