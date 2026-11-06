import type { Database } from "bun:sqlite";
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

/**
 * One row per install per day: a panel that pings every hour still counts once, and its last
 * ping of the day wins. That is all the site ever needs to answer "how many panels, how many
 * nodes, which versions".
 */
export function createTelemetryStore(db: Database) {
  const upsert = db.prepare(`
    INSERT INTO telemetry_daily (day, install_hash, version, nodes, services)
    VALUES ($day, $installHash, $version, $nodes, $services)
    ON CONFLICT (day, install_hash) DO UPDATE SET
      version = excluded.version, nodes = excluded.nodes, services = excluded.services
  `);

  const totalsByDay = db.prepare<DailyTotals, { since: string }>(`
    SELECT day, COUNT(*) AS installs, SUM(nodes) AS nodes, SUM(services) AS services
    FROM telemetry_daily WHERE day >= $since GROUP BY day ORDER BY day
  `);

  const totalsByVersion = db.prepare<VersionTotals, { day: string }>(`
    SELECT version, COUNT(*) AS installs
    FROM telemetry_daily WHERE day = $day GROUP BY version ORDER BY installs DESC
  `);

  return {
    record(ping: TelemetryPing, now = new Date()) {
      upsert.run({
        day: utcDay(now),
        installHash: sha256Hex(ping.installId),
        version: ping.version,
        nodes: ping.nodes,
        services: ping.services,
      });
    },

    /** Daily totals for the last `days` days and the version spread of the latest day. */
    summary(days: number, now = new Date()) {
      const since = utcDay(new Date(now.getTime() - (days - 1) * 86_400_000));
      const daily = totalsByDay.all({ since });
      const latest = daily.at(-1)?.day;
      return { daily, versions: latest ? totalsByVersion.all({ day: latest }) : [] };
    },
  };
}

export type TelemetryStore = ReturnType<typeof createTelemetryStore>;
