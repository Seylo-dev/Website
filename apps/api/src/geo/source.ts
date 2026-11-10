import { statSync } from "node:fs";
import type { GeoConfig } from "../config";
import { type GeoDatabase, type GeoLocation, openGeoFile } from "./database";
import { monthOf, readGeoFileInfo, updateGeoDatabase } from "./update";

/** What `/healthz` reports about the geolocation database. */
export interface GeoHealth {
  /**
   * - `ok`: a database is loaded, and it is this month's or the last update found nothing newer.
   * - `stale`: a database is loaded, but the last update failed.
   * - `missing`: no database is loaded; GET /geo answers 503.
   */
  state: "ok" | "stale" | "missing";
  database: { month: string | null; builtAt: string; loadedAt: string } | null;
  lastUpdate: { at: string; ok: boolean; error: string | null } | null;
}

export interface GeoSource {
  /** `address` as checkAddress() returns it; null while no database is loaded. */
  lookup(address: string): GeoLocation | null;
  health(): GeoHealth;
}

export interface UpdatingGeoSource extends GeoSource {
  /**
   * Loads the database file when it is new or changed, and with `config.autoUpdate` first
   * downloads a newer month's file when one may be out. Never throws.
   */
  refresh(now?: Date): Promise<void>;
}

type Logger = Pick<Console, "log" | "error">;

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * The database GET /geo reads, from `config.dbPath`. The file is opened at the first refresh and
 * again whenever it changes on disk; one that does not open keeps the one loaded before in service.
 */
export function createGeoSource(
  config: GeoConfig,
  options: { fetch?: typeof fetch; log?: Logger } = {},
): UpdatingGeoSource {
  const log = options.log ?? console;
  let loaded: { db: GeoDatabase; month: string | null; mtimeMs: number; loadedAt: number } | null = null;
  let lastUpdate: { at: number; error: string | null } | null = null;
  let inflight: Promise<void> | null = null;

  const mtimeOf = (path: string) => {
    try {
      return statSync(path).mtimeMs;
    } catch {
      return null;
    }
  };

  /** Opens the file when it is not the one loaded. */
  async function load(now: Date) {
    const mtimeMs = mtimeOf(config.dbPath);
    if (mtimeMs === null || mtimeMs === loaded?.mtimeMs) return;
    try {
      const db = openGeoFile(config.dbPath);
      const month = (await readGeoFileInfo(config.dbPath))?.month ?? null;
      loaded = { db, month, mtimeMs, loadedAt: now.getTime() };
      log.log(`[geo] loaded ${config.dbPath} (${month ?? "month unknown"}, built ${db.builtAt.toISOString()})`);
    } catch (error) {
      const kept = loaded ? "Keeping the database loaded before." : "GET /geo answers 503.";
      log.error(`[geo] ${config.dbPath} does not open: ${message(error)}. ${kept}`);
    }
  }

  async function refresh(now: Date) {
    await load(now);
    if (!config.autoUpdate || (loaded && loaded.month === monthOf(now))) return;
    const result = await updateGeoDatabase(config, { fetch: options.fetch, now, log });
    lastUpdate = { at: now.getTime(), error: result.status === "failed" ? result.error : null };
    if (result.status === "updated") await load(now);
  }

  const iso = (ms: number) => new Date(ms).toISOString();

  return {
    lookup: (address) => loaded?.db.lookup(address) ?? null,

    refresh(now = new Date()) {
      // Overlapping calls (the timer and boot) share one refresh.
      inflight ??= refresh(now)
        .catch((error) => log.error(`[geo] refresh failed: ${message(error)}`))
        .finally(() => {
          inflight = null;
        });
      return inflight;
    },

    health() {
      return {
        state: !loaded ? "missing" : lastUpdate?.error ? "stale" : "ok",
        database: loaded
          ? { month: loaded.month, builtAt: loaded.db.builtAt.toISOString(), loadedAt: iso(loaded.loadedAt) }
          : null,
        lastUpdate: lastUpdate ? { at: iso(lastUpdate.at), ok: !lastUpdate.error, error: lastUpdate.error } : null,
      };
    },
  };
}
