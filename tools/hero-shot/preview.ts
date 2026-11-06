// Screenshots the landing hero at desktop and phone size and fails on horizontal page scroll.
//
//   bun run preview.ts [url]   (default http://localhost:3917, the landing from `bun run start`)
//
// Writes out/hero-{desktop,mobile}-top.png (page top) and out/hero-{desktop,mobile}.png (framed on the
// shot), 1440x900 and 390x844 at 2x.

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const url = process.argv[2] ?? "http://localhost:3917";
const outDir = join(here, "out");
mkdirSync(outDir, { recursive: true });

const sizes = [
  { name: "desktop", width: 1440, height: 900, mobile: false },
  { name: "mobile", width: 390, height: 844, mobile: true },
];

const browser = await chromium.launch();
let failed = false;
try {
  for (const size of sizes) {
    const context = await browser.newContext({
      viewport: { width: size.width, height: size.height },
      deviceScaleFactor: 2,
      isMobile: size.mobile,
      hasTouch: size.mobile,
      colorScheme: "dark",
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(1800); // past the rise-in animation
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const top = join(outDir, `hero-${size.name}-top.png`);
    await page.screenshot({ path: top });
    // Then framed on the shot: its top edge a quarter to a third of the way down the viewport.
    const box = await page.locator(".product-shot").first().boundingBox();
    if (box)
      await page.evaluate((y) => window.scrollTo(0, Math.max(0, y)), box.y - size.height * (size.mobile ? 0.3 : 0.28));
    await page.waitForTimeout(600);
    const file = join(outDir, `hero-${size.name}.png`);
    await page.screenshot({ path: file });
    console.log(`${size.name}: ${top}, ${file}, horizontal overflow ${overflow}px`);
    if (overflow > 0) failed = true;
    await context.close();
  }
} finally {
  await browser.close();
}
if (failed) process.exit(1);
