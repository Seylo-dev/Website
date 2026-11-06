import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/shared";
import { source } from "@/lib/source";

export default function sitemap(): MetadataRoute.Sitemap {
  return source.getPages().map((page) => ({
    url: `${siteUrl}${page.url}`,
    changeFrequency: "weekly",
    priority: page.slugs.length === 0 ? 1 : page.slugs.length === 1 ? 0.8 : 0.6,
  }));
}
