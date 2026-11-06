import { Elysia, t } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import { clientKey } from "../client-ip";
import { safeEqual } from "../crypto";
import type { TelemetryStore } from "./store";

interface TelemetryRoutesOptions {
  store: TelemetryStore;
  trustProxy: boolean;
  statsToken: string | null;
}

// The panel pings about once an hour; this leaves room for many panels behind one NAT
// while keeping a single client from flooding the table.
const PINGS_PER_HOUR_PER_IP = 60;

export function telemetryRoutes({ store, trustProxy, statsToken }: TelemetryRoutesOptions) {
  return new Elysia({ name: "telemetry" })
    .use(
      rateLimit({
        scoping: "scoped",
        duration: 60 * 60 * 1000,
        max: PINGS_PER_HOUR_PER_IP,
        generator: (request, server) => clientKey(request, server, trustProxy),
        // The stats endpoint has its own bearer token and isn't worth limiting.
        skip: (request) => request.method !== "POST",
      }),
    )
    .post(
      "/telemetry",
      ({ body, set }) => {
        store.record(body);
        set.status = 204;
      },
      {
        // Elysia drops any field this schema doesn't list, so nothing beyond these four is ever
        // stored, whatever a future panel sends. Widening it means changing the telemetry docs too.
        body: t.Object({
          installId: t.String({ minLength: 16, maxLength: 64, pattern: "^[A-Za-z0-9_-]+$" }),
          version: t.String({ minLength: 1, maxLength: 32, pattern: "^[0-9A-Za-z.+-]+$" }),
          nodes: t.Integer({ minimum: 0, maximum: 10_000 }),
          services: t.Integer({ minimum: 0, maximum: 1_000_000 }),
        }),
      },
    )
    .get(
      "/telemetry/summary",
      ({ headers, query, set }) => {
        if (!statsToken) {
          set.status = 404;
          return "Not found";
        }
        if (!safeEqual(headers.authorization ?? "", `Bearer ${statsToken}`)) {
          set.status = 401;
          return "Unauthorized";
        }
        return store.summary(query.days ?? 30);
      },
      { query: t.Object({ days: t.Optional(t.Integer({ minimum: 1, maximum: 365 })) }) },
    );
}
