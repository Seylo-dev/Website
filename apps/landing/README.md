# Landing page (`apps/landing`)

`seylo.dev`. Next.js 16 + Tailwind 4: deep navy, floating nav, two-tone headline, the install command that
copies on click, features, three commands, the Wings section, CTA and footer. `/docs` and `/docs/*` redirect to
the docs host.

```bash
bun run dev      # :$PORT, default 3000 (or `bun run dev:landing` from the repo root)
bun run build
bun run start
```

| Var            | Default                 | What                                                                    |
| -------------- | ----------------------- | ----------------------------------------------------------------------- |
| `PORT`         | `3000`                  | Port for `dev` and `start`                                              |
| `SITE_API_URL` | `http://localhost:4000` | The site API. `/l` and `/l/*` (troubleshoot reports) are proxied there. |

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
