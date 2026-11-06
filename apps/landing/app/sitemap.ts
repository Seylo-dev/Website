import type { MetadataRoute } from "next";
import { brand } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: brand.urls.site, changeFrequency: "weekly", priority: 1 }];
}
