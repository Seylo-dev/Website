import { createGetUrl } from "fumadocs-core/source";
import { brand } from "./brand";

export const appName = `${brand.name} Docs`;

/** Canonical origin - sitemap, OG images, metadataBase. */
export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? brand.urls.docs).replace(/\/$/, "");

/** Docs live at the root of the docs host: docs.seylo.dev/guides/databases. */
export const docsRoute = "/";
export const docsImageRoute = "/og";
export const docsContentRoute = "/llms.mdx";

const getContentUrl = createGetUrl(docsContentRoute);

/** `/guides/databases` -> `/llms.mdx/guides/databases/content.md` (the root page is `index`). */
export function getPageMarkdownUrl(page: { slugs: string[] }) {
  const segments = [...(page.slugs.length ? page.slugs : ["index"]), "content.md"];
  return { segments, url: getContentUrl(segments) };
}

const getImageUrl = createGetUrl(docsImageRoute);

export function getPageImageUrl(page: { slugs: string[] }) {
  const segments = [...(page.slugs.length ? page.slugs : ["index"]), "image.png"];
  return { segments, url: getImageUrl(segments) };
}
