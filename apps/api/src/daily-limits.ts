import type { SQL } from "bun";
import { utcDay } from "./utc-day";

/**
 * What the site takes in per UTC day, from everyone together. The per-address limits alone don't
 * bound the database: every IPv4 address and every IPv6 /64 gets its own allowance, and an IPv6
 * /48 holds 65,536 of those. These do.
 */
export interface DailyBudgets {
  /** Bytes of troubleshoot reports, as stored. Reports live 30 days: the table holds at most 31 days of this. */
  reportBytes: number;
  /**
   * Installs telemetry starts a row for. Later pings from an install that day only update its row.
   * Telemetry rows are kept, so this bounds how fast that table grows.
   */
  telemetryInstalls: number;
}

export type BudgetKind = keyof DailyBudgets;

export const DEFAULT_DAILY_BUDGETS: DailyBudgets = {
  reportBytes: 2 * 1024 * 1024 * 1024,
  telemetryInstalls: 50_000,
};

/** The environment variable that sets each budget (config.ts), for the log line. */
const SETTING: Record<BudgetKind, string> = {
  reportBytes: "REPORT_MIB_PER_DAY",
  telemetryInstalls: "TELEMETRY_INSTALLS_PER_DAY",
};

/**
 * Today's budgets, kept in the `daily_budget` table so a restart doesn't hand out a second one.
 * One small row per kind per day; they are kept as a record of how much came in.
 */
export function createDailyBudget(sql: SQL, limits: DailyBudgets) {
  // The day each kind last ran out, so the log says so once a day instead of on every refusal.
  const spentLogged = new Map<BudgetKind, string>();

  return {
    /**
     * Takes `amount` from today's budget of `kind`. False when it doesn't fit, and then nothing is
     * taken. Atomic on both databases: two uploads at once can't both take the last of it.
     */
    async take(kind: BudgetKind, amount: number, now: Date | number = Date.now()): Promise<boolean> {
      const limit = limits[kind];
      const day = utcDay(now);
      // The INSERT branch has no WHERE, so an amount larger than the whole budget stops here.
      if (amount <= limit) {
        const rows = await sql<{ used: number | string }[]>`
          INSERT INTO daily_budget (day, kind, used) VALUES (${day}, ${kind}, ${amount})
          ON CONFLICT (day, kind) DO UPDATE SET used = daily_budget.used + excluded.used
          WHERE daily_budget.used + excluded.used <= ${limit}
          RETURNING used
        `;
        if (rows.length > 0) return true;
      }
      if (spentLogged.get(kind) !== day) {
        spentLogged.set(kind, day);
        console.warn(
          `[budget] today's ${kind} budget (${limit}) is spent: refusing more until 00:00 UTC. ` +
            `If this is real use, raise ${SETTING[kind]}.`,
        );
      }
      return false;
    },

    /** How much of today's budget of `kind` is taken. */
    async used(kind: BudgetKind, now: Date | number = Date.now()): Promise<number> {
      const [row] = await sql<{ used: number | string }[]>`
        SELECT used FROM daily_budget WHERE day = ${utcDay(now)} AND kind = ${kind}
      `;
      return row ? Number(row.used) : 0;
    },
  };
}

export type DailyBudget = ReturnType<typeof createDailyBudget>;

/**
 * Counts per rate-limit key (an IPv4 address or an IPv6 /64) how many times it was let through
 * today, UTC, and refuses past `max`. Only in memory: no address is ever written to the database,
 * and a restart starts the count over, which the database budget above bounds anyway.
 */
export function createDailyKeyLimit({ max, maxKeys = 100_000 }: { max: number; maxKeys?: number }) {
  let day = "";
  const counts = new Map<string, number>();

  return {
    /** True, and counted, while `key` is under `max` today. */
    take(key: string, now: Date | number = Date.now()): boolean {
      const today = utcDay(now);
      if (today !== day) {
        day = today;
        counts.clear();
      }
      const count = counts.get(key) ?? 0;
      if (count >= max) return false;
      // Memory stays bounded under a flood of keys: the key counted first today is dropped. Its
      // count starts over, which only helps someone who already holds more than maxKeys keys.
      if (count === 0 && counts.size >= maxKeys) {
        const oldest = counts.keys().next().value;
        if (oldest !== undefined) counts.delete(oldest);
      }
      counts.set(key, count + 1);
      return true;
    },
  };
}

export type DailyKeyLimit = ReturnType<typeof createDailyKeyLimit>;
