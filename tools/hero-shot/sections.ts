// Captures the panel screenshots of the landing page from the panel's demo mode: a panel run from
// source with an owner, the web app's Vite server in front of it, and the panel's own browser-test demo
// data (seylo test/playwright/demo) patched with sections-demo.patch. See README.md, "Section captures".
//
//   bun run sections.ts [--dark | --both] [name ...]     all captures, or only the named ones
//
// Light is the default theme. --dark takes the dark pass only, --both takes light and then dark: the
// panel's default theme in dark mode (the seylo-night preset) from the same demo data, written next to
// the light file with a -dark suffix. The theme-* preset shots have one theme of their own and are
// skipped in the dark pass.
//
// Env: WEB (default http://127.0.0.1:3952, the Vite server), OWNER_FILE (two lines: email, password of
// the panel's owner; default out/owner). Writes out/sections/<name>[-dark].png and
// apps/landing/public/product/<name>[-dark].webp.

import { mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Browser, chromium, type Locator, type Page } from "playwright";
import sharp from "sharp";
import { ids, metricsNodes, nodes, updateStatus } from "./out/demo/fixtures";
import { type Handler, installDemo, type Preset } from "./out/demo/routes";
import { handlers as serviceHandlers, ids as svc } from "./out/demo/service";

const here = dirname(fileURLToPath(import.meta.url));
const base = (process.env.WEB ?? "http://127.0.0.1:3952").replace(/\/$/, "");
const outPng = join(here, "out/sections");
const outWebp = join(here, "../../apps/landing/public/product");
mkdirSync(outPng, { recursive: true });
mkdirSync(outWebp, { recursive: true });
const [email = "", password = ""] = readFileSync(process.env.OWNER_FILE ?? join(here, "out/owner"), "utf8")
  .trim()
  .split("\n");
const service = (id: string, tab = "") => `/p/${ids.acme}/s/${id}${tab ? `/${tab}` : ""}`;

const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith("--"));
const unknown = flags.filter((f) => f !== "--dark" && f !== "--both");
if (unknown.length > 0) throw new Error(`unknown flag ${unknown.join(", ")} (use --dark or --both)`);
type Theme = "light" | "dark";
const themes: Theme[] = flags.includes("--both") ? ["light", "dark"] : flags.includes("--dark") ? ["dark"] : ["light"];
const only = args.filter((a) => !a.startsWith("--"));

// Every page's clock stands still at one moment, so "5 minutes ago" and countdowns read the same in
// each shot and in both themes, however long the run takes. The hero's graph points are laid out from the
// same moment, so the light and the dark pass get identical lines.
const frozenAt = Date.now();

type Box = { x: number; y: number; width: number; height: number };
interface Shot {
  name: string;
  path: string;
  viewport?: { width: number; height: number };
  preset?: Preset;
  scale?: number;
  overrides?: Record<string, Handler>;
  /** Width of the final webp in pixels (resized down when set). */
  outWidth?: number;
  /**
   * Keeps the page's clock running instead of frozen. The env editor needs it: with a frozen clock its
   * syntax highlighting never runs. Only for screens without relative times.
   */
  runningClock?: boolean;
  quality?: number;
  /** Prepares the page and returns the region to keep. */
  run: (page: Page) => Promise<Box | null>;
}

/** The card (data-slot="card" or a shadow-card box) around the first element whose own text is `title`. */
async function card(page: Page, title: string): Promise<Locator> {
  const id = `cap-${title.replace(/\W+/g, "-").toLowerCase()}`;
  await page.waitForFunction(
    ([t, id]) => {
      const all = [...document.querySelectorAll("main *, [role=dialog] *")] as HTMLElement[];
      for (const el of all.filter((e) =>
        [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim() === t),
      )) {
        let node: HTMLElement | null = el;
        while (node && node.getAttribute("data-slot") !== "card" && !/shadow-card/.test(String(node.className)))
          node = node.parentElement;
        if (!node) continue;
        node.setAttribute("data-cap", id);
        return true;
      }
      return false;
    },
    [title, id] as const,
    { timeout: 15000 },
  );
  return page.locator(`[data-cap="${id}"]`);
}

async function width(locator: Locator, px: number) {
  await locator.evaluate((el, w) => {
    (el as HTMLElement).style.maxWidth = `${w}px`;
    (el as HTMLElement).style.width = `${w}px`;
  }, px);
}

/** Hides every other card on the page, so a narrowed card has no neighbours peeking into the crop. */
async function isolate(page: Page, keep: Locator[]) {
  const handles = await Promise.all(keep.map((l) => l.elementHandle()));
  await page.evaluate((els) => {
    const targets = els.filter(Boolean) as HTMLElement[];
    for (const el of document.querySelectorAll<HTMLElement>(
      'main [data-slot="card"], main .shadow-card, main section',
    )) {
      if (targets.some((t) => t === el || t.contains(el) || el.contains(t))) continue;
      el.style.visibility = "hidden";
    }
  }, handles);
}

async function union(locators: Locator[], pad = 20, cut?: { maxHeight?: number }): Promise<Box> {
  const boxes = await Promise.all(locators.map(async (l) => (await l.boundingBox()) as Box));
  const x = Math.min(...boxes.map((b) => b.x)) - pad;
  const y = Math.min(...boxes.map((b) => b.y)) - pad;
  const right = Math.max(...boxes.map((b) => b.x + b.width)) + pad;
  let bottom = Math.max(...boxes.map((b) => b.y + b.height)) + pad;
  if (cut?.maxHeight) bottom = Math.min(bottom, y + cut.maxHeight);
  return { x: Math.max(0, x), y: Math.max(0, y), width: right - Math.max(0, x), height: bottom - Math.max(0, y) };
}

async function settle(page: Page, extra = 1600) {
  await page.locator("main").first().waitFor();
  await page
    .locator('[data-slot="skeleton"]')
    .first()
    .waitFor({ state: "detached", timeout: 15000 })
    .catch(() => {});
  await page.waitForTimeout(extra);
}

/**
 * Node graphs for the hero: the demo's three nodes at their own levels, with faster swings and a little
 * deterministic jitter so the lines look like a fleet at work rather than three calm waves. Each line
 * ends on the node's current usage, so the numbers under the graphs match the right edge.
 */
function livelyNodes(range: string) {
  const demo = metricsNodes(range);
  const count = 90;
  const step = demo.stepSeconds;
  const start = Math.floor(frozenAt / 60_000) * 60_000 - count * step * 1000;
  const jitter = (i: number, seed: number) => {
    const v = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
    return (v - Math.floor(v)) * 2 - 1;
  };
  const line = (seed: number, swing: number, end: number, rough = 0.18) => {
    const values = Array.from({ length: count }, (_, i) => {
      const x = i / 3.2;
      return (
        swing *
        (Math.sin(x + seed) * 0.5 +
          Math.sin(x * 2.1 + seed * 2) * 0.32 +
          Math.sin(x * 0.55 + seed * 3) * 0.45 +
          Math.sin(x * 4.3 + seed) * 0.16 +
          jitter(i, seed) * rough)
      );
    });
    const shift = end - (values[count - 1] ?? 0);
    return values.map((v) => Math.max(0, v + shift));
  };
  const shapes: Record<string, { seed: number; cpu: number; mem: number; net: number }> = {
    [ids.de]: { seed: 1, cpu: 11, mem: 0.06, net: 0.55 },
    [ids.us]: { seed: 2.6, cpu: 6, mem: 0.05, net: 0.7 },
    [ids.il]: { seed: 4.1, cpu: 9, mem: 0.025, net: 0.45 },
  };
  return {
    ...demo,
    nodes: demo.nodes.map((node) => {
      const shape = shapes[node.nodeId] as { seed: number; cpu: number; mem: number; net: number };
      const latest = (nodes.find((n) => n.id === node.nodeId) as (typeof nodes)[number]).usage;
      const net = latest.networkRxBytesPerSec + latest.networkTxBytesPerSec;
      const cpu = line(shape.seed, shape.cpu, latest.cpuPercent);
      const mem = line(shape.seed + 1, latest.memoryUsedBytes * shape.mem, latest.memoryUsedBytes, 0.08);
      const traffic = line(shape.seed + 2, net * shape.net, net, 0.3);
      return {
        ...node,
        points: cpu.map((value, i) => ({
          t: start + i * step * 1000,
          cpuPercent: Math.min(100, value),
          memoryUsedBytes: Math.round(mem[i] ?? 0),
          memoryTotalBytes: latest.memoryTotalBytes,
          diskUsedBytes: latest.diskUsedBytes,
          networkRxBytesPerSec: (traffic[i] ?? 0) * 0.6,
          networkTxBytesPerSec: (traffic[i] ?? 0) * 0.4,
        })),
      };
    }),
  };
}

/** Words that must not show up in a marketing screenshot. */
const banned = [
  /\be2e\b/i,
  /\btest\b/i,
  /colima/i,
  /lima-/i,
  /\bfailed\b/i,
  /something went wrong/i,
  /no services yet/i,
];

/** Fails when the visible part of the page shows a banned word. */
async function checkWords(page: Page) {
  const text = await page.evaluate(() => {
    const parts: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.trim()) continue;
      range.selectNodeContents(node);
      const box = range.getBoundingClientRect();
      if (box.width > 0 && box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth) {
        parts.push(node.textContent.trim());
      }
    }
    return parts.join("\n");
  });
  const hits = banned.filter((re) => re.test(text)).map(String);
  if (hits.length > 0) throw new Error(`the page shows words that should not be in the shot: ${hits.join(", ")}`);
}

const shots: Shot[] = [
  {
    // The landing hero (components/product-shot.tsx): the whole dashboard, 1600x1000 CSS pixels at 1.5x.
    name: "dashboard",
    path: "/",
    viewport: { width: 1600, height: 1000 },
    scale: 1.5,
    quality: 86,
    overrides: {
      "metrics.nodes": (input) => livelyNodes(String(input.range ?? "1h")),
      // A calm sidebar: auto-update on, every node on the released version, no rollout in progress.
      "updates.status": () => ({
        ...updateStatus,
        activeRun: null,
        nodes: updateStatus.nodes.map((node) => ({ ...node, version: "0.1.1", updateAvailable: false })),
      }),
    },
    run: async (page) => {
      await page.getByRole("heading", { level: 1, name: "Dashboard" }).waitFor();
      await page.waitForFunction(() => document.querySelectorAll("main svg path").length >= 6, null, {
        timeout: 20000,
      });
      await page.mouse.move(1596, 996);
      await page.waitForTimeout(2500);
      await checkWords(page);
      // The landing cuts the sidebar out as its own layer, so it needs the sidebar's share of the width.
      const sidebar = await page.getByRole("navigation").first().boundingBox();
      if (sidebar) console.log(`dashboard: sidebarRatio ${((sidebar.x + sidebar.width) / 1600).toFixed(4)}`);
      return { x: 0, y: 0, width: 1600, height: 1000 };
    },
  },
  {
    name: "templates",
    path: "/templates",
    viewport: { width: 1140, height: 1000 },
    run: async (page) => {
      await page.locator("main img").nth(5).waitFor();
      await page.waitForFunction(() =>
        [...document.querySelectorAll("main img")].every((i) => (i as HTMLImageElement).complete),
      );
      const main = page.locator("main").first();
      const cards = main.locator("button:has(b)");
      const m = (await main.boundingBox()) as Box;
      const c = (await cards.nth(5).boundingBox()) as Box;
      return { x: m.x, y: 0, width: m.width, height: c.y + c.height + 14 };
    },
  },
  {
    name: "env",
    path: service(svc.worker, "environment"),
    viewport: { width: 1440, height: 1000 },
    runningClock: true,
    run: async (page) => {
      await page.locator(".monaco-editor .view-line").first().waitFor();
      const editor = await card(page, "Environment");
      await width(editor, 600);
      await isolate(page, [editor]);
      await page.waitForTimeout(1400);
      // The editor's own hover on the last line's reference: it opens above its token, over plain lines,
      // and leaves the two red underlines in view.
      const target = page.locator(".view-line span", { hasText: "api.URL" }).last();
      const t = (await target.boundingBox()) as Box;
      await page.mouse.move(t.x + t.width * 0.55, t.y + t.height / 2);
      await page.locator(".monaco-hover:not(.hidden)").first().waitFor();
      await page.waitForTimeout(1200);
      const b = await union([editor], 22);
      return { ...b, y: b.y + 8, height: b.height - 8 };
    },
  },
  {
    name: "domain-access",
    path: service(svc.web, "domains"),
    viewport: { width: 1440, height: 1100 },
    run: async (page) => {
      const row = page.getByText("https://admin.example.com/admin").first();
      await row.waitFor();
      const rowEl = row.locator(
        "xpath=ancestor::div[.//button[contains(@aria-label,'admin.example.com') or @aria-haspopup]][1]",
      );
      await rowEl.locator("button[aria-haspopup]").last().click();
      await page.getByRole("menuitem", { name: /Access rules/ }).click();
      const sheet = page.getByRole("dialog");
      await sheet.waitFor();
      await page.waitForTimeout(900);
      const s = (await sheet.boundingBox()) as Box;
      const end = (await sheet.getByRole("button", { name: /Add redirect/ }).boundingBox()) as Box;
      return { x: s.x, y: 0, width: s.width, height: end.y + end.height + 30 };
    },
  },
  {
    name: "crash-policy",
    path: service(svc.api, "advanced"),
    overrides: {
      "services.get": (input) => ({
        ...((serviceHandlers["services.get"] as Handler)(input) as object),
        crashPolicy: { restart: true, stopAfterCrashes: 5 },
      }),
    },
    run: async (page) => {
      const c = await card(page, "Crash policy");
      await width(c, 540);
      await isolate(page, [c]);
      return union([c], 22);
    },
  },
  {
    name: "health-check",
    path: service(svc.api, "advanced"),
    run: async (page) => {
      const c = await card(page, "Health check and deploys");
      await width(c, 580);
      await isolate(page, [c]);
      // Skip the line of the block above the card.
      const b = await union([c], 22);
      return { ...b, y: b.y + 8, height: b.height - 8 };
    },
  },
  {
    name: "timed-expose",
    path: service(svc.web, "domains"),
    run: async (page) => {
      const label = page.getByText("Timed expose", { exact: true }).first();
      await label.waitFor();
      const handle = await label.evaluateHandle((el) => {
        let node: HTMLElement | null = el as HTMLElement;
        while (node && (node.getBoundingClientRect().width < 420 || node.getBoundingClientRect().height < 150))
          node = node.parentElement;
        return node;
      });
      const box = (await handle.asElement()?.boundingBox()) as Box;
      return { x: box.x - 12, y: box.y - 12, width: box.width + 24, height: box.height + 24 };
    },
  },
  {
    name: "node-graphs",
    path: `/nodes?node=${ids.de}`,
    viewport: { width: 1440, height: 1000 },
    run: async (page) => {
      const sheet = page.getByRole("dialog");
      await sheet.waitFor();
      await page.waitForTimeout(1500);
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.waitForTimeout(300);
      const s = (await sheet.boundingBox()) as Box;
      const end = (await page.getByText("Desired state").first().boundingBox()) as Box;
      return { x: s.x, y: 0, width: s.width, height: end.y + 52 };
    },
  },
  {
    name: "node-health",
    path: `/nodes?node=${ids.us}&view=health`,
    viewport: { width: 1440, height: 1000 },
    run: async (page) => {
      const sheet = page.getByRole("dialog");
      await sheet.waitFor();
      await page.waitForTimeout(1000);
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.waitForTimeout(300);
      const s = (await sheet.boundingBox()) as Box;
      const end = (await page.getByText("Control groups").first().boundingBox()) as Box;
      return { x: s.x, y: 0, width: s.width, height: end.y + 66 };
    },
  },
  {
    name: "replicas",
    path: service(svc.web, "advanced"),
    run: async (page) => {
      const a = await card(page, "Replicas and nodes");
      await width(a, 640);
      await isolate(page, [a]);
      return union([a], 22);
    },
  },
  {
    name: "database",
    path: service(svc.db, "connection"),
    viewport: { width: 1440, height: 1000 },
    quality: 80,
    run: async (page) => {
      const main = page.locator("main").first();
      const m = (await main.boundingBox()) as Box;
      const backups = await card(page, "Backups");
      const b = (await backups.boundingBox()) as Box;
      return { x: m.x, y: 0, width: m.width, height: b.y + b.height + 28 };
    },
  },
  {
    name: "logs",
    path: service(svc.api, "logs"),
    viewport: { width: 1100, height: 1200 },
    run: async (page) => {
      const input = page.getByPlaceholder(/Search every deploy/);
      await input.waitFor();
      await page.waitForTimeout(800);
      const i = (await input.boundingBox()) as Box;
      const main = (await page.locator("main").first().boundingBox()) as Box;
      return { x: main.x, y: i.y - 14, width: main.width, height: 860 };
    },
  },
  {
    name: "metrics",
    path: service(svc.api, "metrics"),
    viewport: { width: 1100, height: 1000 },
    run: async (page) => {
      await page.waitForTimeout(800);
      const c = await card(page, "100% is one full core");
      await width(c, 640);
      await isolate(page, [c]);
      await page.waitForTimeout(600);
      return union([c], 22);
    },
  },
  {
    name: "uptime",
    path: service(svc.api, "alerts"),
    run: async (page) => {
      const c = await card(page, "Uptime checks");
      await c.getByRole("button", { name: "History" }).click();
      await page.waitForTimeout(1600);
      const r = await card(page, "Recent alerts");
      await width(c, 640);
      await width(r, 640);
      await isolate(page, [c, r]);
      return union([c, r], 22);
    },
  },
  {
    name: "approvals",
    path: "/approvals",
    run: async (page) => {
      const first = page.locator('[data-slot="card"]').first();
      await first.waitFor();
      await width(first, 700);
      await isolate(page, [first]);
      return union([first], 22);
    },
  },
  {
    name: "people",
    path: "/settings/people",
    run: async (page) => {
      const c = await card(page, "People");
      await width(c, 860);
      await isolate(page, [c]);
      await page.waitForTimeout(400);
      return union([c], 22);
    },
  },
  {
    name: "appearance",
    path: "/settings/appearance",
    overrides: {
      "settings.appearance": () => ({
        preset: "seylo",
        colorMode: "system",
        accent: null,
        customCss:
          "/* Tighter corners for the whole panel */\n:root {\n  --radius: 6px;\n}\n\n/* Our sign-in page */\n.login-card {\n  backdrop-filter: blur(8px);\n}\n",
      }),
    },
    run: async (page) => {
      await page.locator(".monaco-editor .view-line").first().waitFor();
      await page.waitForTimeout(1000);
      const theme = await card(page, "Theme");
      const css = page.getByText("Custom CSS", { exact: true }).first();
      const handle = await css.evaluateHandle((el) => {
        let node: HTMLElement | null = el as HTMLElement;
        while (node && node.getBoundingClientRect().height < 200) node = node.parentElement;
        return node;
      });
      const t = (await theme.boundingBox()) as Box;
      const c = (await handle.asElement()?.boundingBox()) as Box;
      return { x: t.x - 22, y: t.y - 14, width: t.width + 44, height: c.y + c.height + 22 - (t.y - 14) };
    },
  },
  ...(["seylo", "seylo-night", "classic", "midnight"] as Preset[]).map((preset): Shot => ({
    name: `theme-${preset}`,
    path: "/",
    preset,
    viewport: { width: 1440, height: 900 },
    scale: 1,
    outWidth: 720,
    run: async (page) => {
      await page.waitForFunction(() => document.querySelectorAll("main svg path").length >= 6, null, {
        timeout: 20000,
      });
      await page.waitForTimeout(1500);
      return { x: 0, y: 0, width: 1440, height: 900 };
    },
  })),
];

const browser: Browser = await chromium.launch();
const auth = await browser.newContext();
const login = await auth.request.post(`${base}/api/v1/auth.login`, { data: { email, password } });
if (!login.ok()) throw new Error(`login ${login.status()}`);
const state = await auth.storageState();
await auth.close();

const errors: string[] = [];
const large: string[] = [];
for (const shot of shots) {
  if (only.length && !only.includes(shot.name)) continue;
  for (const theme of themes) {
    // A preset shot shows that preset's own colors; it has no dark twin.
    if (theme === "dark" && shot.preset) continue;
    const name = theme === "dark" ? `${shot.name}-dark` : shot.name;
    const viewport = shot.viewport ?? { width: 1440, height: 1200 };
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: shot.scale ?? 2,
      colorScheme: theme,
      reducedMotion: "reduce",
      storageState: state,
    });
    const page = await context.newPage();
    if (!shot.runningClock) await page.clock.setFixedTime(frozenAt);
    page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
    // Dark is the default theme in dark mode: the preset a user gets when the panel follows a dark system.
    await installDemo(page, {
      preset: shot.preset ?? (theme === "dark" ? "seylo-night" : "seylo"),
      overrides: shot.overrides,
    });
    await page.goto(base + shot.path);
    await settle(page);
    const clip = await shot.run(page);
    const png = `${outPng}/${name}.png`;
    await page.screenshot({ path: png, fullPage: true, clip: clip ?? undefined });
    let img = sharp(png);
    if (shot.outWidth) img = img.resize({ width: shot.outWidth });
    const webp = `${outWebp}/${name}.webp`;
    const info = await img.webp({ quality: shot.quality ?? 84, effort: 6 }).toFile(webp);
    const kb = Math.round(statSync(webp).size / 1024);
    console.log(`${name}: ${info.width}x${info.height} ${kb} KB`);
    if (kb > 200) large.push(`${name} (${kb} KB)`);
    await context.close();
  }
}
console.log("errors", errors);
if (large.length > 0) console.log("over 200 KB, lower the shot's quality:", large.join(", "));
await browser.close();
