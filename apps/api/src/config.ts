import { resolve } from "node:path";
import brand from "../../../brand/brand.json";
import { DEFAULT_DAILY_BUDGETS, type DailyBudgets } from "./daily-limits";

export interface InstallerConfig {
  /**
   * The app repo's releases page, `https://github.com/<repo>/releases`. Each check resolves
   * `<releasesUrl>/latest` to a tag once and downloads every file from `<releasesUrl>/download/<tag>/`.
   */
  releasesUrl: string;
  /**
   * The minisign key release manifests are signed with, from brand.json. Deliberately not an
   * environment variable: nothing in the deployment can point the API at another key.
   */
  publicKey: string;
  /** How long a verified installer is served before checking the release again. */
  cacheSeconds: number;
  /** Served when the release can't be fetched and nothing is cached. Null = no fallback. */
  localPath: string | null;
}

export interface Config {
  port: number;
  production: boolean;
  /** Postgres connection URL. Required in production; without it, dev and tests use SQLite in `dataDir`. */
  databaseUrl: string | null;
  /** Folder for the SQLite file used when there is no DATABASE_URL. */
  dataDir: string;
  /** Public base URL that report links are built on, without a trailing slash: `https://seylo.dev/l`. */
  reportBaseUrl: string;
  /**
   * Read the client IP from proxy headers for rate limiting: the last X-Forwarded-For hop, and
   * cf-connecting-ip when that hop is a Cloudflare address (see client-ip.ts). Only safe when every
   * request comes through a proxy that appends that hop, otherwise anyone can pick their own key.
   */
  trustProxy: boolean;
  /** Bearer token for GET /telemetry/summary. Null disables the endpoint. */
  statsToken: string | null;
  /** What the site takes in per UTC day from everyone together: REPORT_MIB_PER_DAY, TELEMETRY_INSTALLS_PER_DAY. */
  budgets: DailyBudgets;
  installer: InstallerConfig;
}

const MIB = 1024 * 1024;

/** A whole number from the environment, or `fallback` when unset. 0 is allowed and turns the thing off. */
function wholeNumber(env: Record<string, string | undefined>, name: string, fallback: number): number {
  const value = env[name]?.trim();
  if (!value) return fallback;
  if (!/^\d{1,9}$/.test(value)) throw new Error(`${name} must be a whole number, not "${value}".`);
  return Number(value);
}

const apiRoot = resolve(import.meta.dir, "..");

// In dev the installer comes from a checkout of the public repo next to this one, so
// `curl localhost:4000/install.sh` works before any release exists.
const devInstallerPath = resolve(apiRoot, "../../../seylo/installer/install.sh");

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const production = env.NODE_ENV === "production";
  const siteUrl = (env.SITE_URL ?? brand.urls.site).replace(/\/$/, "");

  return {
    port: Number(env.PORT ?? 4000),
    production,
    databaseUrl: env.DATABASE_URL?.trim() || null,
    dataDir: resolve(env.DATA_DIR ?? resolve(apiRoot, "data")),
    reportBaseUrl: `${siteUrl}/l`,
    trustProxy: env.TRUST_PROXY === "true",
    statsToken: env.STATS_TOKEN || null,
    budgets: {
      reportBytes: wholeNumber(env, "REPORT_MIB_PER_DAY", DEFAULT_DAILY_BUDGETS.reportBytes / MIB) * MIB,
      telemetryInstalls: wholeNumber(env, "TELEMETRY_INSTALLS_PER_DAY", DEFAULT_DAILY_BUDGETS.telemetryInstalls),
    },
    installer: {
      releasesUrl: (env.INSTALLER_RELEASES_URL ?? `https://github.com/${brand.github.repo}/releases`).replace(
        /\/+$/,
        "",
      ),
      publicKey: brand.minisignPublicKey,
      cacheSeconds: Number(env.INSTALLER_CACHE_SECONDS ?? 300),
      localPath: env.INSTALL_SCRIPT_PATH ?? (production ? null : devInstallerPath),
    },
  };
}
