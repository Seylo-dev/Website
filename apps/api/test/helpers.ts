import { openDatabase } from "../src/db";
import { createApp } from "../src/app";
import type { InstallerSource } from "../src/installer/source";

export const REPORT_BASE_URL = "https://site.test/l";

const noInstaller: InstallerSource = { get: async () => null };

export function testApp(options: { statsToken?: string; installer?: InstallerSource } = {}) {
  const db = openDatabase(":memory:");
  return createApp({
    config: { trustProxy: true, statsToken: options.statsToken ?? null, reportBaseUrl: REPORT_BASE_URL },
    db,
    installer: options.installer ?? noInstaller,
  });
}

/** Each test gets its own client address, so rate limits from one test never leak into another. */
let nextIp = 1;
export function clientIp() {
  return `10.0.${Math.floor(nextIp / 250)}.${nextIp++ % 250}`;
}

export function request(path: string, init: RequestInit & { ip?: string } = {}) {
  const headers = new Headers(init.headers);
  headers.set("x-forwarded-for", init.ip ?? clientIp());
  return new Request(`http://api.test${path}`, { ...init, headers });
}
