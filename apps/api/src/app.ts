import type { SQL } from "bun";
import { Elysia } from "elysia";
import type { Config } from "./config";
import { createDailyBudget } from "./daily-limits";
import { installerRoutes } from "./installer/routes";
import type { InstallerSource } from "./installer/source";
import { reportRoutes } from "./reports/routes";
import { createReportStore } from "./reports/store";
import { telemetryRoutes } from "./telemetry/routes";
import { createTelemetryStore } from "./telemetry/store";

export interface AppDeps {
  config: Pick<Config, "trustProxy" | "statsToken" | "reportBaseUrl" | "budgets">;
  sql: SQL;
  installer: InstallerSource;
  /** New installs one address may start a telemetry row for per day. Tests lower it. */
  newInstallsPerDayPerIp?: number;
}

// Elysia's codes for a bad request; they keep their own status and body.
const REQUEST_ERRORS = new Set(["VALIDATION", "NOT_FOUND", "PARSE", "INVALID_COOKIE_SIGNATURE", "INVALID_FILE_TYPE"]);

/** The whole API without a listening server, so tests can drive it with `app.handle()`. */
export function createApp({ config, sql, installer, newInstallsPerDayPerIp }: AppDeps) {
  const reports = createReportStore(sql);
  // Shared by both routes: one table, one row per kind per day.
  const budget = createDailyBudget(sql, config.budgets);
  // The rate limits read the connection's address from the server, and elysia-rate-limit asks the
  // instance it was added to: the route plugin's own, whose `server` stays null when this one
  // listens. So they get this instance's server. Called per request, after `app` is assigned.
  const getServer = () => app.server;
  const app = new Elysia()
    // A failed query (database restarting, network blip) is logged here and answered with a plain
    // 500, instead of Elysia's default of sending the driver's message to the client. Errors that
    // carry their own `code` (Bun's ERR_POSTGRES_*) reach Elysia under that code, not "UNKNOWN",
    // so everything except Elysia's own request errors lands here.
    .onError({ as: "global" }, ({ code, error, request, set }) => {
      if (typeof code === "number" || REQUEST_ERRORS.has(code)) return;
      console.error(`${request.method} ${new URL(request.url).pathname} failed:`, error);
      set.status = 500;
      return "Internal server error";
    })
    // 200 while there is a verified installer to serve (or none was checked yet), even when the
    // latest check failed: `installer.state` says "stale" then. 503 only when /install.sh can't
    // serve anything.
    .get("/healthz", ({ set }) => {
      const health = installer.health();
      if (health.state === "failing") set.status = 503;
      return { status: health.state === "ok" || health.state === "pending" ? "ok" : "degraded", installer: health };
    })
    .use(
      telemetryRoutes({
        store: createTelemetryStore(sql),
        budget,
        newInstallsPerDayPerIp,
        trustProxy: config.trustProxy,
        statsToken: config.statsToken,
        getServer,
      }),
    )
    .use(
      reportRoutes({
        store: reports,
        budget,
        trustProxy: config.trustProxy,
        reportBaseUrl: config.reportBaseUrl,
        getServer,
      }),
    )
    .use(installerRoutes(installer));

  return { app, reports };
}
