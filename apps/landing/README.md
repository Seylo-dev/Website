# Landing page (`apps/landing`)

`seylo.dev`. Next.js 16 + Tailwind 4: deep navy, floating nav, two-tone headline, the install command that
copies on click, features, then seven sections on what the panel does (templates, per-service settings, nodes,
databases, logs and alerts, people and access, white label), the Wings section, CTA and footer. `/docs` and
`/docs/*` redirect to the docs host.

```bash
bun run dev      # :$PORT, default 3000 (or `bun run dev:landing` from the repo root)
bun run build    # standalone output, what the Dockerfile ships
bun run start    # serves the build (Next warns about standalone; it still works)
```

| Var            | Default                 | What                                                                    |
| -------------- | ----------------------- | ----------------------------------------------------------------------- |
| `PORT`         | `3000`                  | Port for `dev` and `start`                                              |
| `SITE_API_URL` | `http://localhost:4000` | The site API. `/l` and `/l/*` (troubleshoot reports) are proxied there. |

`SITE_API_URL` is read at build time (the rewrite is baked into the build). The Dockerfile defaults it to
`https://api.seylo.dev`.

Names, URLs and the GitHub repo come from `brand/brand.json` through `lib/site.ts`.

## The hero screenshot

`public/product/dashboard.webp` is a real capture of the panel dashboard (three nodes with live graphs, three
projects with running services), taken with Playwright by `tools/hero-shot` (see its README to retake it).

`components/product-shot.tsx` shows it in 3D: tilted in perspective, the sidebar strip cut out and set back in
depth, a light rim and a blue glow (a dark shadow would not show on navy), and the bottom and side edges
fading into the page. On phones the shot is drawn at about twice the screen width and cut on the right, so
the text stays legible. The tilt, fade and glow live in `app/globals.css` (`.product-shot*`).

To swap the image: write the new capture (16:10, e.g. 2400x1500) to `public/product/`, and in `app/page.tsx`
set `heroShot` to its path and size and `sidebarRatio` to the sidebar's width divided by the image width
(`tools/hero-shot/capture.ts` prints it).

## The section captures

The seven sections under Features show real crops of the panel (v0.1.1, light theme) instead of drawn
mock-ups: `public/product/*.webp`, listed with their size and alt text in `lib/captures.ts`. They come from
the panel's demo mode at 2x, taken by `tools/hero-shot/sections.ts` (see its README, "Section captures").
The template tiles come from `lib/templates.ts`, generated from the panel's catalog by
`tools/hero-shot/catalog.ts`.

- `components/shot.tsx`: `Shot` (rounded, no rim, dark drop shadow plus a faint blue glow; `fade` for tall
  crops, `phoneCut` draws wide crops larger on phones and fades them out on the right), `CellShot` (a capture
  at the bottom of a bento cell, running off its edge) and `Chips`.
- Blocks with the `rise` class fade up as they scroll in, with a CSS scroll timeline (`app/globals.css`). No
  script; nothing animates under reduced motion or without scroll timelines, and a block is in its final
  state until its top edge enters the viewport, so full-page screenshots and pages without JavaScript show
  everything.
- Every claim on the page is checked against the released panel; keep it that way when the panel changes
  (unreleased work stays off the page).
