# Landing page (`apps/landing`)

`seylo.dev`. Next.js 16 + Tailwind 4: floating nav, two-tone headline, the install command that copies on
click, features, then seven sections on what the panel does (templates, per-service settings, nodes, databases,
logs and alerts, people and access, white label), the Wings section, CTA and footer, in a dark theme (deep navy)
and a light one (the panel's light look). `/docs` and `/docs/*` redirect to the docs host.

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

## Light and dark

The page follows the system setting (`prefers-color-scheme`) until the visitor picks a theme with the menu in
the nav (`components/theme-toggle.tsx`: System, Light, Dark). The choice is saved in `localStorage` under
`theme` (`lib/theme.ts`; "System" removes it) and goes on `<html>` as the class `light` or `dark`; no class
means "follow the system". A tiny inline script in `app/layout.tsx` sets that class before the first paint, so
a saved choice never flashes the other theme, and without JavaScript the page still follows the system.

- Every color is a token in `app/globals.css`: `@theme` holds the dark values, a `light` block redefines each
  one. Shadows, rims and the shot frames are CSS variables there too (`--lift`, `--edge*`, `--shot-*`). Dark
  has faint inset rims and no card shadows; light has no rims, only soft shadows, white cards on a tinted gray
  ground. Add a color as a token with both values, never as a hex in a component.
- `light:` and `dark:` are custom variants that match the class or, without one, the system setting. They are
  exact complements, so `dark:hidden` on one element and `light:hidden` on another always shows exactly one.
- The starfield behind the hero is dark only.

## The hero screenshot

`public/product/dashboard.webp` and `dashboard-dark.webp` are captures of the panel dashboard in its light and
dark theme (three nodes with live graphs, projects with running services), taken from the panel's demo mode
with Playwright by `tools/hero-shot` (see its README to retake them). The page shows the one that matches its
theme.

`components/product-shot.tsx` shows it in 3D: tilted in perspective, the sidebar strip cut out and set back in
depth, the bottom and side edges fading into the page. In dark the frame has a light rim and a blue glow (a
dark shadow would not show on navy); in light a soft shadow and a paler glow. On phones the shot is drawn at
about twice the screen width and cut on the right, so the text stays legible. The tilt, fade and glow live in
`app/globals.css` (`.product-shot*`, `--shot-*`). Both theme files load eagerly, since the hero is first paint.

To swap the image: write the new captures (16:10, e.g. 2400x1500, the same size in both themes) to
`public/product/`, and in `app/page.tsx` set `heroShot` to their paths and size and `sidebarRatio` to the
sidebar's width divided by the image width (`tools/hero-shot` prints it).

## The section captures

The seven sections under Features show real crops of the panel (v0.1.1) instead of drawn mock-ups:
`public/product/<name>.webp` in the panel's light theme and `<name>-dark.webp` in its dark theme, from the same
demo data, listed with their size and alt text in `lib/captures.ts`. They come from the panel's demo mode at 2x,
taken by `tools/hero-shot/sections.ts --both` (see its README, "Demo mode"). The four theme preset previews of
the White label section show each preset as it is, so they have one file each.
The template tiles come from `lib/templates.ts`, generated from the panel's catalog by
`tools/hero-shot/catalog.ts`.

- `components/shot.tsx`: `ThemeImage` (the light and the dark file as two images, one hidden by CSS; lazy, so
  the hidden one is not fetched), `Shot` (rounded, no rim, a drop shadow plus a faint blue glow; `fade` for
  tall crops, `phoneCut` draws wide crops larger on phones and fades them out on the right), `CellShot` (a
  capture at the bottom of a bento cell, running off its edge) and `Chips`.
- Blocks with the `rise` class fade up as they scroll in, with a CSS scroll timeline (`app/globals.css`). No
  script; nothing animates under reduced motion or without scroll timelines, and a block is in its final
  state until its top edge enters the viewport, so full-page screenshots and pages without JavaScript show
  everything.
- Every claim on the page is checked against the released panel; keep it that way when the panel changes
  (unreleased work stays off the page).
