# Seylo Docs

The documentation for [Seylo](https://github.com/Seylo-dev/App), served at [docs.seylo.dev](https://docs.seylo.dev).
Seylo itself (the panel, the agent, the installer and the templates) lives in
[Seylo-dev/App](https://github.com/Seylo-dev/App).

Next.js 16 and [Fumadocs](https://fumadocs.dev) 16: MDX pages, search, `llms.txt`, OG images, an API reference
generated from the panel's OpenAPI document and a CLI reference generated from the `seylo` binary.

## Run it

Part of the website monorepo: install once at the repo root (`bun install`), then from this folder:

```bash
bun run dev            # http://localhost:3001 (PORT changes it), or `bun run dev:docs` from the root
bun run build
bun run start          # serves the build, on PORT or 3001
bun run typecheck
```

Env (all optional):

| Var                    | Default                  | What                                                       |
| ---------------------- | ------------------------ | ---------------------------------------------------------- |
| `PORT`                 | `3001`                   | Port for `dev` and `start`                                 |
| `NEXT_PUBLIC_SITE_URL` | `https://docs.seylo.dev` | Canonical URL, sitemap, OG images (baked in at build time) |

Names, URLs and the GitHub repos come from the repo's [`brand/brand.json`](../../brand/brand.json). The
`Dockerfile` here is what Easypanel builds (see the root README).

## API reference

`openapi.json` is a committed copy of the panel's OpenAPI document, which the app repo generates from its
operation registry. The build reads only this file, so it never needs the network.

```bash
bun run openapi:sync                                   # the latest release's openapi.json
bun run openapi:sync --from /path/to/App/openapi.json  # a local clone of the app repo
```

The first form downloads `https://github.com/Seylo-dev/App/releases/latest/download/openapi.json`. Either way
the file is only replaced when the new one parses as an OpenAPI document.

- `lib/openapi-document.ts` prepares the document: display names for the tags (the sidebar groups), paths
  ordered by them, and a line on each operation saying who may call it (from the `x-permission`, `x-mcp` and
  `x-op-kind` extensions). Add a name to `tagNames` when the panel gets a new module.
- `lib/openapi.ts` feeds it to fumadocs-openapi, and `lib/source.ts` turns every operation into a page under
  `/api-reference/<tag>/<op id>`, with generated `meta.json` files for the groups.
- `components/api-page.tsx` renders an operation. The pages do not carry the document in their props; the
  browser loads it once, as its own chunk.
- `content/docs/api-reference/index.mdx` is the hand-written overview (auth, request style, errors, rate
  limits). That folder has no `meta.json` of its own: the generated one would clash with it.

## CLI reference

`content/docs/reference/cli.mdx` is generated from the `seylo` binary's own help, so it never drifts from
what shipped. Get a binary from a [release](https://github.com/Seylo-dev/App/releases) and run the script with
its path:

```bash
curl -fsSLo seylo https://github.com/Seylo-dev/App/releases/latest/download/seylo_darwin_arm64
chmod +x seylo
bun run cli:reference ./seylo
```

Pick the file for your machine: `seylo_darwin_arm64`, `seylo_darwin_amd64`, `seylo_linux_amd64` or
`seylo_linux_arm64` (not a Windows build: those leave the node commands out). Each release also has a
`checksums.txt`. To document commands that are not released yet, build the binary from the app repo instead
(`go build ./cmd/seylo` in its `go/` folder).

## Markdown for agents

- `/llms.txt` lists every page, `/llms-full.txt` has all of them in one file.
- Any page as Markdown: add `.md` (`/guides/databases.md`) or send `Accept: text/markdown`. `proxy.ts`
  rewrites those requests to the `llms.mdx` route.

## Writing a page

Content lives in `content/docs`. The URL is the file path: `content/docs/guides/databases.mdx` ->
`/guides/databases`, `index.mdx` -> the folder's own URL.

Every page starts with frontmatter. `title` and `description` are required; the description shows under the
title and in search results.

```mdx
---
title: Databases
description: Postgres, MySQL, MariaDB, MongoDB and Redis on the project's private network.
---
```

Do not repeat the title as a `#` heading, the layout renders it. Start the body with `##`.

The sidebar order and its groups (`---Deploy---` separators) are all in `content/docs/meta.json`, which lists
pages by path (`guides/databases`). Folders only shape the URLs; they have no `meta.json` of their own. A page
that is not listed there does not show in the sidebar.

### Components

Available in every MDX file without importing (`components/mdx.tsx`):

- `<Callout type="info|warn|error|success" title="...">` - asides. Use `warn` for things that lose data.
- `<Cards>` + `<Card title="..." description="..." href="/..." />` - link grids.
- `<Steps>` + `<Step>` - numbered procedures (put a `###` heading inside each step).
- `<Tabs items={["One", "Two"]}>` + `<Tab value="One">` - alternatives.
- `<Accordions>` + `<Accordion title="...">` - FAQs.
- `<TypeTable type={{ field: { type: "string", description: "...", default: "..." } }} />` - settings tables.
- `<Files>`, `<Folder name="..." defaultOpen>`, `<File name="..." />` - file trees.

### MDX gotchas

- `<` and `{` in prose are parsed as JSX. Put them in backticks: `` `<token>` ``, `` `${{db.DATABASE_URL}}` ``.
- Links between pages are absolute paths: `[Databases](/guides/databases)`.

## Contributing

Pull requests are welcome: fixes, missing steps, pages for features that have none. Every page has an
**Edit on GitHub** link to its file in this repo (`apps/docs/content/docs/...`). Bugs and feature requests for Seylo itself go to
[Seylo-dev/App](https://github.com/Seylo-dev/App/issues).

The style is plain and direct, for people running their own servers: say what the thing does, what to click,
what happens, and the rule that will bite them. Name panel UI exactly as it is labelled. Use `-`, not em
dashes. No marketing tone, no emoji.

Before you open a pull request, run `bun run typecheck` and `bun run build`. Dependencies use exact versions,
no ranges. Code is formatted with Prettier at 120 columns (`bunx prettier --write .`).

## License

- Code (the site, components and scripts): [MIT](../../LICENSE).
- Documentation text (everything under `content/`): [CC BY 4.0](LICENSE-CONTENT).
- `openapi.json` and the generated `content/docs/reference/cli.mdx` come from the app repo and keep its
  license, AGPL-3.0.
