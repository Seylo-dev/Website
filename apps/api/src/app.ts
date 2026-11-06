import type { SQL } from "bun";
import { Elysia } from "elysia";
import type { Config } from "./config";
import { installerRoutes } from "./installer/routes";
import type { InstallerSource } from "./installer/source";
import { reportRoutes } from "./reports/routes";
import { createReportStore } from "./reports/store";
import { telemetryRoutes } from "./telemetry/routes";
import { createTelemetryStore } from "./telemetry/store";

export interface AppDeps {
  config: Pick<Config, "trustProxy" | "statsToken" | "reportBaseUrl">;
  sql: SQL;
  installer: InstallerSource;
}

// Elysia's codes for a bad request; they keep their own status and body.
const REQUEST_ERRORS = new Set(["VALIDATION", "NOT_FOUND", "PARSE", "INVALID_COOKIE_SIGNATURE", "INVALID_FILE_TYPE"]);

/** The whole API without a listening server, so tests can drive it with `app.handle()`. */
export function createApp({ config, sql, installer }: AppDeps) {
  const reports = createReportStore(sql);
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
    .get("/healthz", () => "ok")
    .use(
      telemetryRoutes({
        store: createTelemetryStore(sql),
        trustProxy: config.trustProxy,
        statsToken: config.statsToken,
      }),
    )
    .use(reportRoutes({ store: reports, trustProxy: config.trustProxy, reportBaseUrl: config.reportBaseUrl }))
    .use(installerRoutes(installer));

  return { app, reports };
}
