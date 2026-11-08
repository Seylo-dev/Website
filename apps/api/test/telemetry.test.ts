import { afterAll, describe, expect, spyOn, test } from "bun:test";
import { backends, closeTestDatabases, request, testApp } from "./helpers";

afterAll(closeTestDatabases);

const ping = (body: unknown, ip?: string) =>
  request("/telemetry", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    ip,
  });

const validPing = { installId: "inst_0123456789abcdef", version: "0.1.0", nodes: 3, services: 12 };

describe.each(backends)("telemetry ($name)", (backend) => {
  test("counts one row per install per day", async () => {
    const { app } = await testApp({ statsToken: "stats-secret", backend });
    expect((await app.handle(ping(validPing))).status).toBe(204);
    expect((await app.handle(ping({ ...validPing, nodes: 4 }))).status).toBe(204);
    expect((await app.handle(ping({ ...validPing, installId: "inst_fedcba9876543210" }))).status).toBe(204);

    const summary = await app.handle(
      request("/telemetry/summary?days=1", { headers: { authorization: "Bearer stats-secret" } }),
    );
    const body = (await summary.json()) as { daily: unknown[]; versions: unknown[] };
    expect(body.daily).toHaveLength(1);
    expect(body.daily[0]).toMatchObject({ installs: 2, nodes: 7, services: 24 });
    expect(body.versions).toEqual([{ version: "0.1.0", installs: 2 }]);
  });

  test("rejects bad values", async () => {
    const { app } = await testApp({ backend });
    expect((await app.handle(ping({ ...validPing, nodes: -1 }))).status).toBe(422);
    expect((await app.handle(ping({ ...validPing, installId: "short" }))).status).toBe(422);
  });

  test("summary needs the stats token", async () => {
    expect((await (await testApp({ backend })).app.handle(request("/telemetry/summary"))).status).toBe(404);
    const { app } = await testApp({ statsToken: "stats-secret", backend });
    expect(
      (await app.handle(request("/telemetry/summary", { headers: { authorization: "Bearer wrong" } }))).status,
    ).toBe(401);
  });

  test("counts only the day's budget of new installs, from every address together", async () => {
    const { app } = await testApp({ statsToken: "stats-secret", backend, budgets: { telemetryInstalls: 2 } });
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect((await app.handle(ping(validPing))).status).toBe(204);
      expect((await app.handle(ping({ ...validPing, installId: "inst_fedcba9876543210" }))).status).toBe(204);
      const refused = await app.handle(ping({ ...validPing, installId: "inst_made_up_000000001" }));
      expect(refused.status).toBe(503);
      expect(await refused.json()).toMatchObject({ error: "daily_limit" });
      expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0);
      // An install counted today still updates its row.
      expect((await app.handle(ping({ ...validPing, nodes: 9 }))).status).toBe(204);

      const summary = await app.handle(
        request("/telemetry/summary?days=1", { headers: { authorization: "Bearer stats-secret" } }),
      );
      const body = (await summary.json()) as { daily: unknown[] };
      expect(body.daily).toEqual([expect.objectContaining({ installs: 2, nodes: 12 })]);
    } finally {
      warn.mockRestore();
    }
  });

  test("one address starts only so many new installs a day", async () => {
    const { app } = await testApp({ backend, newInstallsPerDayPerIp: 3 });
    const install = (n: number) => ({ ...validPing, installId: `inst_flood_${String(n).padStart(10, "0")}` });
    for (let n = 1; n <= 3; n++) expect((await app.handle(ping(install(n), "2001:db8:1:1::1"))).status).toBe(204);
    // Another address in the same /64.
    const refused = await app.handle(ping(install(4), "2001:db8:1:1::ffff"));
    expect(refused.status).toBe(429);
    expect(await refused.json()).toMatchObject({ error: "too_many_installs" });
    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0);
    // Its installs keep reporting, and other addresses are unaffected.
    expect((await app.handle(ping({ ...install(1), nodes: 5 }, "2001:db8:1:1::1"))).status).toBe(204);
    expect((await app.handle(ping(install(4), "2001:db8:1:2::1"))).status).toBe(204);
  });

  test("rate limits pings per client", async () => {
    const { app } = await testApp({ backend });
    let last = 0;
    for (let i = 0; i < 61; i++) last = (await app.handle(ping(validPing, "198.51.100.9"))).status;
    expect(last).toBe(429);
  });
});
