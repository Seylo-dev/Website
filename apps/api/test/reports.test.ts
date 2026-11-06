import { afterAll, describe, expect, spyOn, test } from "bun:test";
import { createApp } from "../src/app";
import { MAX_REPORT_BYTES } from "../src/reports/routes";
import { REPORT_TTL_MS } from "../src/reports/store";
import { backends, closeTestDatabases, REPORT_BASE_URL, request, testApp } from "./helpers";

afterAll(closeTestDatabases);

const upload = (body: string, ip?: string) =>
  request("/l", { method: "POST", body, headers: { "content-type": "text/markdown" }, ip });

describe.each(backends)("troubleshoot reports ($name)", (backend) => {
  test("upload, read, read raw, delete", async () => {
    const { app } = await testApp({ backend });
    const created = await app.handle(upload("# Report\n\nAll **good**.\n\n<script>alert(1)</script>"));
    expect(created.status).toBe(201);
    const { id, url, deleteToken } = (await created.json()) as { id: string; url: string; deleteToken: string };
    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(url).toBe(`${REPORT_BASE_URL}/${id}`);

    const page = await app.handle(request(`/l/${id}`));
    expect(page.status).toBe(200);
    expect(page.headers.get("content-security-policy")).toContain("default-src 'none'");
    const html = await page.text();
    expect(html).toContain("<strong>good</strong>");
    expect(html).not.toContain("<script>");

    const raw = await app.handle(request(`/l/${id}/raw`));
    expect(await raw.text()).toContain("All **good**.");

    const wrongToken = await app.handle(
      request(`/l/${id}`, { method: "DELETE", headers: { authorization: "Bearer nope" } }),
    );
    expect(wrongToken.status).toBe(404);
    const deleted = await app.handle(
      request(`/l/${id}`, { method: "DELETE", headers: { authorization: `Bearer ${deleteToken}` } }),
    );
    expect(deleted.status).toBe(204);
    expect((await app.handle(request(`/l/${id}`))).status).toBe(404);
  });

  test("refuses a report with a secret left in it", async () => {
    const { app } = await testApp({ backend });
    const response = await app.handle(upload("DATABASE_URL=postgres://app:hunter2hunter2@db/app"));
    expect(response.status).toBe(422);
    const body = (await response.json()) as { findings: unknown[] };
    expect(body.findings).toEqual([{ rule: "url-password", line: 1 }]);
    expect(JSON.stringify(body)).not.toContain("hunter2");
  });

  test("a NUL byte in the logs is kept as U+FFFD instead of failing the upload", async () => {
    const { app } = await testApp({ backend });
    const created = await app.handle(upload("# log\n\u0000tail \u0000\u0000"));
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };
    expect(await (await app.handle(request(`/l/${id}/raw`))).text()).toBe("# log\n\uFFFDtail \uFFFD\uFFFD");
    expect(await (await app.handle(request(`/l/${id}`))).text()).toContain("\uFFFDtail");
  });

  test("refuses an oversized report", async () => {
    const { app } = await testApp({ backend });
    const response = await app.handle(upload("a".repeat(MAX_REPORT_BYTES + 1)));
    expect(response.status).toBe(413);
  });

  test("an expired report is gone", async () => {
    const { reports } = await testApp({ backend });
    const report = await reports.create("# old", 0);
    expect(await reports.get(report.id, REPORT_TTL_MS - 1)).not.toBeNull();
    expect(await reports.get(report.id, REPORT_TTL_MS)).toBeNull();
    expect(await reports.purgeExpired(REPORT_TTL_MS)).toBe(1);
  });

  test("rate limits uploads per client", async () => {
    const { app } = await testApp({ backend });
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) statuses.push((await app.handle(upload("# hi", "192.0.2.7"))).status);
    expect(statuses.slice(0, 20).every((s) => s === 201)).toBe(true);
    expect(statuses[20]).toBe(429);
    // Reading is never limited.
    expect((await app.handle(request("/l/AAAAAAAAAAAAAAAAAAAAAA", { ip: "192.0.2.7" }))).status).toBe(404);
  });
});

describe("database errors", () => {
  test("a failed query is a plain 500 and is logged, limits and validation still answer as before", async () => {
    const { app } = await testApp();
    // Shaped like Bun's PostgresError, which carries its own `code`.
    const failing = (async () => {
      throw Object.assign(new Error("Connection timeout after 10s"), { code: "ERR_POSTGRES_CONNECTION_TIMEOUT" });
    }) as unknown as import("bun").SQL;
    const broken = createApp({
      config: { trustProxy: true, statsToken: "s", reportBaseUrl: REPORT_BASE_URL },
      sql: failing,
      installer: { get: async () => null },
    }).app;
    const logged = spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await broken.handle(request("/l/AAAAAAAAAAAAAAAAAAAAAA"));
      expect(response.status).toBe(500);
      expect(await response.text()).toBe("Internal server error");
      expect(logged).toHaveBeenCalledTimes(1);
      expect((await broken.handle(upload("# hi"))).status).toBe(500);
      // Validation and unknown routes keep their own answers.
      expect((await broken.handle(request("/l/short"))).status).toBe(422);
      expect((await app.handle(request("/nope"))).status).toBe(404);
    } finally {
      logged.mockRestore();
    }
  });
});
