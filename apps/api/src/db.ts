import { SQL } from "bun";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Storage goes through Bun's built-in SQL client, with one set of queries for two databases:
 * Postgres when DATABASE_URL is set (production), a SQLite file in DATA_DIR otherwise (dev and
 * tests, nothing to install). The queries stick to what both understand: `ON CONFLICT` upserts,
 * TEXT days and BIGINT unix-ms timestamps. Postgres returns BIGINT and COUNT/SUM results as
 * strings, so the stores turn numbers back into numbers.
 */
export interface Database {
  sql: SQL;
  kind: "postgres" | "sqlite";
  /** Where the data lives, without credentials, for logs. */
  location: string;
  /** Lets running queries finish (up to a few seconds), then closes every connection. */
  close(): Promise<void>;
}

export interface DatabaseOptions {
  /** postgres:// URL. Null means a SQLite file. */
  databaseUrl: string | null;
  /** Folder for site.db when there is no URL, or `":memory:"` (tests). */
  dataDir: string;
  /** In production the data must not end up in a file inside the container. */
  production: boolean;
  /** How long boot waits for Postgres to come up, 30 s by default. */
  bootWaitMs?: number;
}

// Three small tables, so plain SQL with idempotent CREATEs instead of a migration tool. If a table
// ever needs a change, add an `ALTER TABLE ... ADD COLUMN` step here guarded so it runs once.
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS telemetry_daily (
    day          TEXT    NOT NULL, -- YYYY-MM-DD, UTC
    install_hash TEXT    NOT NULL, -- sha256 of the panel's random install id
    version      TEXT    NOT NULL,
    nodes        INTEGER NOT NULL,
    services     INTEGER NOT NULL,
    PRIMARY KEY (day, install_hash)
  )`,
  `CREATE TABLE IF NOT EXISTS reports (
    id                TEXT   PRIMARY KEY,
    delete_token_hash TEXT   NOT NULL,
    body              TEXT   NOT NULL,
    created_at        BIGINT NOT NULL, -- unix ms
    expires_at        BIGINT NOT NULL  -- unix ms
  )`,
  `CREATE INDEX IF NOT EXISTS reports_expires_at ON reports (expires_at)`,
  // What the site took in per day, against the budgets in daily-limits.ts.
  `CREATE TABLE IF NOT EXISTS daily_budget (
    day  TEXT   NOT NULL, -- YYYY-MM-DD, UTC
    kind TEXT   NOT NULL, -- reportBytes, telemetryInstalls
    used BIGINT NOT NULL,
    PRIMARY KEY (day, kind)
  )`,
];

// A few short queries per request and an hourly sweep: a handful of connections is plenty.
const POOL_MAX = 4;
// Docker Swarm (Easypanel) silently drops TCP connections that sit idle behind a service address
// for 15 minutes, so idle connections are closed long before that.
const IDLE_TIMEOUT_SECONDS = 60;
const CONNECT_TIMEOUT_SECONDS = 10;
// At boot Postgres may still be starting (a node reboot starts both services at once).
const DEFAULT_BOOT_WAIT_MS = 30_000;
const BOOT_RETRY_MS = 2_000;
const CLOSE_TIMEOUT_SECONDS = 5;

/** DATABASE_URL is missing or unusable. The message says what to set. */
export class DatabaseConfigError extends Error {}

/** Connects, creates the tables if they are missing and returns the client. */
export async function openDatabase(options: DatabaseOptions): Promise<Database> {
  const db = options.databaseUrl ? connectPostgres(options.databaseUrl) : connectSqlite(options);
  try {
    if (db.kind === "postgres") {
      await waitForPostgres(db, options.bootWaitMs ?? DEFAULT_BOOT_WAIT_MS);
    } else {
      await db.sql.unsafe("PRAGMA journal_mode = WAL");
      await db.sql.unsafe("PRAGMA busy_timeout = 5000");
    }
    for (const statement of SCHEMA) await db.sql.unsafe(statement);
  } catch (error) {
    await db.close().catch(() => {});
    const hint = UNREACHABLE_CODES.has((error as { code?: string } | null)?.code ?? "") ? UNREACHABLE_HINT : "";
    throw new Error(`Could not open the database at ${db.location}: ${errorMessage(error)}${hint}`, {
      cause: error,
    });
  }
  return db;
}

function connectPostgres(databaseUrl: string): Database {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    // Never echo the value: it holds the password.
    throw new DatabaseConfigError(
      "DATABASE_URL is not a valid URL. Expected postgres://user:password@host:5432/database.",
    );
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new DatabaseConfigError(
      `DATABASE_URL must be a postgres:// URL, not ${url.protocol}//. Expected postgres://user:password@host:5432/database.`,
    );
  }

  // `sslmode` in the URL (disable, require, verify-full...) is read by Bun itself. No `tls`
  // option here on purpose: an option would take priority over the URL.
  const sql = new SQL(databaseUrl, {
    max: POOL_MAX,
    idleTimeout: IDLE_TIMEOUT_SECONDS,
    connectionTimeout: CONNECT_TIMEOUT_SECONDS,
  });
  const sslmode = url.searchParams.get("sslmode");
  return {
    sql,
    kind: "postgres",
    location: `postgres://${url.hostname}:${url.port || 5432}${url.pathname}${sslmode ? `?sslmode=${sslmode}` : ""}`,
    close: () => sql.close({ timeout: CLOSE_TIMEOUT_SECONDS }),
  };
}

function connectSqlite({ dataDir, production }: DatabaseOptions): Database {
  if (production) {
    throw new DatabaseConfigError(
      "DATABASE_URL is not set. In production the site API keeps telemetry and reports in Postgres: set " +
        "DATABASE_URL to the Postgres service's internal connection URL (postgres://user:password@host:5432/database).",
    );
  }
  let filename = dataDir;
  if (dataDir !== ":memory:") {
    mkdirSync(dataDir, { recursive: true });
    filename = join(dataDir, "site.db");
  }
  const sql = new SQL({ adapter: "sqlite", filename });
  return { sql, kind: "sqlite", location: `sqlite:${filename}`, close: () => sql.close() };
}

const RETRYABLE_CODES = new Set([
  "ERR_POSTGRES_CONNECTION_REFUSED",
  "ERR_POSTGRES_CONNECTION_TIMEOUT",
  "ERR_POSTGRES_CONNECTION_CLOSED",
]);

// Bun reports a host name that doesn't resolve with the same code and message ("Failed to connect")
// as a closed port, so the message after the last retry says what to check for both.
const UNREACHABLE_CODES = new Set(["ERR_POSTGRES_CONNECTION_REFUSED", "ERR_POSTGRES_CONNECTION_TIMEOUT"]);
const UNREACHABLE_HINT =
  ". No Postgres answered at that host and port: on Easypanel the host is the Postgres service's " +
  "internal name (<project>_<service>), the port 5432, and that service must be running.";

async function waitForPostgres(db: Database, bootWaitMs: number) {
  const deadline = Date.now() + bootWaitMs;
  for (let attempt = 1; ; attempt++) {
    try {
      await db.sql`SELECT 1`;
      return;
    } catch (error) {
      const { code, errno } = (error ?? {}) as { code?: string; errno?: string };
      // 57P03: "the database system is starting up". Anything else (a wrong password, a missing
      // database) won't fix itself, so it fails right away.
      const retryable = (code !== undefined && RETRYABLE_CODES.has(code)) || errno === "57P03";
      if (!retryable || Date.now() + BOOT_RETRY_MS > deadline) throw error;
      console.warn(`waiting for ${db.location} (attempt ${attempt}): ${errorMessage(error)}`);
      await Bun.sleep(BOOT_RETRY_MS);
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
