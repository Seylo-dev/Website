import { afterAll, describe, expect, test } from "bun:test";
import { createReportStore, REPORT_TTL_MS } from "../src/reports/store";
import { createTelemetryStore } from "../src/telemetry/store";
import { backends, closeTestDatabases, openTestDatabase, type TestBackend } from "./helpers";

afterAll(closeTestDatabases);

const ping = { installId: "inst_0123456789abcdef", version: "0.1.0", nodes: 3, services: 12 };
const day = (iso: string) => new Date(`${iso}T12:00:00Z`);

async function open(backend: TestBackend, persistent = false) {
  const options = await backend.newDatabase(persistent);
  const db = await openTestDatabase(options);
  return { db, options, telemetry: createTelemetryStore(db.sql), reports: createReportStore(db.sql) };
}

for (const backend of backends) {
  describe(`telemetry store (${backend.name})`, () => {
    test("one row per install per day, the last ping of the day wins", async () => {
      const { telemetry } = await open(backend);
      await telemetry.record(ping, day("2026-11-06"));
      await telemetry.record({ ...ping, version: "0.2.0", nodes: 5 }, day("2026-11-07"));
      await telemetry.record({ ...ping, version: "0.2.1", nodes: 6, services: 20 }, day("2026-11-07"));
      await telemetry.record({ ...ping, installId: "inst_fedcba9876543210" }, day("2026-11-07"));

      const summary = await telemetry.summary(30, day("2026-11-07"));
      expect(summary.daily).toEqual([
        { day: "2026-11-06", installs: 1, nodes: 3, services: 12 },
        { day: "2026-11-07", installs: 2, nodes: 9, services: 32 },
      ]);
      // Counts come back as numbers on both databases, sorted by installs then version.
      expect(summary.versions).toEqual([
        { version: "0.1.0", installs: 1 },
        { version: "0.2.1", installs: 1 },
      ]);
    });

    test("the window counts back from today", async () => {
      const { telemetry } = await open(backend);
      await telemetry.record(ping, day("2026-11-01"));
      await telemetry.record(ping, day("2026-11-07"));
      expect((await telemetry.summary(7, day("2026-11-07"))).daily.map((d) => d.day)).toEqual([
        "2026-11-01",
        "2026-11-07",
      ]);
      expect((await telemetry.summary(6, day("2026-11-07"))).daily.map((d) => d.day)).toEqual(["2026-11-07"]);
      expect(await telemetry.summary(30, day("2026-12-31"))).toEqual({ daily: [], versions: [] });
    });

    test("stores only the hash of the install id", async () => {
      const { db, telemetry } = await open(backend);
      await telemetry.record(ping);
      const rows = await db.sql`SELECT install_hash FROM telemetry_daily`;
      expect(rows).toHaveLength(1);
      expect(rows[0].install_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(rows)).not.toContain(ping.installId);
    });
  });

  describe(`report store (${backend.name})`, () => {
    test("round-trips the body and the timestamps as numbers", async () => {
      const { reports } = await open(backend);
      const now = Date.UTC(2026, 10, 7, 12, 0, 0, 123);
      const body = `# Report\n\nשלום, 🙂 and a long tail\n${"x".repeat(512 * 1024 - 100)}`;
      const created = await reports.create(body, now);
      expect(created.deleteToken).toMatch(/^[A-Za-z0-9_-]{32}$/);
      expect(await reports.get(created.id, now)).toEqual({
        id: created.id,
        body,
        createdAt: now,
        expiresAt: now + REPORT_TTL_MS,
      });
    });

    test("stores a NUL byte as U+FFFD (Postgres TEXT refuses NUL)", async () => {
      const { reports } = await open(backend);
      const created = await reports.create("a\u0000b\u0000");
      expect(created.body).toBe("a\uFFFDb\uFFFD");
      expect((await reports.get(created.id))?.body).toBe("a\uFFFDb\uFFFD");
    });

    test("expires after 30 days and the sweep removes only expired reports", async () => {
      const { reports } = await open(backend);
      const old = await reports.create("# old", 0);
      const fresh = await reports.create("# fresh", 1000);
      expect(await reports.get(old.id, REPORT_TTL_MS - 1)).not.toBeNull();
      expect(await reports.get(old.id, REPORT_TTL_MS)).toBeNull();
      expect(await reports.purgeExpired(REPORT_TTL_MS)).toBe(1);
      expect(await reports.purgeExpired(REPORT_TTL_MS)).toBe(0);
      expect(await reports.get(fresh.id, REPORT_TTL_MS)).not.toBeNull();
    });

    test("deletes only with the right token", async () => {
      const { reports } = await open(backend);
      const report = await reports.create("# mine");
      expect(await reports.delete(report.id, "wrong")).toBe(false);
      expect(await reports.delete("AAAAAAAAAAAAAAAAAAAAAA", report.deleteToken)).toBe(false);
      expect(await reports.delete(report.id, report.deleteToken)).toBe(true);
      expect(await reports.delete(report.id, report.deleteToken)).toBe(false);
      expect(await reports.get(report.id)).toBeNull();
    });
  });

  describe(`database (${backend.name})`, () => {
    test("data survives a reconnect and opening again leaves the tables alone", async () => {
      const first = await open(backend, true);
      await first.telemetry.record(ping, day("2026-11-07"));
      const report = await first.reports.create("# kept");
      await first.db.close();

      const db = await openTestDatabase(first.options);
      expect(await createReportStore(db.sql).get(report.id)).toMatchObject({ body: "# kept" });
      expect((await createTelemetryStore(db.sql).summary(1, day("2026-11-07"))).daily).toHaveLength(1);
    });
  });
}
