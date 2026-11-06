// Captures the section screenshots of the landing page from the panel's demo mode: a panel run from
// source with an owner, the web app's Vite server in front of it, and the panel's own browser-test demo
// data (seylo test/playwright/demo) patched with sections-demo.patch. See README.md, "Section captures".
//
//   bun run sections.ts [name ...]     all captures, or only the named ones
//
// Env: WEB (default http://127.0.0.1:3952, the Vite server), OWNER_FILE (two lines: email, password of
// the panel's owner; default out/owner). Writes out/sections/<name>.png and
// apps/landing/public/product/<name>.webp.

import { mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Browser, chromium, type Locator, type Page } from "playwright";
import sharp from "sharp";
import { ids } from "./out/demo/fixtures";
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
const only = process.argv.slice(2);

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

const shots: Shot[] = [
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
    run: async (page) => {
      await page.locator(".monaco-editor .view-line").first().waitFor();
      const editor = await card(page, "Environment");
      await width(editor, 700);
      await isolate(page, [editor]);
      await page.waitForTimeout(1400);
      const b = await union([editor], 22);
      return { ...b, y: b.y + 8, height: b.height - 8 };
    },
  },
  ...(
    [
      ["env-hover-problem", "redis.INTERNAL_URL"],
      ["env-hover-value", "api.URL"],
    ] as const
  ).map(([name, token]): Shot => ({
    name,
    path: service(svc.worker, "environment"),
    viewport: { width: 1440, height: 1000 },
    run: async (page) => {
      await page.locator(".monaco-editor .view-line").first().waitFor();
      await page.waitForTimeout(1200);
      const target = page.locator(".view-line span", { hasText: token }).last();
      const box = (await target.boundingBox()) as Box;
      await page.mouse.move(box.x + box.width * 0.55, box.y + box.height / 2);
      await page.waitForTimeout(1600);
      const hover = page.locator(".monaco-hover:not(.hidden)").first();
      return union([hover], 0);
    },
  })),
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
      await width(c, 680);
      await isolate(page, [c]);
      return union([c], 22);
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
for (const shot of shots) {
  if (only.length && !only.includes(shot.name)) continue;
  const viewport = shot.viewport ?? { width: 1440, height: 1200 };
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: shot.scale ?? 2,
    colorScheme: "light",
    reducedMotion: "reduce",
    storageState: state,
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`${shot.name}: ${e.message}`));
  await installDemo(page, { preset: shot.preset ?? "seylo", overrides: shot.overrides });
  await page.goto(base + shot.path);
  await settle(page);
  const clip = await shot.run(page);
  const png = `${outPng}/${shot.name}.png`;
  await page.screenshot({ path: png, fullPage: true, clip: clip ?? undefined });
  let img = sharp(png);
  if (shot.outWidth) img = img.resize({ width: shot.outWidth });
  const webp = `${outWebp}/${shot.name}.webp`;
  const info = await img.webp({ quality: shot.quality ?? 84, effort: 6 }).toFile(webp);
  console.log(`${shot.name}: ${info.width}x${info.height} ${Math.round(statSync(webp).size / 1024)} KB`);
  await context.close();
}
console.log("errors", errors);
await browser.close();
