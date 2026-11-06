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
