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

  // apps/panel/src/modules/nodes/lb-tls.ts: 30-day certificates (365 before 0.2.0-rc.2), renewed
  // with under 20 days left, and a longer one replaced at once; the hourly nodes.pruneReports job
  // only checks.
  test("guides/load-balancing: node certificates live 30 days, checked hourly, renewed 20 days ahead", async () => {
    const text = await page("guides/load-balancing.mdx");
    expect(text).not.toContain("renews it every hour");
    expect(text).not.toContain("(valid for a year)");
    expect(text).toContain("checks it every hour and renews it when fewer than 20 days are left");
    expect(text).toContain("valid for 30 days instead of a year");
    expect(text).toContain("a longer one from before is replaced at once");
  });

  // apps/panel/src/modules/nodes/join-command.ts: the Add node command always pipes the install host,
  // which checks install.sh against the signed release, and a released panel adds --version; a
  // release asset is never piped into sh.
  test("join commands pipe install.seylo.dev with --version", async () => {
    let commands = 0;
    for (const file of mdxFiles(docs)) {
      const name = relative(docs, file);
      const text = await Bun.file(file).text();
      expect({ name, asset: /releases\/download\/\S*install\.sh/.test(text) }).toEqual({ name, asset: false });
      for (const line of text.split("\n").filter((l) => l.includes("sh -s -- join "))) {
        commands++;
        expect({ name, line }).toEqual({
          name,
          line: expect.stringMatching(
            /^curl -fsSL https:\/\/install\.seylo\.dev \| sudo sh -s -- join .* --version '<version>'$/,
          ),
        });
      }
    }
    expect(commands).toBeGreaterThan(0);
  });

  // 0.2.1: apps/panel/src/modules/nodes/ops.ts createJoinToken stores `canBuild: input.canBuild ?? true` on
  // the join token, apps/web/src/components/nodes/add-node.tsx ticks "Build images on this node" by
  // default, and agent-hub/handshake.ts decideHello copies the token's value to a new node (a re-join keeps
  // the row's value); the node's own --can-build only writes config.yml. Tokens from before the 0004
  // migration have can_build false.
  test("a joining node builds by default, chosen in Add node, not by the node", async () => {
    const text = await page("guides/adding-nodes.mdx");
    expect(text).not.toContain("A new node does not build images until an owner or admin turns on");
    expect(text).toContain("with **Build images on this node**, which is ticked by default");
    expect(text).toContain("keeps its own **Can build**");
    expect(text).toContain("Join commands made before the panel's update to 0.2.1 still make nodes that don't build");
    const options = table(await page("installation.mdx"), "Option");
    const canBuild = options.get("`--can-build`")?.[0] ?? "";
    expect(canBuild).toContain("Only sets `can_build`");
    expect(canBuild).toContain("on by default since 0.2.1");
    expect(canBuild).not.toContain("Only the panel's own node from the installer starts building with it");
    for (const name of ["concepts.mdx", "security.mdx", "troubleshooting.mdx", "guides/github-and-git.mdx"]) {
      const other = await page(name);
      expect({
        name,
        stale:
          /only run images until an owner or admin|start with builds off, except|Nodes start with \*\*Build images on this node\*\* off/.test(
            other,
          ),
      }).toEqual({ name, stale: false });
    }
  });

  // 0.2.1: installer/install.sh.tmpl ensure_docker installs a missing Docker from get.docker.com without a
  // question, with or without a terminal (--no-docker-install stops instead); --install-docker and --yes only
  // matter for an installed Docker that does not start. The installer has no prompt left.
  test("installation: the installer installs a missing Docker without asking", async () => {
    const text = await page("installation.mdx");
    expect(text).not.toContain("offers to install it");
    expect(text).not.toContain("The installer asks one question");
    const docker = /### Docker\n([\s\S]*?)\n### /.exec(text)?.[1] ?? "";
    expect(docker).toContain("installs it with the official script from get.docker.com, without asking");
    expect(docker).toContain("`--no-docker-install` makes it stop there instead");
    const noTerminal = /### Without a terminal\n([\s\S]*?)\n### /.exec(text)?.[1] ?? "";
    expect(noTerminal).toContain("the installer asks nothing");
    const options = table(text, "Option");
    expect(options.get("`--install-docker`")?.[0]).toContain("when it is installed but does not start");
    expect(options.get("`--no-docker-install`")?.[0]).toContain("stop if it is missing");
    for (const file of mdxFiles(docs)) {
      const name = relative(docs, file);
      if (name === "reference/cli.mdx") continue;
      const other = await Bun.file(file).text();
      expect({ name, asks: /installs Docker if you agree|offers to install Docker/.test(other) }).toEqual({
        name,
        asks: false,
      });
    }
  });

  // 0.2.1: installer/install.sh.tmpl JOIN_REFUSED_EXIT=3 for a join the panel refused; a panel it cannot
  // reach yet exits 0 (the agent keeps trying).
  test("installation: the exit status of a refused join is 3", async () => {
    const rows = table(await page("installation.mdx"), "Status");
    expect(rows.get("`3`")?.[0]).toContain("A join the panel refused");
    expect(rows.get("`0`")?.[0]).toContain("can't reach the panel yet");
    expect(rows.get("`1`")?.[0]).toContain("Any other error");
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

  // 0.2.1: go/internal/cli/panel.go writeSetupLinkFile and plainHTTPTip (one calm tip instead of 0.2.0's
  // three-line warning), installer/install.sh.tmpl panel_ready (the framed closing block).
  test("installation: the sample installer output is from 0.2.1", async () => {
    const text = await page("installation.mdx");
    const sample = /```text\n==> Starting the panel\n([\s\S]*?)```/.exec(text)?.[1] ?? "";
    expect(sample).not.toContain("This link is plain HTTP");
    expect(sample).toMatch(/^Starting the panel \(ghcr\.io\/seylo-dev\/seylo:0\.2\.[1-9]\d*@sha256:\.\.\.\)\.\.\.$/m);
    const flat = sample.replace(/\n│ /g, " ");
    expect(flat).toContain("The panel is running. Open this link to create the owner account:");
    expect(flat).toContain("It works once, within an hour");
    expect(flat).toContain(
      "Tip: the panel uses plain HTTP until it has a domain. Add one in the setup wizard to switch to HTTPS.",
    );
    expect(flat).toContain("A new link when this one expires: seylo panel setup-link");
  });

  // 0.2.2: apps/web/src/components/git/add-credential-dialog.tsx (Add credential on the Git form) and
  // credentials-card.tsx (Settings > Git providers) add and manage git credentials, which only the API could
  // before; apps/panel/src/modules/git/remote.ts checkKnownHostsFor takes only lines that start with the
  // host as clones look it up ("[host]:port" off port 22) and refuses hashed ones.
  test("guides/github-and-git: git credentials are added in the panel, known_hosts names [host]:port", async () => {
    const text = await page("guides/github-and-git.mdx");
    expect(text).not.toContain("Adding one is done through the API for now (`git.createCredential`");
    const section = /### Git credentials\n([\s\S]*?)\n### /.exec(text)?.[1] ?? "";
    expect(section).toContain("**Add credential** next to the **Credential** picker");
    expect(section).toContain("**Settings → Git providers → Git credentials**");
    expect(section).toContain("the plain name on port 22, `[host]:port` on any other port");
    expect(section).toContain("Hashed lines (`|1|...`) cannot be matched");
  });

  // 0.2.2: apps/web/src/components/service-tabs.ts has one console tab; the shell is its ?mode=shell and the
  // /shell route redirects there. reference/cli.mdx is generated from the binary's help, so it is left out.
  test("services have one Console tab with Console | Shell, no Shell tab", async () => {
    for (const file of mdxFiles(docs)) {
      const name = relative(docs, file);
      if (name === "reference/cli.mdx") continue;
      const text = await Bun.file(file).text();
      expect({ name, shellTab: /\*\*Shell\*\* tab|Shell tab/.test(text) }).toEqual({ name, shellTab: false });
    }
    const text = await page("features/logs-and-terminals.mdx");
    expect(text).toContain("one **Console** tab, with a **Console | Shell** switch");
    expect(text).toContain("`?mode=shell`");
  });

  // 0.2.2: apps/panel/src/modules/env/desired.ts withPortEnv adds PORT only for repository builds whose
  // spec.portEnv is true, which insertService sets for new services; rows an older panel wrote read false.
  test("guides/environment-variables: PORT only for apps created on 0.2.2 or later", async () => {
    const text = await page("guides/environment-variables.mdx");
    const section = /## PORT for built apps\n([\s\S]*?)\n## /.exec(text)?.[1] ?? "";
    expect(section).toContain("gets `PORT=<its first port>`");
    expect(section).toContain("A `PORT` of your own wins");
    expect(section).toContain("Only apps created on 0.2.2 or later get it");
    expect(section).toMatch(
      /Images, Dockerfiles typed in the panel, uploads, compose members and cron services get none/,
    );
  });
});
