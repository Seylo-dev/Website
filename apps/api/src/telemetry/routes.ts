import type { Server } from "bun";
import { Elysia, t } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import { clientKey } from "../client-ip";
import { safeEqual } from "../crypto";
import { createDailyKeyLimit, type DailyBudget } from "../daily-limits";
import { secondsUntilUtcMidnight } from "../utc-day";
import type { TelemetryStore } from "./store";

interface TelemetryRoutesOptions {
  store: TelemetryStore;
  /** New installs the site counts per day from everyone together. */
  budget: DailyBudget;
  /** New installs one address (IPv6: one /64) may start a row for per day. Tests lower it. */
  newInstallsPerDayPerIp?: number;
  trustProxy: boolean;
  statsToken: string | null;
  /** The listening server (null under `app.handle()`): the address of a connection comes from it. */
  getServer: () => Server<unknown> | null;
}

// The panel pings about once an hour; this leaves room for many panels behind one NAT
// while keeping a single client from flooding the table.
const PINGS_PER_HOUR_PER_IP = 60;
// A panel pings once a day, so this is how many panels one address can stand for. Without it, one
// address could start a row with a made-up install id on every allowed ping: 1,440 a day.
export const NEW_INSTALLS_PER_DAY_PER_IP = 100;

export function telemetryRoutes({
  store,
  budget,
  newInstallsPerDayPerIp = NEW_INSTALLS_PER_DAY_PER_IP,
  trustProxy,
  statsToken,
  getServer,
}: TelemetryRoutesOptions) {
  const newInstalls = createDailyKeyLimit({ max: newInstallsPerDayPerIp });
  return new Elysia({ name: "telemetry" })
    .use(
      rateLimit({
        scoping: "scoped",
        duration: 60 * 60 * 1000,
        max: PINGS_PER_HOUR_PER_IP,
        // Without it the limiter asks this plugin's own instance, which never has a server.
        injectServer: getServer,
        generator: (request, server) => clientKey(request, server, trustProxy),
        // The stats endpoint has its own bearer token and isn't worth limiting.
        skip: (request) => request.method !== "POST",
      }),
    )
    .post(
      "/telemetry",
      async ({ body, request, set }) => {
        const now = new Date();
        // An install that already pinged today only updates its row: nothing new is stored.
        if (await store.refresh(body, now)) {
          set.status = 204;
          return;
        }
        // A new row. The address's own daily count first, so an address past it takes nothing
        // from the shared budget.
        if (!newInstalls.take(clientKey(request, getServer(), trustProxy), now)) {
          set.status = 429;
          set.headers["retry-after"] = String(secondsUntilUtcMidnight(now));
          return { error: "too_many_installs", message: "Too many new installs from this address today." };
        }
        if (!(await budget.take("telemetryInstalls", 1, now))) {
          set.status = 503;
          set.headers["retry-after"] = String(secondsUntilUtcMidnight(now));
          return { error: "daily_limit", message: "The site has counted all the installs it takes today." };
        }
        await store.record(body, now);
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
      async ({ headers, query, set }) => {
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
