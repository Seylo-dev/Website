# Notes for coding agents

This folder (`apps/docs` in the website repo) is the Seylo documentation site. `README.md` is the full guide; the
rules that matter most:

- Pages are MDX in `content/docs`. Frontmatter `title` and `description` are required, the body starts at
  `##`, and a page only shows in the sidebar once it is listed in `content/docs/meta.json`.
- Do not edit generated files by hand: `openapi.json` (`bun run openapi:sync`), `content/docs/reference/cli.mdx`
  (`bun run cli:reference <binary>`), the API reference pages, which come from `openapi.json`, and
  `content/generated/templates-catalog.mdx` (`tools/catalog/sync.ts`, run by `prebuild`).
- Describe what the panel does today. Name UI exactly as it is labelled; check the app repo
  (github.com/Seylo-dev/App) when unsure.
- Plain, direct writing. Use `-`, never em dashes. No marketing tone, no emoji.
- Next.js 16 and Fumadocs 16 differ from older versions. Read the docs shipped in `node_modules/next/dist/docs/`
  and the Fumadocs packages' types before writing code.
- Exact dependency versions. Run `bun run typecheck` and `bun run build` before you finish.
