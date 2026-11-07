import { resolve } from "node:path";
import brand from "../../../brand/brand.json";

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
   * Read the client IP from proxy headers for rate limiting. Only safe when the API is reachable
   * through the proxy alone, otherwise anyone can pick their own rate-limit key.
   */
  trustProxy: boolean;
  /** Bearer token for GET /telemetry/summary. Null disables the endpoint. */
  statsToken: string | null;
  installer: InstallerConfig;
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
