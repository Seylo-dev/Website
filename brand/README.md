# Brand

`brand.json` is the one place the site reads its name, URLs and GitHub repos from. `apps/landing` and
`apps/api` import it directly.

- `github.repo` is the app repo (`Seylo-dev/App`): the landing's GitHub and changelog links, and the release
  the site API serves `install.sh` from.
- `github.docsRepo` is the docs repo (`Seylo-dev/Docs`), which has its own copy of this file.

It mirrors the app repo's `brand/brand.json` (the panel, agent and installer read that one), and the app
repo's `scripts/dev/check-site-brand.sh` checks that the URLs and the repo match. Keep all three in sync when
the brand or the domains change.

`mark.svg` is the logo mark. The landing page inlines it (`apps/landing/components/logo.tsx`); the report pages
show a plain accent square.
