import { afterAll, describe, expect, spyOn, test } from "bun:test";
import { createDailyBudget, createDailyKeyLimit, DEFAULT_DAILY_BUDGETS } from "../src/daily-limits";
import { secondsUntilUtcMidnight, utcDay } from "../src/utc-day";
import { backends, closeTestDatabases, openTestDatabase } from "./helpers";

afterAll(closeTestDatabases);

const at = (iso: string) => new Date(iso);

describe.each(backends)("daily budget ($name)", (backend) => {
  const open = async (persistent = false) => {
    const options = await backend.newDatabase(persistent);
    return { options, db: await openTestDatabase(options) };
  };

  test("takes until the day's budget is spent, then refuses without taking", async () => {
    const { db } = await open();
    const budget = createDailyBudget(db.sql, { ...DEFAULT_DAILY_BUDGETS, reportBytes: 100 });
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const noon = at("2026-11-08T12:00:00Z");
      expect(await budget.take("reportBytes", 60, noon)).toBe(true);
      expect(await budget.take("reportBytes", 41, noon)).toBe(false);
      expect(await budget.used("reportBytes", noon)).toBe(60);
      // What is left still fits, to the byte.
      expect(await budget.take("reportBytes", 40, noon)).toBe(true);
      expect(await budget.take("reportBytes", 1, noon)).toBe(false);
      expect(await budget.used("reportBytes", noon)).toBe(100);
      // One log line a day, however many refusals.
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toContain("reportBytes");

      // The other kind has its own budget, and the next UTC day starts over.
      expect(await budget.take("telemetryInstalls", 1, noon)).toBe(true);
      const tomorrow = at("2026-11-09T00:00:00Z");
      expect(await budget.used("reportBytes", tomorrow)).toBe(0);
      expect(await budget.take("reportBytes", 100, tomorrow)).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });

  test("an amount larger than the whole budget is refused, also on a fresh day", async () => {
    const { db } = await open();
    const budget = createDailyBudget(db.sql, { reportBytes: 10, telemetryInstalls: 0 });
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(await budget.take("reportBytes", 11)).toBe(false);
      expect(await budget.used("reportBytes")).toBe(0);
      // 0 turns the thing off.
      expect(await budget.take("telemetryInstalls", 1)).toBe(false);
    } finally {
      warn.mockRestore();
    }
  });

  test("takes at the same time never overshoot the budget", async () => {
    const { db } = await open();
    const budget = createDailyBudget(db.sql, { ...DEFAULT_DAILY_BUDGETS, telemetryInstalls: 25 });
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const results = await Promise.all(Array.from({ length: 60 }, () => budget.take("telemetryInstalls", 1)));
      expect(results.filter(Boolean)).toHaveLength(25);
      expect(await budget.used("telemetryInstalls")).toBe(25);
    } finally {
      warn.mockRestore();
    }
  });

  test("a restart doesn't hand out a second budget: it lives in the database", async () => {
    const first = await open(true);
    const limits = { ...DEFAULT_DAILY_BUDGETS, reportBytes: 2 ** 31 + 10 };
    // Past 2^31, where a 32-bit parameter would overflow.
    expect(await createDailyBudget(first.db.sql, limits).take("reportBytes", 2 ** 31)).toBe(true);
    await first.db.close();

    const db = await openTestDatabase(first.options);
    const again = createDailyBudget(db.sql, limits);
    expect(await again.used("reportBytes")).toBe(2 ** 31);
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(await again.take("reportBytes", 11)).toBe(false);
      expect(await again.take("reportBytes", 10)).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });
});

describe("daily key limit", () => {
  test("counts each key on its own and starts over at 00:00 UTC", () => {
    const limit = createDailyKeyLimit({ max: 2 });
    const day = at("2026-11-08T23:59:59Z");
    expect(limit.take("192.0.2.1", day)).toBe(true);
    expect(limit.take("192.0.2.1", day)).toBe(true);
    expect(limit.take("192.0.2.1", day)).toBe(false);
    expect(limit.take("2001:db8:0:1::/64", day)).toBe(true);
    expect(limit.take("192.0.2.1", at("2026-11-09T00:00:00Z"))).toBe(true);
  });

  test("keeps at most maxKeys keys, dropping the one counted first", () => {
    const limit = createDailyKeyLimit({ max: 1, maxKeys: 3 });
    const day = at("2026-11-08T12:00:00Z");
    for (const key of ["a", "b", "c"]) expect(limit.take(key, day)).toBe(true);
    expect(limit.take("b", day)).toBe(false);
    // A fourth key pushes out "a", the others keep their count.
    expect(limit.take("d", day)).toBe(true);
    expect(limit.take("a", day)).toBe(true);
    expect(limit.take("c", day)).toBe(false);
    expect(limit.take("d", day)).toBe(false);
  });
});

describe("utc day", () => {
  test("names the UTC day and counts the seconds to its end", () => {
    expect(utcDay(at("2026-11-08T23:59:59.999Z"))).toBe("2026-11-08");
    expect(secondsUntilUtcMidnight(at("2026-11-08T23:59:30Z"))).toBe(30);
    expect(secondsUntilUtcMidnight(at("2026-11-08T23:59:59.500Z"))).toBe(1);
    expect(secondsUntilUtcMidnight(at("2026-11-09T00:00:00Z"))).toBe(86_400);
  });
});
