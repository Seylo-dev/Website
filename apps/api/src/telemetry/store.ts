import type { SQL } from "bun";
import { sha256Hex } from "../crypto";

export interface TelemetryPing {
  /** Random id the panel generates once at install. Hashed before it is stored. */
  installId: string;
  version: string;
  nodes: number;
  services: number;
}

export interface DailyTotals {
  day: string;
  installs: number;
  nodes: number;
  services: number;
}

export interface VersionTotals {
  version: string;
  installs: number;
}

const utcDay = (now: Date) => now.toISOString().slice(0, 10);

// Postgres returns COUNT and SUM as strings (they are BIGINT there); SQLite returns numbers.
type Counted<T> = { [K in keyof T]: T[K] extends number ? number | string : T[K] };

/**
 * One row per install per day: a panel that pings every hour still counts once, and its last
 * ping of the day wins. That is all the site ever needs to answer "how many panels, how many
 * nodes, which versions".
 */
export function createTelemetryStore(sql: SQL) {
  return {
    async record(ping: TelemetryPing, now = new Date()): Promise<void> {
      await sql`
        INSERT INTO telemetry_daily (day, install_hash, version, nodes, services)
        VALUES (${utcDay(now)}, ${sha256Hex(ping.installId)}, ${ping.version}, ${ping.nodes}, ${ping.services})
        ON CONFLICT (day, install_hash) DO UPDATE SET
          version = excluded.version, nodes = excluded.nodes, services = excluded.services
      `;
    },

    /** Daily totals for the last `days` days and the version spread of the latest day. */
    async summary(days: number, now = new Date()): Promise<{ daily: DailyTotals[]; versions: VersionTotals[] }> {
      const since = utcDay(new Date(now.getTime() - (days - 1) * 86_400_000));
      const dailyRows = await sql<Counted<DailyTotals>[]>`
        SELECT day, COUNT(*) AS installs, SUM(nodes) AS nodes, SUM(services) AS services
        FROM telemetry_daily WHERE day >= ${since} GROUP BY day ORDER BY day
      `;
      const daily = dailyRows.map((row) => ({
        day: row.day,
        installs: Number(row.installs),
        nodes: Number(row.nodes),
        services: Number(row.services),
      }));

      const latest = daily.at(-1)?.day;
      if (!latest) return { daily, versions: [] };
      const versionRows = await sql<Counted<VersionTotals>[]>`
        SELECT version, COUNT(*) AS installs
        FROM telemetry_daily WHERE day = ${latest} GROUP BY version ORDER BY installs DESC, version
      `;
      return { daily, versions: versionRows.map((row) => ({ version: row.version, installs: Number(row.installs) })) };
    },
  };
}

export type TelemetryStore = ReturnType<typeof createTelemetryStore>;
