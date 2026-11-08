import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
import brand from "../../brand/brand.json";

// The site API (apps/api) keeps troubleshoot reports. Report links read `<site>/l/<id>` and
// `seylo troubleshoot` uploads to `<site>/l`, so those paths redirect to the api's public host with a
// 307, which keeps the method and the body (the CLI's Go client sends the upload again). Uploads reach
// the api the way its own requests do, through Cloudflare and Traefik, and its upload limit keys on
// the visitor. A proxy here would not: through the public api host Cloudflare names this host as the
// visitor, and the api's private name on the Easypanel network depends on the project's name.
const apiUrl = brand.urls.api.replace(/\/$/, "");
const docsUrl = brand.urls.docs.replace(/\/$/, "");
// The repo root: one bun.lock and node_modules for every app. `output: "standalone"` writes a
// self-contained server (apps/landing/server.js) for the Dockerfile.
const root = fileURLToPath(new URL("../..", import.meta.url));

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: "standalone",
  turbopack: { root },
  outputFileTracingRoot: root,
  // No AGENTS.md: `next dev` should not write one into this folder.
  agentRules: false,
  // Early builds printed <site>/docs; the docs live on their own host.
  async redirects() {
    return [
      { source: "/docs", destination: docsUrl, permanent: true },
      { source: "/docs/:path*", destination: `${docsUrl}/:path*`, permanent: true },
      // 307: 301, 302 and 303 turn the upload into a GET, and browsers keep a 308 for good.
      { source: "/l", destination: `${apiUrl}/l`, statusCode: 307 },
      { source: "/l/:path*", destination: `${apiUrl}/l/:path*`, statusCode: 307 },
    ];
  },
};

export default config;
