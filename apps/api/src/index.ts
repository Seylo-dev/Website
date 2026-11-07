import { createApp } from "./app";
import { loadConfig } from "./config";
import { type Database, openDatabase } from "./db";
import { createInstallerSource } from "./installer/source";
import { MAX_REPORT_BYTES } from "./reports/routes";

const config = loadConfig();

let db: Database;
try {
  db = await openDatabase(config);
} catch (error) {
  // A missing or wrong DATABASE_URL, or no database to reach: say so and stop.
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const installer = createInstallerSource(config.installer);
const { app, reports } = createApp({ config, sql: db.sql, installer });

app.listen({
  port: config.port,
  // Bun refuses bodies past this before any route runs. Reports are the largest bodies; the
  // margin leaves the exact limit (and its readable 413) to the report route.
  maxRequestBodySize: MAX_REPORT_BYTES + 64 * 1024,
});

const PURGE_INTERVAL_MS = 60 * 60 * 1000;
// A sweep that fails (database briefly unreachable) runs again the next hour; reads hide expired
// reports in the meantime.
const purge = () => reports.purgeExpired().catch((error) => console.error("report sweep failed:", error));
const purgeTimer = setInterval(purge, PURGE_INTERVAL_MS);
void purge();

// Check the release at boot and keep checking it, so a bad release shows in the log and /healthz
// even while nobody installs. get() only goes to GitHub once the last check is due again.
const checkInstaller = () => void installer.get().catch((error) => console.error("[installer] check failed:", error));
const installerCheckSeconds = Number.isFinite(config.installer.cacheSeconds)
  ? Math.min(Math.max(config.installer.cacheSeconds, 5), 30)
  : 30;
const installerTimer = setInterval(checkInstaller, installerCheckSeconds * 1000);
checkInstaller();

console.log(`site api listening on http://localhost:${config.port}, data in ${db.location}`);

const SHUTDOWN_GRACE_MS = 4000;
let stopping = false;

/** Stops taking requests, gives the ones in flight a few seconds, then closes the database pool. */
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(`${signal}: shutting down`);
  clearInterval(purgeTimer);
  clearInterval(installerTimer);
  await Promise.race([app.stop(), Bun.sleep(SHUTDOWN_GRACE_MS)]);
  await db.close().catch((error) => console.error("closing the database failed:", error));
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
