# Hero shot (`tools/hero-shot`)

Makes the landing hero image: a real screenshot of the panel dashboard (three nodes with live graphs,
projects with running services), taken with Playwright from a running panel. The landing shows it in the 3D
frame in `apps/landing/components/product-shot.tsx`.

```bash
bun install              # once, at the repo root (this folder is a workspace)
./stage.sh               # demo projects + load on the nodes (once; then let it run for an hour)
bun run capture.ts       # -> out/dashboard.png and apps/landing/public/product/dashboard.webp
bun run preview.ts       # landing hero at 1440x900 and 390x844 -> out/hero-*.png
```

## What you need

- A panel with three joined nodes, signed-in access as the owner and an API key. The 2026-11-05 and 2026-11-06
  shots used the e2e panel from `seylo/test/e2e-colima` (`make e2e KEEP=1`), whose state lives in
  `~/.cache/seylo-e2e/state`: `api-key`, `cookies` (the owner's `seylo_session`) and `owner` (email and
  password, used only when the cookie has expired). Point the scripts elsewhere with `PANEL`, `API_KEY_FILE`,
  `SESSION_COOKIES`, `OWNER_FILE`.
- Chromium for Playwright 1.56 (`bunx playwright install chromium` if it is not cached yet).

## 1. Make the panel look like a real deployment

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

## 2. Capture

`bun run capture.ts` signs in, opens the dashboard at 1600x1000 CSS pixels at 1.5x (2400x1500), waits for the
node graphs to draw, and refuses to save when the visible part of the page shows `e2e`, `test`, `colima`,
`failed`, an error or an empty state. It prints the sidebar's share of the width (`sidebarRatio`, 0.155 for
the 248px sidebar at 1600px) for `apps/landing/app/page.tsx`. `--dark` writes `out/dashboard-dark.png` with the
panel's dark theme instead (not used: on the navy page the light shot has the contrast).

Open `out/dashboard.png` and look at it before committing.

## 3. Check the landing

```bash
cd ../../apps/landing && bun run build && PORT=3917 bun run start
cd ../../tools/hero-shot && bun run preview.ts http://localhost:3917
```

`preview.ts` fails when the page scrolls sideways. Tune the frame in `apps/landing/app/globals.css`
(`.product-shot*`: tilt, fade, glow, the phone layout that runs the shot wider than the screen).

## Section captures

The landing's seven sections (templates, settings, nodes, databases, logs and alerts, access, white label) use
crops of single screens, taken from the panel's demo mode rather than a fleet: the panel runs from source on
an empty data dir, the web app's Vite server sits in front of it, and Playwright answers the panel's API calls
with the demo data of the panel's own browser tests (`test/playwright/demo` in the panel repo), patched here
with generic data for these crops (`sections-demo.patch`: the released version 0.1.1, the 16 real node checks,
an uptime history, a load-balanced service, access rules, varied log lines, no person's name). The template
catalog is not mocked: the panel serves its real 23 templates and their generated logos. Never commit the
demo changes to the panel repo; they live in this patch.

```bash
SEYLO=$(cd ../../../seylo && pwd)    # the panel's checkout
DATA=$(mktemp -d) EMAIL=owner@example.com PASS=$(openssl rand -hex 12)
mkdir -p out && printf '%s\n%s\n' "$EMAIL" "$PASS" > out/owner
(cd $SEYLO/apps/panel && SEYLO_DATA_DIR=$DATA bun scripts/create-owner.ts "$EMAIL" "$PASS")
SEYLO_DATA_DIR=$DATA SEYLO_PORT=3951 SEYLO_HOST=127.0.0.1 SEYLO_SECURE_COOKIES=false bun $SEYLO/apps/panel/src/main.ts &
(cd $SEYLO/apps/web && PANEL_URL=http://127.0.0.1:3951 ./node_modules/.bin/vite --port 3952 --strictPort --host 127.0.0.1) &

rm -rf out/demo && cp -R $SEYLO/test/playwright/demo out/demo && patch -p1 -d out < sections-demo.patch
bun run sections.ts                  # every crop; or name some: bun run sections.ts env metrics
SEYLO_DIR=$SEYLO bun run catalog.ts  # apps/landing/lib/templates.ts from the panel's templates/
```

`sections.ts` signs in as the owner, opens each screen at 2x in the light theme, narrows a card where a crop
reads better smaller, hides the other cards around it and writes `out/sections/<name>.png` and
`apps/landing/public/product/<name>.webp` (each well under 200 KB). Look at every PNG before committing. When a
crop's pixel size changes, update it in `apps/landing/lib/captures.ts`.
