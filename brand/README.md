# Brand

`brand.json` is the one place the site reads its name, URLs and GitHub repos from. `apps/landing`, `apps/docs`
and `apps/api` import it directly.

- `github.repo` is the app repo (`Seylo-dev/App`): the landing's GitHub and changelog links, and the release
  the site API serves `install.sh` from.
- `github.siteRepo` is this repo (`Seylo-dev/Website`): the docs' "Edit on GitHub" links point into it
  (`apps/docs/...`).
- `minisignPublicKey` is the release signing key, the same value as in the app repo's `brand/brand.json`.
  The site API serves `install.sh` only when the release's `manifest.json` is signed with it, and the docs
  print it for checking downloads by hand (`apps/api/test/brand.test.ts` checks they match).

It mirrors the app repo's `brand/brand.json` (the panel, agent and installer read that one), and the app
repo's `scripts/dev/check-site-brand.sh` checks that the URLs and the repo match. Keep the two copies (this one
and the app repo's) in sync when the brand or the domains change.

`mark.svg` is the logo mark. The landing page inlines it (`apps/landing/components/logo.tsx`); the report pages
show a plain accent square.
