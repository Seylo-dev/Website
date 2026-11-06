import { describe, expect, test } from "bun:test";
import { MAX_REPORT_BYTES } from "../src/reports/routes";
import { REPORT_TTL_MS } from "../src/reports/store";
import { REPORT_BASE_URL, request, testApp } from "./helpers";

const upload = (body: string, ip?: string) =>
  request("/l", { method: "POST", body, headers: { "content-type": "text/markdown" }, ip });

describe("troubleshoot reports", () => {
  test("upload, read, read raw, delete", async () => {
    const { app } = testApp();
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
    const { app } = testApp();
    const response = await app.handle(upload("DATABASE_URL=postgres://app:hunter2hunter2@db/app"));
    expect(response.status).toBe(422);
    const body = (await response.json()) as { findings: unknown[] };
    expect(body.findings).toEqual([{ rule: "url-password", line: 1 }]);
    expect(JSON.stringify(body)).not.toContain("hunter2");
  });

  test("refuses an oversized report", async () => {
    const { app } = testApp();
    const response = await app.handle(upload("a".repeat(MAX_REPORT_BYTES + 1)));
    expect(response.status).toBe(413);
  });

  test("an expired report is gone", () => {
    const { reports } = testApp();
    const report = reports.create("# old", 0);
    expect(reports.get(report.id, REPORT_TTL_MS - 1)).not.toBeNull();
    expect(reports.get(report.id, REPORT_TTL_MS)).toBeNull();
    expect(reports.purgeExpired(REPORT_TTL_MS)).toBe(1);
  });

  test("rate limits uploads per client", async () => {
    const { app } = testApp();
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) statuses.push((await app.handle(upload("# hi", "192.0.2.7"))).status);
    expect(statuses.slice(0, 20).every((s) => s === 201)).toBe(true);
    expect(statuses[20]).toBe(429);
    // Reading is never limited.
    expect((await app.handle(request("/l/AAAAAAAAAAAAAAAAAAAAAA", { ip: "192.0.2.7" }))).status).toBe(404);
  });
});
