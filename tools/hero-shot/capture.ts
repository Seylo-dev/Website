// Captures the panel dashboard for the landing hero: signs in as the owner, opens the dashboard,
// waits for the three node graphs to draw, checks the page for leftover test names and errors, and
// writes out/dashboard[-dark].png plus the landing's public/product/dashboard.webp.
//
//   bun run capture.ts [--dark] [--no-webp]
//
// Env: PANEL (default http://192.168.64.3:3000), SESSION_COOKIES (a curl cookie jar with the owner's
// seylo_session, default ~/.cache/seylo-e2e/state/cookies). Without a usable session it signs in
// through auth.login with OWNER_FILE (two lines: email, password).

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type BrowserContext } from "playwright";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const home = process.env.HOME ?? "";
const panel = (process.env.PANEL ?? "http://192.168.64.3:3000").replace(/\/$/, "");
const jarFile = process.env.SESSION_COOKIES ?? join(home, ".cache/seylo-e2e/state/cookies");
const ownerFile = process.env.OWNER_FILE ?? join(home, ".cache/seylo-e2e/state/owner");
const dark = process.argv.includes("--dark");
const webp = !process.argv.includes("--no-webp") && !dark;

// 1600x1000 CSS pixels at 1.5x = 2400x1500: wide enough for the three-column project grid.
const viewport = { width: 1600, height: 1000 };
const scale = 1.5;

const outDir = join(here, "out");
const png = join(outDir, dark ? "dashboard-dark.png" : "dashboard.png");
const landingWebp = join(here, "../../apps/landing/public/product/dashboard.webp");

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

async function signIn(context: BrowserContext): Promise<void> {
  const host = new URL(panel).hostname;
  if (existsSync(jarFile)) {
    const line = readFileSync(jarFile, "utf8")
      .split("\n")
      .find((l) => l.split("\t")[5] === "seylo_session");
    const value = line?.split("\t")[6]?.trim();
    if (value) await context.addCookies([{ name: "seylo_session", value, domain: host, path: "/", httpOnly: true }]);
  }
  const who = await context.request.get(`${panel}/api/v1/auth.whoami`);
  if (who.ok()) return;
  const [email = "", password = ""] = readFileSync(ownerFile, "utf8").trim().split("\n");
  const login = await context.request.post(`${panel}/api/v1/auth.login`, { data: { email, password } });
  if (!login.ok()) throw new Error(`auth.login answered ${login.status()}`);
}

const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: scale,
    colorScheme: dark ? "dark" : "light",
  });
  await signIn(context);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(`${panel}/`);
  await page.getByRole("heading", { level: 1, name: "Dashboard" }).waitFor();
  const nodes = page.getByLabel("Node usage", { exact: false }).first();
  await nodes.waitFor();
  // Three graphs with drawn lines, then time for the draw-in animation and the live refresh to settle.
  await page.waitForFunction(() => document.querySelectorAll("main svg path").length >= 6, null, { timeout: 30_000 });
  await page.mouse.move(viewport.width - 4, viewport.height - 4);
  await page.waitForTimeout(3500);

  // Only what lands in the frame counts: text nodes whose box intersects the viewport.
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
  if (errors.length > 0) throw new Error(`page errors: ${errors.join("; ")}`);

  // The landing cuts the sidebar out as its own layer, so it needs the sidebar's share of the width.
  const sidebar = await page.getByRole("navigation").first().boundingBox();
  const sidebarRatio = sidebar ? Number(((sidebar.x + sidebar.width) / viewport.width).toFixed(4)) : null;

  mkdirSync(outDir, { recursive: true });
  await page.screenshot({ path: png });
  console.log(`wrote ${png} (${viewport.width * scale}x${viewport.height * scale}), sidebarRatio ${sidebarRatio}`);

  if (webp) {
    await sharp(png).webp({ quality: 88, effort: 6 }).toFile(landingWebp);
    console.log(`wrote ${landingWebp}`);
  }
} finally {
  await browser.close();
}
