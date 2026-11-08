import { describe, expect, test } from "bun:test";
import { readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

// Statements in the docs that were checked against the app repo's code (github.com/Seylo-dev/App,
// 0.2.0-rc.2) and once said something the code does not do. The docs can't import that code, so
// these pin each page to what the code does; when the code changes, change the page and the test.
const docs = resolve(import.meta.dir, "../../docs/content/docs");
const page = (path: string) => Bun.file(`${docs}/${path}`).text();

/** The rows of the first Markdown table whose header starts with `firstHeader`, keyed by the first cell. */
function table(text: string, firstHeader: string): Map<string, string[]> {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line.startsWith(`| ${firstHeader} |`));
  expect(start).toBeGreaterThan(-1);
  const rows = new Map<string, string[]>();
  for (const line of lines.slice(start + 2)) {
    if (!line.startsWith("|")) break;
    const cells = line
      .slice(1, -1)
      .split(" | ")
      .map((cell) => cell.trim());
    rows.set(cells[0] ?? "", cells.slice(1));
  }
  return rows;
}

function mdxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? mdxFiles(path) : path.endsWith(".mdx") ? [path] : [];
  });
}

describe("docs match the app", () => {
  // apps/panel/src/modules/backups/ops.ts runNow: with a policyId the run belongs to that schedule
  // and runs.ts applyRetention keeps only its keepLast newest; only a one-off (no policy) has keepLast 0.
  test("guides/backups: Back up now counts toward the schedule's Keep newest", async () => {
    const text = await page("guides/backups.mdx");
    expect(text).not.toContain("Backups made by hand are kept until you delete them");
    const line = text.split("\n").find((l) => l.startsWith("**Back up now**")) ?? "";
    expect(line).toContain("first schedule");
    expect(line).toContain("counts toward that schedule's **Keep newest**");
    expect(line).toMatch(/without a schedule.*one-off.*kept until you delete it/);
  });

  // apps/panel/src/modules/metrics/query.ts ranges.
  test("features/metrics: resolution of each range", async () => {
    const rows = table(await page("features/metrics.mdx"), "Range");
    expect(Object.fromEntries([...rows].map(([range, [resolution]]) => [range, resolution]))).toEqual({
      Live: "The last 5 minutes, every 10-second sample",
      "1 hour": "1-minute buckets",
      "24 hours": "5-minute buckets",
      "7 days": "Hourly buckets",
      "30 days": "Hourly buckets, grouped by 6 hours",
    });
  });

  // apps/panel/src/modules/nodes/lb-tls.ts: 365-day certificates, renewed with under 30 days left;
  // the hourly nodes.pruneReports job only checks.
  test("guides/load-balancing: node certificates are checked hourly, renewed 30 days ahead", async () => {
    const text = await page("guides/load-balancing.mdx");
    expect(text).not.toContain("renews it every hour");
    expect(text).toContain("valid for a year");
    expect(text).toContain("checks it every hour and renews it when fewer than 30 days are left");
  });

  // apps/web/src/i18n/en/settings.ts sections.apiKeys. reference/cli.mdx is generated from the
  // binary's help and changes with it, so it is left out here.
  test("the settings page for keys is named API keys and MCP", async () => {
    for (const file of mdxFiles(docs)) {
      const name = relative(docs, file);
      if (name === "reference/cli.mdx") continue;
      const text = await Bun.file(file).text();
      for (const match of text.matchAll(/Settings (?:→|>|&gt;) API keys(.{0,8})/g)) {
        expect({ name, after: match[1] }).toEqual({ name, after: expect.stringMatching(/^ and MCP/) });
      }
    }
  });

  // apps/web/src/components/service-tabs.ts: the tab set of each kind.
  test("concepts: what each service kind gets", async () => {
    const text = await page("concepts.mdx");
    expect(text).not.toContain("Every service gets");
    const line = text.split("\n").find((l) => l.startsWith("Apps and compose members get")) ?? "";
    expect(line).toContain("a console, a shell");
    const databases = /Databases get ([^;.]*)/.exec(line)?.[1] ?? "";
    expect(databases).toContain("a database shell");
    expect(databases).not.toMatch(/console|crash policy/);
    const boxes = /Boxes get ([^;.]*)/.exec(line)?.[1] ?? "";
    expect(boxes).toBeTruthy();
    expect(boxes).not.toMatch(/console|shell|alert|crash/);
    expect(line).toMatch(/cron services get .*except the console and the shell/i);
  });

  // installer/install.sh open_firewall: the 5757 rule needs panel_ip, which is empty for a domain.
  test("installation: a joining node opens 5757 only for an IP join URL", async () => {
    const rows = table(await page("installation.mdx"), "Port");
    expect(rows.get("5757")?.[1]).toContain("when the join URL is an IP address");
  });

  // go/internal/datadir/datadir.go, go/internal/update/files.go, apps/panel/src/security/agent-tls.ts.
  test("installation: Where things live lists every folder other pages point to", async () => {
    const text = await page("installation.mdx");
    const tree = /<Files>([\s\S]*?)<\/Files>/.exec(text)?.[1] ?? "";
    for (const folder of ["run", "network", "update"]) expect(tree).toContain(`<Folder name="${folder}" />`);
    expect(tree).toContain('<File name="agent-tls.key" />');
    const rows = table(text, "Path");
    for (const path of ["`run/`", "`network/`", "`update/`"]) expect(rows.has(path)).toBe(true);
    expect(rows.get("`update/`")?.[0]).toContain("panel-snapshots/");
    expect(rows.get("`panel/`")?.[0]).toContain("agent-tls.key");
  });

  // go/internal/cli/panel.go: only the 0.2 installer prints the plain-HTTP lines under the link.
  test("installation: the sample installer output is from 0.2", async () => {
    const text = await page("installation.mdx");
    const sample = /```text\n==> Starting the panel\n([\s\S]*?)```/.exec(text)?.[1] ?? "";
    expect(sample).toContain("This link is plain HTTP");
    expect(sample).toMatch(/^Starting the panel \(ghcr\.io\/seylo-dev\/seylo:0\.2\.\d+@sha256:\.\.\.\)\.\.\.$/m);
  });
});
