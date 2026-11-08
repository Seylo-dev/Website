const DAY_MS = 86_400_000;

/** The UTC day of a moment as `YYYY-MM-DD`. */
export const utcDay = (now: Date | number) => new Date(now).toISOString().slice(0, 10);

/** Whole seconds until the next UTC midnight, when every daily limit starts over. At least 1. */
export function secondsUntilUtcMidnight(now: Date | number = Date.now()): number {
  const ms = new Date(now).getTime();
  return Math.max(1, Math.ceil((DAY_MS - (ms % DAY_MS)) / 1000));
}
