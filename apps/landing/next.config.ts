import type { NextConfig } from "next";
import brand from "../../brand/brand.json";

// The site API (apps/api). Troubleshoot report links read `<site>/l/<id>`, so those paths are
// proxied there instead of being pages of this app.
const apiUrl = (process.env.SITE_API_URL ?? "http://localhost:4000").replace(/\/$/, "");
const docsUrl = brand.urls.docs.replace(/\/$/, "");

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // No AGENTS.md: `next dev` should not write one into this folder.
  agentRules: false,
  // Early builds printed <site>/docs; the docs live on their own host.
  async redirects() {
    return [
      { source: "/docs", destination: docsUrl, permanent: true },
      { source: "/docs/:path*", destination: `${docsUrl}/:path*`, permanent: true },
    ];
  },
  async rewrites() {
    return [
      { source: "/l", destination: `${apiUrl}/l` },
      { source: "/l/:path*", destination: `${apiUrl}/l/:path*` },
    ];
  },
};

export default config;
