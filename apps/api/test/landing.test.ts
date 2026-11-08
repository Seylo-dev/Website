import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import brand from "../../../brand/brand.json";
import landing from "../../landing/next.config";

// `seylo troubleshoot` uploads to seylo.dev/l (POST) and report links read seylo.dev/l/<id>. The landing
// answers both with a redirect to this api's public host, so uploads reach it visitor -> Cloudflare ->
// Traefik -> api like every other request and the upload limit keys on the visitor (client-ip.ts). A
// proxy in the landing would make the landing the visitor: through the public api host every upload
// from everyone would share the landing's 20-an-hour budget.
const api = brand.urls.api.replace(/\/$/, "");
const isReportPath = (source: string) => source === "/l" || source.startsWith("/l/");

describe("the landing's /l", () => {
  test("redirects uploads and report pages to the api with a 307", async () => {
    const redirects = (await landing.redirects?.()) ?? [];
    // 307 keeps the method and the body; 301, 302 and 303 turn the upload into a GET, and a 308 would
    // stay in browsers' caches for good.
    expect(redirects.filter((r) => isReportPath(r.source))).toEqual([
      { source: "/l", destination: `${api}/l`, statusCode: 307 },
      { source: "/l/:path*", destination: `${api}/l/:path*`, statusCode: 307 },
    ]);
  });

  test("is not proxied", async () => {
    const rewrites = (await landing.rewrites?.()) ?? [];
    const all = Array.isArray(rewrites)
      ? rewrites
      : [...(rewrites.beforeFiles ?? []), ...(rewrites.afterFiles ?? []), ...(rewrites.fallback ?? [])];
    expect(all.filter((r) => isReportPath(r.source))).toEqual([]);
  });

  test("the landing image has no api address to set", () => {
    const dockerfile = readFileSync(resolve(import.meta.dir, "../../landing/Dockerfile"), "utf8");
    expect(dockerfile).not.toContain("SITE_API_URL");
  });
});
