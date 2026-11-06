import type { MetadataRoute } from "next";
import { brand } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    // Troubleshoot reports are private links, never something to index.
    rules: { userAgent: "*", allow: "/", disallow: "/l/" },
    sitemap: `${brand.urls.site}/sitemap.xml`,
  };
}
