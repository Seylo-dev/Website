import { describe, expect, test } from "bun:test";
import { request, testApp } from "./helpers";

const ping = (body: unknown, ip?: string) =>
  request("/telemetry", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    ip,
  });

const validPing = { installId: "inst_0123456789abcdef", version: "0.1.0", nodes: 3, services: 12 };

describe("telemetry", () => {
  test("counts one row per install per day", async () => {
    const { app } = testApp({ statsToken: "stats-secret" });
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
    const { app } = testApp();
    expect((await app.handle(ping({ ...validPing, nodes: -1 }))).status).toBe(422);
    expect((await app.handle(ping({ ...validPing, installId: "short" }))).status).toBe(422);
  });

  test("summary needs the stats token", async () => {
    expect((await testApp().app.handle(request("/telemetry/summary"))).status).toBe(404);
    const { app } = testApp({ statsToken: "stats-secret" });
    expect(
      (await app.handle(request("/telemetry/summary", { headers: { authorization: "Bearer wrong" } }))).status,
    ).toBe(401);
  });

  test("rate limits pings per client", async () => {
    const { app } = testApp();
    let last = 0;
    for (let i = 0; i < 61; i++) last = (await app.handle(ping(validPing, "198.51.100.9"))).status;
    expect(last).toBe(429);
  });
});
