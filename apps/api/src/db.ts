import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

// Two small tables, so plain SQL with idempotent CREATEs instead of a migration tool. If a
// table ever needs a change, add a numbered step here guarded by `PRAGMA user_version`.
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS telemetry_daily (
    day          TEXT    NOT NULL, -- YYYY-MM-DD, UTC
    install_hash TEXT    NOT NULL, -- sha256 of the panel's random install id
    version      TEXT    NOT NULL,
    nodes        INTEGER NOT NULL,
    services     INTEGER NOT NULL,
    PRIMARY KEY (day, install_hash)
  );

  CREATE TABLE IF NOT EXISTS reports (
    id                TEXT    PRIMARY KEY,
    delete_token_hash TEXT    NOT NULL,
    body              TEXT    NOT NULL,
    created_at        INTEGER NOT NULL, -- unix ms
    expires_at        INTEGER NOT NULL  -- unix ms
  );
  CREATE INDEX IF NOT EXISTS reports_expires_at ON reports (expires_at);
`;

/** Opens (or creates) the database. Pass `":memory:"` in tests. */
export function openDatabase(dataDirOrMemory: string): Database {
  let path = dataDirOrMemory;
  if (path !== ":memory:") {
    mkdirSync(path, { recursive: true });
    path = join(path, "site.db");
  }

  const db = new Database(path, { strict: true });
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec(SCHEMA);
  return db;
}
