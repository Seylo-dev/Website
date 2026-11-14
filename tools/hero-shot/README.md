# Hero shot (`tools/hero-shot`)

Makes the landing's panel captures: the hero dashboard (three nodes with lively graphs, projects with running
services) and the crops of the seven sections, each in the panel's light theme and in its default dark theme
from the same demo data, taken with Playwright. The landing shows the hero in the 3D frame in
`apps/landing/components/product-shot.tsx` and the crops through `apps/landing/lib/captures.ts`, each in the
page's theme.

```bash
bun install                  # once, at the repo root (this folder is a workspace)
# panel + web from source and the patched demo data: see "Demo mode" below
bun run sections.ts --both   # hero + every crop, light and dark -> apps/landing/public/product/<name>[-dark].webp
bun run preview.ts           # landing hero at 1440x900 and 390x844 in both themes -> out/hero-*.png
```

## What you need

- A checkout of the panel (`seylo`, next to this repo) with its dependencies installed. Run it from a scratch
  copy (`cp -cR seylo /tmp/seylo-shots` on macOS clones it in seconds), so nothing lands in the real checkout.
- Chromium for Playwright 1.56 (`bunx playwright install chromium` if it is not cached yet).

## Demo mode

The hero and the seven sections (templates, settings, nodes, databases, logs and alerts, access, white label)
come from the panel's demo mode rather than a fleet: the panel runs from source on an empty data dir, the web
app's Vite server sits in front of it, and Playwright answers the panel's API calls with the demo data of the
panel's own browser tests (`test/playwright/demo` in the panel repo), patched here with generic data for these
captures (`sections-demo.patch`: the released version 0.2.13, the 20 real node checks, an uptime history, a
load-balanced service, access rules, an exposed Postgres with a Let's Encrypt certificate, varied log lines,
the worker's env with its `${{api.URL}}` reference on the last line so the editor's hover opens over plain
lines, no person's name). The template catalog is not mocked: the panel serves its real 23 templates and their
logos. Never commit the demo changes to the panel repo; they live in this patch. When the panel's demo moved on
and the patch no longer applies, apply it with rejects to a copy, redo the rejected hunks by hand and write the
patch again with `diff -ru a/demo b/demo`.

```bash
SEYLO=/tmp/seylo-shots               # the scratch copy of the panel's checkout
DATA=$(mktemp -d) EMAIL=owner@example.com PASS=$(openssl rand -hex 12)
mkdir -p out && printf '%s\n%s\n' "$EMAIL" "$PASS" > out/owner
printf '%s\n' "$PASS" | (cd $SEYLO/apps/panel && SEYLO_DATA_DIR=$DATA bun scripts/create-owner.ts "$EMAIL")  # password on stdin
SEYLO_DATA_DIR=$DATA SEYLO_PORT=3951 SEYLO_HOST=127.0.0.1 SEYLO_SECURE_COOKIES=false bun $SEYLO/apps/panel/src/main.ts &
(cd $SEYLO/apps/web && PANEL_URL=http://127.0.0.1:3951 ./node_modules/.bin/vite --port 3952 --strictPort --host 127.0.0.1) &

rm -rf out/demo && cp -R $SEYLO/test/playwright/demo out/demo && patch -p1 -d out < sections-demo.patch
bun run sections.ts --both           # everything, light and dark; or name some: bun run sections.ts --both env metrics
```

`sections.ts` signs in as the owner (the session cookie plus its key, which the web app keeps in localStorage),
opens each screen at 2x, narrows a card where a crop reads better smaller,
hides the other cards around it and writes `out/sections/<name>.png` and `apps/landing/public/product/<name>.webp`
(each under 200 KB; the run lists any file over that). Look at every PNG before committing. When a crop's pixel
size changes, update it in `apps/landing/lib/captures.ts`.

### Light and dark

| Flag     | Takes                                                              |
| -------- | ------------------------------------------------------------------ |
| (none)   | the light theme: `<name>.png` / `<name>.webp`                      |
| `--dark` | the dark theme only: `<name>-dark.png` / `<name>-dark.webp`        |
| `--both` | both, light then dark for each capture, so a pair is seconds apart |

Every shot runs with color mode "system", so the browser's light or dark mode picks the preset's half: dark is
what a user gets with the default theme on a dark system. Both themes use the same demo data, and every page's clock is frozen at the moment the
run started (`page.clock.setFixedTime`), so "5 minutes ago", countdowns and the like read the same in the light
and the dark file. The env editor is the exception (`runningClock`): its syntax highlighting needs a running clock,
and it shows no times. The time of day (the dashboard's greeting, log times, the backups' times) is the browser's,
which follows `TZ`: the committed crops read about 06:00, "Good morning" and backups at 03:xx under "Daily at
03:00", so run where it is morning or set a `TZ` where it is (`TZ=Pacific/Pago_Pago bun run sections.ts --both`
in a European evening). The light and dark files of a capture have the same pixel size. The ten `theme-*` shots
(the White label section's preset previews) show the dashboard in one preset each, at 1440x900 and 1x,
written at 720x450, in its light and its dark half like the other shots.

### The hero

The `dashboard` shot is the hero: the whole dashboard at 1600x1000 CSS pixels at 1.5x (2400x1500). It
shows the Nodes card on 1h (`seylo.dashboard.nodesRange` in localStorage: Live, the default, would draw the
demo's live samples, which the frozen clock stacks on one moment) and overrides two demo answers:
`metrics.nodes` gets livelier lines (the demo's three nodes at their own levels,
faster swings and a little deterministic jitter, each line ending on the node's current usage so the numbers
under the graphs match; the points are laid out from the run's frozen clock, so the light and the dark pass
get the same lines), and `updates.status` has no rollout running and every node on 0.2.13, so the sidebar
says "up to date". It refuses to save when the visible page shows `e2e`, `test`, `colima`, `failed`, an error
or an empty state, and prints the sidebar's share of the width (`sidebarRatio`, 0.155 for the 248px sidebar at
1600px) for `heroShot` in `apps/landing/lib/captures.ts`.

## Check the landing

```bash
cd ../../apps/landing && bun run build && PORT=3917 bun run start
cd ../../tools/hero-shot && bun run preview.ts http://localhost:3917
```

`preview.ts` takes the hero in the light and the dark theme (the system setting, so no saved choice) and fails
when the page scrolls sideways. Tune the frame in `apps/landing/app/globals.css` (`.product-shot*`: tilt, fade,
glow, the phone layout that runs the shot wider than the screen; the rim, shadow and glow colors per theme are
the `--shot-*` variables).

## From a real panel

`capture.ts` takes the same dashboard from a running panel with real nodes instead of the demo (the 2026-11-05
and 2026-11-06 heroes came this way). It takes the same theme flags: `--dark` writes `out/dashboard-dark.png`
and `dashboard-dark.webp`, `--both` takes light and then dark. On the dark pass the browser asks for dark mode,
so a panel on color mode "system" paints its theme's dark half (a 0.1 panel's default theme painted
`seylo-night`). It signs in with the session cookie only: a panel from 0.2 also wants the session key that
`sections.ts` sets, so update it the same way before taking a hero from a real panel again.

- A panel with three joined nodes, signed-in access as the owner and an API key. Those shots used the e2e panel
  from `seylo/test/e2e-colima` (`make e2e KEEP=1`), whose state lives in `~/.cache/seylo-e2e/state`: `api-key`,
  `cookies` (the owner's `seylo_session`) and `owner` (email and password, used only when the cookie has
  expired). Point the scripts elsewhere with `PANEL`, `API_KEY_FILE`, `SESSION_COOKIES`, `OWNER_FILE`.

```bash
./stage.sh                   # demo projects + load on the nodes (once; then let it run for an hour)
bun run capture.ts --both    # -> out/dashboard[-dark].png and apps/landing/public/product/dashboard[-dark].webp
```

Everything goes through the panel's REST API (`/api/v1/<op id>`), no access to the nodes:

1. Remove leftover projects and services (`services.delete`, then `projects.delete`). A pending approval can
   only be decided by a signed-in person (`approvals.deny` with the session cookie, not the API key).
2. Rename the nodes (`nodes.rename` to `fra-1`, `ams-1`, `nyc-1`; `nodes.updateSettings` for the location).
3. Give the owner a generic display name: `auth.updateProfile {"name":"Admin"}` with the session cookie. Never
   a person's name.
4. `./stage.sh` creates three projects on the three nodes:

   | Project    | Node  | Services                                                        |
   | ---------- | ----- | --------------------------------------------------------------- |
   | storefront | fra-1 | web (nginx), api, worker (Python), postgres, redis              |
   | analytics  | ams-1 | collector (Python), postgres, grafana (template)                |
   | docs       | nyc-1 | site (nginx), search (Meilisearch template), og-images (Python) |

   The Python services run `demo-load.py`: a few processes burning CPU on a slow sum-of-sines duty cycle, a
   memory hold that drifts the same way, and an HTTP loop that pulls bytes from a peer service on another node
   through its first-run `IP:port`, so every node's physical interface carries traffic. The knobs are env vars
   (`PROCS`, `CPU`, `AMP`, `PERIOD`, `MEM`, `MEMAMP`, `NET`, `PEER`); `stage.sh` gives each node a different
   level so the three lines in each graph stay apart. It is safe to rerun: existing services are reused and
   redeployed with the current settings. It also moves the protected Panel project last and collapses it.

The dashboard graphs default to the last hour, so wait about an hour after staging before capturing: with
less, the left part of each graph still shows the quiet time before staging and the image-pull spike.

The sidebar shows an "update available" note when the panel's last update check saw a newer release. On
the e2e panel, check that the release mirror's latest (`/repos/<org>/<repo>/releases/latest` on the
`test/e2e-colima/serve.sh` server) is the version the panel runs, then call `updates.check` (POST with the API
key) right before capturing; the sidebar then says "up to date". If a newer test release is the mirror's
latest, publish the running version for the capture (`test/e2e-colima/publish.sh <version>`) and publish the
newer one again afterwards.

`capture.ts` refuses to save on the same words as the demo hero and prints `sidebarRatio`. Open the PNGs and
look at them before committing. `out/dashboard.png` in git is the 2026-11-06 capture from the e2e panel.
