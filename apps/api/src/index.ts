import { createApp } from "./app";
import { loadConfig } from "./config";
import { openDatabase } from "./db";
import { createInstallerSource } from "./installer/source";
import { MAX_REPORT_BYTES } from "./reports/routes";

const config = loadConfig();
const db = openDatabase(config.dataDir);
const { app, reports } = createApp({ config, db, installer: createInstallerSource(config.installer) });

app.listen({
  port: config.port,
  // Bun refuses bodies past this before any route runs. Reports are the largest bodies; the
  // margin leaves the exact limit (and its readable 413) to the report route.
  maxRequestBodySize: MAX_REPORT_BYTES + 64 * 1024,
});

const PURGE_INTERVAL_MS = 60 * 60 * 1000;
setInterval(() => reports.purgeExpired(), PURGE_INTERVAL_MS);
reports.purgeExpired();

console.log(`site api listening on http://localhost:${config.port}`);
