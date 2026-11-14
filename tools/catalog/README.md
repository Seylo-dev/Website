# Template catalog (`tools/catalog`)

The landing's template list and the docs' table of templates come from the catalog that
[Seylo-dev/Templates](https://github.com/Seylo-dev/Templates) publishes on every merge: one `catalog.json`
signed with minisign, on the rolling release `catalog`
(`https://github.com/Seylo-dev/Templates/releases/download/catalog/catalog.json` and `.minisig`). Panels
download the same file. Its format is the App repo's `apps/panel/src/modules/templates/catalog-file.ts`
(format 1).

`sync.ts` downloads it, checks it and writes the site's copy:

| File                                                | What                                                       |
| --------------------------------------------------- | ---------------------------------------------------------- |
| `apps/landing/lib/templates.generated.json`         | the landing's list: name, category, letter tile, logo path |
| `apps/landing/public/templates/<slug>/logo.<ext>`   | the logos, with `NOTICE` and `LICENSE.*` from the catalog  |
| `apps/docs/content/generated/templates-catalog.mdx` | the count and table the Templates guide includes           |

All three are committed. Never edit them by hand.

```bash
bun tools/catalog/sync.ts            # download, verify, write; exits 1 on any problem
bun tools/catalog/sync.ts --soft     # what the builds run (prebuild of apps/landing and apps/docs)
bun tools/catalog/sync.ts --local ../seylo/templates/catalog.json   # a local copy, such as the App's
```

## What it checks

- The signature, with `templatesMinisignPublicKey` in `brand/brand.json` (the catalog's own key, not the
  release key; the same value as in the App repo's `brand/brand.json`).
- `format` 1, `source` `Seylo-dev/Templates` (`github.templatesRepo`), and every file's sha256.
- A `sequence` not lower than the committed copy's, so an old catalog never replaces a newer one.
- At most 20 MB, 15 s per file, no redirect away from https.
- Slugs that are safe file names, and logos the panel would accept: SVG under 50 KB with no script, event
  handler, foreignObject, embedded image or external link; WebP or PNG under 30 KB that really are one. A logo
  that fails is left out (the template gets its letter tile) with a warning. The landing also serves
  `/templates/*` with a sandbox CSP and `nosniff` (`apps/landing/next.config.ts`).

Any of these failing refuses the whole catalog. `--soft` then prints why, keeps the committed copy and exits 0,
so a build never fails because GitHub is unreachable or the catalog is not published yet, and never uses one
it could not verify. Without `--soft` it exits 1 and writes nothing.

While `templatesMinisignPublicKey` is a placeholder (the key is not made yet), nothing can be verified:
downloads are refused and only `--local` works, writing the copy unsigned with a warning. Once the key is
set, `--local` needs the file's `.minisig` next to it (or `--signature <file>`).

## Keeping the committed copy fresh

Every landing and docs build already writes the newest catalog it can verify, so a deploy shows new templates.
To update the copy in git (the fallback for offline builds), run `bun tools/catalog/sync.ts` and commit the
three outputs.

`bun run test` at the repo root runs this folder's tests (`test/`).
