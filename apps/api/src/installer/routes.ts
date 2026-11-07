import { Elysia } from "elysia";
import type { InstallerSource } from "./source";

/**
 * `curl -fsSL install.seylo.dev | sh` requests `/` on the install host, so the script is served
 * there as well as at `/install.sh` on any host.
 */
export function installerRoutes(source: InstallerSource) {
  async function serve() {
    const installer = await source.get();
    if (!installer) {
      return new Response("echo 'The installer is unavailable right now. Try again in a minute.' >&2; exit 1\n", {
        status: 503,
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
      });
    }
    const headers: Record<string, string> = {
      // text/plain so opening the URL in a browser shows the script instead of downloading it.
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=300",
      "x-installer-origin": installer.origin,
    };
    // The release and the hash its signed manifest names, so a download can be checked by hand.
    if (installer.version) headers["x-installer-version"] = installer.version;
    if (installer.sha256) headers["x-installer-sha256"] = installer.sha256;
    return new Response(installer.script, { headers });
  }

  return new Elysia({ name: "installer" }).get("/install.sh", serve).get("/", ({ request }) => {
    if (new URL(request.url).hostname.startsWith("install.")) return serve();
    return { name: "seylo-site-api", endpoints: ["POST /telemetry", "POST /l", "GET /l/:id", "GET /install.sh"] };
  });
}
