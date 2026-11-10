import type { Server } from "bun";
import { Elysia } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import { clientKey } from "../client-ip";
import { checkAddress } from "./address";
import { GEO_ATTRIBUTION } from "./database";
import type { GeoSource } from "./source";

interface GeoRoutesOptions {
  geo: GeoSource;
  trustProxy: boolean;
  /** The listening server (null under `app.handle()`): the address of a connection comes from it. */
  getServer: () => Server<unknown> | null;
}

// A panel asks once per node, when the node joins (and once for the nodes it had before it knew
// how). This is room for a panel that brings many nodes at once, or many panels behind one NAT.
const LOOKUPS_PER_HOUR_PER_IP = 120;
// How long a panel should wait while there is no database yet (a fresh deploy downloading it).
const RETRY_AFTER_SECONDS = 600;

/**
 * GET /geo?ip=<address>: the city, region and country of a public address, from DB-IP's City Lite
 * database. The address is looked up and forgotten: it is never logged or stored (the per-address
 * rate limit counts the caller in memory, like every other route), and the answer is never cached.
 */
export function geoRoutes({ geo, trustProxy, getServer }: GeoRoutesOptions) {
  return new Elysia({ name: "geo" })
    .use(
      rateLimit({
        scoping: "scoped",
        duration: 60 * 60 * 1000,
        max: LOOKUPS_PER_HOUR_PER_IP,
        // Without it the limiter asks this plugin's own instance, which never has a server.
        injectServer: getServer,
        generator: (request, server) => clientKey(request, server, trustProxy),
        // Its own budget: the other routes' requests never count toward it, nor lookups toward theirs.
        skip: (request) => request.method !== "GET" || new URL(request.url).pathname !== "/geo",
      }),
    )
    .get("/geo", ({ query, set }) => {
      set.headers["cache-control"] = "no-store";
      const checked = checkAddress(typeof query.ip === "string" ? query.ip : "");
      if (!checked.ok) {
        set.status = 400;
        return { error: checked.error, message: checked.message };
      }
      const location = geo.lookup(checked.address);
      if (!location) {
        set.status = 503;
        set.headers["retry-after"] = String(RETRY_AFTER_SECONDS);
        return { error: "unavailable", message: "The geolocation database is not loaded yet. Try again later." };
      }
      return { ...location, attribution: GEO_ATTRIBUTION };
    });
}
