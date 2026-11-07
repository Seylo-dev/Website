import { createHash } from "node:crypto";
import type { InstallerConfig } from "../config";
import { verifyMinisign } from "./minisign";
import { compareSemver, parseSemver } from "./semver";

export type InstallerOrigin = "release" | "cache" | "local";

export interface InstallerScript {
  script: string;
  origin: InstallerOrigin;
  /** Release version and sha256 of a verified copy; null for the local dev file. */
  version: string | null;
  sha256: string | null;
}

/**
 * `unreachable`: GitHub could not be reached or answered with an error.
 * `rejected`: the release was downloaded but did not check out against its signed manifest.
 * `downgrade`: the release checked out, but is older than one this process already verified and
 * still serves (someone marked an older release "latest").
 */
export type CheckErrorKind = "unreachable" | "rejected" | "downgrade";

/** What `/healthz` reports about the installer. */
export interface InstallerHealth {
  /**
   * - `ok`: the latest release checked out and is served.
   * - `stale`: the last check failed or found an older release; the last good copy is still served.
   * - `failing`: the last check failed and nothing verified is left to serve.
   * - `pending`: no check has finished yet.
   */
  state: "ok" | "stale" | "failing" | "pending";
  /** The verified copy `/install.sh` serves. */
  serving: { version: string; tag: string; sha256: string; verifiedAt: string } | null;
  lastCheck: {
    at: string;
    ok: boolean;
    /** The tag "latest" resolved to, when the check got that far. */
    tag: string | null;
    error: { kind: CheckErrorKind; message: string } | null;
  } | null;
}

export interface InstallerSource {
  get(now?: number): Promise<InstallerScript | null>;
  health(): InstallerHealth;
}

class CheckError extends Error {
  constructor(
    readonly kind: CheckErrorKind,
    message: string,
  ) {
    super(message);
  }
}

interface Verified {
  script: string;
  version: string;
  tag: string;
  sha256: string;
}

type Logger = Pick<Console, "log" | "error">;

const FETCH_TIMEOUT_MS = 5000;
const MAX_SCRIPT_BYTES = 1024 * 1024;
const MAX_MANIFEST_BYTES = 256 * 1024;
const MAX_SIGNATURE_BYTES = 4 * 1024;
/** A failed check is retried sooner than the cache period, but never on every request. */
const MAX_RETRY_MS = 30_000;
const USER_AGENT = "seylo-site-api";
/** Release tags as the app repo cuts them (v0.1.1, v1.2.0-rc.1). Nothing else goes into a URL. */
const TAG = /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
/** The newest manifest schema this reader knows; a higher one is a breaking change it must refuse. */
const MANIFEST_SCHEMA = 1;

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Serves the installer of the latest GitHub release, but only once it checks out against the
 * release's signed manifest. One check:
 *
 * 1. resolves "latest" to a tag, once (the redirect GitHub answers `<releases>/latest` with),
 * 2. downloads manifest.json, manifest.json.minisig and install.sh from that tag,
 * 3. verifies the manifest's minisign signature with the release key from brand.json,
 * 4. requires the manifest's version to be the tag's and sha256(install.sh) to be
 *    `manifest.installer.sha256`,
 * 5. refuses a version older (by semver) than the newest one this process verified before, so
 *    marking an older signed release "latest" on GitHub can't roll new installs back.
 *
 * Only then is the script cached and served. A check that fails for any reason keeps the last
 * good copy in service, is logged and shows in /healthz. With nothing verified at all, the local
 * file (a sibling checkout of the app repo, dev only) is served, or nothing.
 */
export function createInstallerSource(
  config: InstallerConfig,
  fetchImpl: typeof fetch = fetch,
  options: { log?: Logger } = {},
): InstallerSource {
  const log = options.log ?? console;
  const cacheMs = config.cacheSeconds * 1000;
  const retryMs = Math.min(cacheMs, MAX_RETRY_MS);
  const releasesUrl = config.releasesUrl.replace(/\/+$/, "");

  let good: (Verified & { verifiedAt: number }) | null = null;
  let lastCheck: { at: number; tag: string | null; error: CheckError | null } | null = null;
  /** The tag the running check resolved "latest" to, for the report of a check that fails later. */
  let checkingTag: string | null = null;
  let nextCheckAt = 0;
  let inflight: Promise<boolean> | null = null;

  async function request(url: string, maxBytes: number, redirect: RequestInit["redirect"]): Promise<Response> {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        redirect,
        headers: { "user-agent": USER_AGENT },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (error) {
      throw new CheckError("unreachable", `could not reach ${url}: ${message(error)}`);
    }
    if (Number(response.headers.get("content-length") ?? 0) > maxBytes) {
      await response.body?.cancel();
      throw new CheckError("rejected", `${url} is larger than the ${maxBytes} bytes allowed`);
    }
    return response;
  }

  /** A file of the release `tag`, refusing more than `maxBytes` even when the server sends no length. */
  async function fetchFile(tag: string, name: string, maxBytes: number): Promise<Uint8Array> {
    const url = `${releasesUrl}/download/${encodeURIComponent(tag)}/${name}`;
    const response = await request(url, maxBytes, "follow");
    if (!response.ok) {
      await response.body?.cancel();
      throw new CheckError("unreachable", `GitHub answered ${response.status} for ${url}`);
    }
    if (!response.body) return new Uint8Array();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for await (const chunk of response.body) {
        size += chunk.byteLength;
        if (size > maxBytes) throw new CheckError("rejected", `${url} is larger than the ${maxBytes} bytes allowed`);
        chunks.push(chunk);
      }
    } catch (error) {
      if (error instanceof CheckError) throw error;
      throw new CheckError("unreachable", `reading ${url} failed: ${message(error)}`);
    }
    return Buffer.concat(chunks);
  }

  /** "latest" -> the tag it points at right now. */
  async function resolveLatestTag(): Promise<string> {
    const url = `${releasesUrl}/latest`;
    const response = await request(url, MAX_MANIFEST_BYTES, "manual");
    await response.body?.cancel();
    const location = response.headers.get("location");
    if (response.status < 300 || response.status >= 400 || !location) {
      throw new CheckError(
        "unreachable",
        `GitHub answered ${response.status} for ${url} instead of a redirect to the latest release`,
      );
    }
    const match = /\/releases\/tag\/([^/?#]+)\/?$/.exec(new URL(location, url).pathname);
    let tag: string | null = null;
    try {
      tag = match?.[1] ? decodeURIComponent(match[1]) : null;
    } catch {
      // A malformed escape: no tag.
    }
    if (!tag || !TAG.test(tag))
      throw new CheckError("rejected", `the latest release redirects to ${location}, which names no release tag`);
    return tag;
  }

  async function check(): Promise<Verified> {
    const tag = await resolveLatestTag();
    checkingTag = tag;
    // Every file comes from that one tag, so a release published mid-check can't mix two releases' files.
    const [manifestBytes, signatureBytes, scriptBytes] = await Promise.all([
      fetchFile(tag, "manifest.json", MAX_MANIFEST_BYTES),
      fetchFile(tag, "manifest.json.minisig", MAX_SIGNATURE_BYTES),
      fetchFile(tag, "install.sh", MAX_SCRIPT_BYTES),
    ]);

    try {
      verifyMinisign(config.publicKey, manifestBytes, new TextDecoder().decode(signatureBytes));
    } catch (error) {
      throw new CheckError("rejected", `manifest.json of ${tag} is not signed by the release key (${message(error)})`);
    }

    let manifest: Record<string, unknown>;
    try {
      manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as Record<string, unknown>;
    } catch {
      throw new CheckError("rejected", `manifest.json of ${tag} is signed but is not valid JSON`);
    }
    if (typeof manifest.schema === "number" && manifest.schema > MANIFEST_SCHEMA) {
      throw new CheckError(
        "rejected",
        `manifest.json of ${tag} has schema ${manifest.schema}; this API reads up to ${MANIFEST_SCHEMA}`,
      );
    }
    const version = typeof manifest.version === "string" ? manifest.version.replace(/^v/, "") : null;
    if (!version || version !== tag.replace(/^v/, "")) {
      throw new CheckError("rejected", `the signed manifest under ${tag} is for version ${version ?? "(none)"}`);
    }
    // Releases are ordered by semver to refuse a rollback, so one that can't be ordered is not served.
    if (!parseSemver(version)) {
      throw new CheckError("rejected", `the signed manifest of ${tag} names ${version}, which is not a semver version`);
    }
    const installer = (manifest.installer ?? null) as { sha256?: unknown; size?: unknown } | null;
    const expected = typeof installer?.sha256 === "string" ? installer.sha256.toLowerCase() : null;
    if (!expected || !SHA256_HEX.test(expected)) {
      throw new CheckError("rejected", `the signed manifest of ${tag} has no installer sha256`);
    }

    const sha256 = createHash("sha256").update(scriptBytes).digest("hex");
    if (sha256 !== expected) {
      throw new CheckError(
        "rejected",
        `install.sh of ${tag} has sha256 ${sha256}, but the signed manifest says ${expected}`,
      );
    }
    if (typeof installer?.size === "number" && installer.size > 0 && installer.size !== scriptBytes.byteLength) {
      throw new CheckError(
        "rejected",
        `install.sh of ${tag} is ${scriptBytes.byteLength} bytes, but the signed manifest says ${installer.size}`,
      );
    }

    let script: string;
    try {
      script = new TextDecoder("utf-8", { fatal: true }).decode(scriptBytes);
    } catch {
      throw new CheckError("rejected", `install.sh of ${tag} is not UTF-8 text`);
    }
    // Signed or not, never pipe something that isn't a script into a shell.
    if (!script.startsWith("#!")) throw new CheckError("rejected", `install.sh of ${tag} does not start with #!`);
    return { script, version, tag, sha256 };
  }

  async function refresh(now: number): Promise<boolean> {
    checkingTag = null;
    try {
      const verified = await check();
      // `good` is the newest release this process has verified: an older one never replaces it.
      if (good && compareSemver(verified.version, good.version) < 0) {
        throw new CheckError(
          "downgrade",
          `${verified.tag} checks out against its signed manifest but is older than ${good.tag}, which this API already verified`,
        );
      }
      if (good?.sha256 !== verified.sha256) {
        log.log(
          `[installer] serving install.sh of ${verified.tag} (sha256 ${verified.sha256}), verified against its signed manifest`,
        );
      }
      good = { ...verified, verifiedAt: now };
      lastCheck = { at: now, tag: verified.tag, error: null };
      nextCheckAt = now + cacheMs;
      return true;
    } catch (thrown) {
      const error =
        thrown instanceof CheckError
          ? thrown
          : new CheckError("rejected", `checking the release failed: ${message(thrown)}`);
      lastCheck = { at: now, tag: checkingTag, error };
      nextCheckAt = now + retryMs;
      const still = good
        ? `Still serving ${good.tag}, verified ${new Date(good.verifiedAt).toISOString()}.`
        : "Nothing verified to serve: /install.sh answers 503.";
      if (error.kind === "downgrade") {
        log.error(
          `[installer] !!! REFUSED the latest release: ${error.message}. ${still} Check which release is marked latest on GitHub; to roll back on purpose, restart the API.`,
        );
      } else if (error.kind === "rejected") {
        log.error(
          `[installer] !!! REFUSED the latest release: ${error.message}. ${still} Check the release on GitHub.`,
        );
      } else {
        log.error(`[installer] release check failed: ${error.message}. ${still}`);
      }
      return false;
    }
  }

  async function readLocal(): Promise<string | null> {
    if (!config.localPath) return null;
    try {
      const file = Bun.file(config.localPath);
      return (await file.exists()) ? await file.text() : null;
    } catch {
      return null;
    }
  }

  const iso = (ms: number) => new Date(ms).toISOString();

  return {
    async get(now = Date.now()) {
      let fresh = false;
      if (inflight || now >= nextCheckAt) {
        // Concurrent requests share one check.
        inflight ??= refresh(now).finally(() => {
          inflight = null;
        });
        fresh = await inflight;
      }

      if (good)
        return { script: good.script, origin: fresh ? "release" : "cache", version: good.version, sha256: good.sha256 };
      const local = await readLocal();
      return local ? { script: local, origin: "local", version: null, sha256: null } : null;
    },

    health() {
      return {
        state: !lastCheck ? "pending" : !lastCheck.error ? "ok" : good ? "stale" : "failing",
        serving: good
          ? { version: good.version, tag: good.tag, sha256: good.sha256, verifiedAt: iso(good.verifiedAt) }
          : null,
        lastCheck: lastCheck
          ? {
              at: iso(lastCheck.at),
              ok: !lastCheck.error,
              tag: lastCheck.tag,
              error: lastCheck.error ? { kind: lastCheck.error.kind, message: lastCheck.error.message } : null,
            }
          : null,
      };
    },
  };
}
