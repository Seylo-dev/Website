import type { InstallerConfig } from "../config";

export type InstallerOrigin = "release" | "cache" | "local";

export interface InstallerScript {
  script: string;
  origin: InstallerOrigin;
}

const FETCH_TIMEOUT_MS = 5000;
const MAX_SCRIPT_BYTES = 1024 * 1024;

/**
 * Serves the installer from the latest GitHub release, cached in memory so `curl | sh` doesn't
 * cost a GitHub round trip each time. If GitHub is down, the last good copy keeps being served;
 * with no copy at all, the local file (a sibling checkout of the public repo in dev) is used.
 */
export function createInstallerSource(config: InstallerConfig, fetchImpl: typeof fetch = fetch) {
  let cached: { script: string; fetchedAt: number } | null = null;
  let inflight: Promise<string | null> | null = null;

  async function fetchRelease(): Promise<string | null> {
    try {
      const response = await fetchImpl(config.releaseUrl, {
        redirect: "follow",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!response.ok) return null;
      const script = await response.text();
      // A missing asset or a GitHub error page must never be piped into someone's shell.
      if (!script.startsWith("#!") || script.length > MAX_SCRIPT_BYTES) return null;
      return script;
    } catch {
      return null;
    }
  }

  async function readLocal(): Promise<string | null> {
    if (!config.localPath) return null;
    const file = Bun.file(config.localPath);
    return (await file.exists()) ? file.text() : null;
  }

  return {
    async get(now = Date.now()): Promise<InstallerScript | null> {
      if (cached && now - cached.fetchedAt < config.cacheSeconds * 1000) {
        return { script: cached.script, origin: "cache" };
      }

      // Concurrent requests after the cache expires share one fetch.
      inflight ??= fetchRelease().finally(() => {
        inflight = null;
      });
      const fresh = await inflight;
      if (fresh) {
        cached = { script: fresh, fetchedAt: now };
        return { script: fresh, origin: "release" };
      }

      if (cached) return { script: cached.script, origin: "cache" };
      const local = await readLocal();
      return local ? { script: local, origin: "local" } : null;
    },
  };
}

export type InstallerSource = ReturnType<typeof createInstallerSource>;
