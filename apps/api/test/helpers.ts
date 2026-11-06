import { SQL } from "bun";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/app";
import { type Database, type DatabaseOptions, openDatabase } from "../src/db";
import type { InstallerSource } from "../src/installer/source";

export const REPORT_BASE_URL = "https://site.test/l";

const noInstaller: InstallerSource = { get: async () => null };

/**
 * Where a test's data lives. SQLite in memory always; Postgres too when SITE_API_PG_URL points at
 * a server the tests may create and drop databases on, so plain `bun test` needs nothing:
 *
 *   SITE_API_PG_URL=postgres://postgres:pass@127.0.0.1:5432/postgres bun test
 */
export interface TestBackend {
  name: "sqlite" | "postgres";
  /** Options for a new, empty database. `persistent` asks for one a second open sees (a file for SQLite). */
  newDatabase(persistent?: boolean): Promise<DatabaseOptions>;
}

const pgUrl = process.env.SITE_API_PG_URL || null;
const cleanups: Array<() => Promise<void> | void> = [];
let admin: SQL | null = null;

const sqlite: TestBackend = {
  name: "sqlite",
  async newDatabase(persistent = false) {
    if (!persistent) return { databaseUrl: null, dataDir: ":memory:", production: false };
    const dataDir = mkdtempSync(join(tmpdir(), "site-api-test-"));
    cleanups.push(() => rmSync(dataDir, { recursive: true, force: true }));
    return { databaseUrl: null, dataDir, production: false };
  },
};

const postgres: TestBackend = {
  name: "postgres",
  // One throwaway database per call, dropped by closeTestDatabases().
  async newDatabase() {
    admin ??= new SQL(pgUrl!, { max: 1 });
    const name = `site_api_test_${crypto.randomUUID().replaceAll("-", "")}`;
    await admin.unsafe(`CREATE DATABASE ${name}`);
    cleanups.push(async () => {
      await admin?.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    });
    const url = new URL(pgUrl!);
    url.pathname = `/${name}`;
    return { databaseUrl: url.toString(), dataDir: ":memory:", production: true };
  },
};

export const backends: TestBackend[] = pgUrl ? [sqlite, postgres] : [sqlite];

/** Opens a database that closeTestDatabases() closes again. */
export async function openTestDatabase(options: DatabaseOptions): Promise<Database> {
  const db = await openDatabase(options);
  // Unshift so connections close before their database is dropped.
  cleanups.unshift(() => db.close());
  return db;
}

/** Call from `afterAll` in every file that opens a database. */
export async function closeTestDatabases() {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  await admin?.close();
  admin = null;
}

export async function testApp(
  options: { statsToken?: string; installer?: InstallerSource; backend?: TestBackend } = {},
) {
  const db = await openTestDatabase(await (options.backend ?? sqlite).newDatabase());
  return createApp({
    config: { trustProxy: true, statsToken: options.statsToken ?? null, reportBaseUrl: REPORT_BASE_URL },
    sql: db.sql,
    installer: options.installer ?? noInstaller,
  });
}

/** Each test gets its own client address, so rate limits from one test never leak into another. */
let nextIp = 1;
export function clientIp() {
  return `10.0.${Math.floor(nextIp / 250)}.${nextIp++ % 250}`;
}

export function request(path: string, init: RequestInit & { ip?: string } = {}) {
  const headers = new Headers(init.headers);
  headers.set("x-forwarded-for", init.ip ?? clientIp());
  return new Request(`http://api.test${path}`, { ...init, headers });
}
