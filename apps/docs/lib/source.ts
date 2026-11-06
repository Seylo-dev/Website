import { llms, loader, multiple } from "fumadocs-core/source";
import { lucideIconsPlugin } from "fumadocs-core/source/lucide-icons";
import { metaSchema, pageSchema } from "fumadocs-core/source/schema";
import { defineDocs } from "fumadocs-mdx/macro";
import { openapi } from "./openapi";
import { docsRoute } from "./shared";

const docs = defineDocs({
  dir: "content/docs",
  docs: {
    schema: pageSchema,
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
  meta: {
    schema: metaSchema,
  },
});

export const source = loader(
  multiple({
    docs: docs.toFumadocsSource(),
    // One generated page per API operation, grouped by tag inside the api-reference folder next
    // to the hand-written overview (its index page). `meta` writes the folders' meta.json with the
    // tags' display names, including api-reference/meta.json itself, so the content folder has
    // none. Without a spec this adds nothing (see lib/openapi.ts).
    openapi: await openapi.staticSource({ baseDir: "api-reference", groupBy: "tag", meta: true }),
  }),
  {
    baseUrl: docsRoute,
    plugins: [lucideIconsPlugin(), openapi.loaderPlugin()],
  },
);

export type DocsPage = ReturnType<typeof source.getPages>[number];

/** Markdown of a page for agents. API operations have no MDX body, so they get a short pointer. */
async function pageMarkdown(page: DocsPage): Promise<string> {
  if (page.data.type === "docs") return page.data.getText("processed");
  return `${page.data.description ?? ""}\n\nThe full request and response schema is in the OpenAPI document.`;
}

export const docsLlms = llms(source, {
  renderPage: async (page) => `# ${page.data.title} (${page.url})

${await pageMarkdown(page)}`,
});
