import type { Database } from "bun:sqlite";
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
  db: Database;
  installer: InstallerSource;
}

/** The whole API without a listening server, so tests can drive it with `app.handle()`. */
export function createApp({ config, db, installer }: AppDeps) {
  const reports = createReportStore(db);
  const app = new Elysia()
    .get("/healthz", () => "ok")
    .use(
      telemetryRoutes({
        store: createTelemetryStore(db),
        trustProxy: config.trustProxy,
        statsToken: config.statsToken,
      }),
    )
    .use(reportRoutes({ store: reports, trustProxy: config.trustProxy, reportBaseUrl: config.reportBaseUrl }))
    .use(installerRoutes(installer));

  return { app, reports };
}
