import { randomBytes } from "node:crypto";
import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { GeoConfig } from "../config";
import { openGeoFile } from "./database";

/** What the updater keeps next to the database (`<dbPath>.json`): which month's file it is. */
export interface GeoFileInfo {
  /** "2026-11": DB-IP publishes City Lite once a month. */
  month: string;
  url: string;
  bytes: number;
  downloadedAt: string;
}

export type GeoUpdateResult =
  | { status: "current"; month: string }
  | { status: "updated"; month: string; bytes: number }
  | { status: "failed"; error: string };

type Logger = Pick<Console, "log" | "error">;

// The compressed file is about 60 MB and the database about 130 MB (2026); the caps leave room to
// grow and stop a broken or hostile download from filling the disk.
const MAX_COMPRESSED_BYTES = 512 * 1024 * 1024;
const MAX_DATABASE_BYTES = 2048 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;
const USER_AGENT = "seylo-site-api";

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** "2026-11" for a time in November 2026 (UTC); `back` months earlier with `back`. */
export function monthOf(now: Date, back = 0): string {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The month of the database at `dbPath`, from the file the updater wrote next to it; null when unknown. */
export async function readGeoFileInfo(dbPath: string): Promise<GeoFileInfo | null> {
  try {
    const info = JSON.parse(await readFile(`${dbPath}.json`, "utf8")) as Partial<GeoFileInfo>;
    return typeof info.month === "string" && /^\d{4}-\d{2}$/.test(info.month) ? (info as GeoFileInfo) : null;
  } catch {
    return null;
  }
}

/** Counts the bytes going through and fails the stream past `max`. */
function capped(max: number, what: string) {
  let seen = 0;
  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      seen += chunk.byteLength;
      if (seen > max) controller.error(new Error(`${what} is larger than the ${max} bytes allowed`));
      else controller.enqueue(chunk);
    },
  });
}

/**
 * Brings the database at `config.dbPath` to the newest DB-IP City Lite file: this month's, or last
 * month's while this month's is not out yet (DB-IP publishes at the start of the month). A file
 * that is already the newest is not downloaded again.
 *
 * The download is unpacked next to the database, opened and checked (an IPv6 city database), and
 * only then renamed over it, with `<dbPath>.json` saying which month it is. Anything that fails
 * (DB-IP unreachable, a bad file, a full disk) leaves the database that was there untouched.
 */
export async function updateGeoDatabase(
  config: Pick<GeoConfig, "dbPath" | "downloadUrl">,
  options: { fetch?: typeof fetch; now?: Date; log?: Logger } = {},
): Promise<GeoUpdateResult> {
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? new Date();
  const log = options.log ?? console;
  const have = (await readGeoFileInfo(config.dbPath))?.month ?? null;
  const tried: string[] = [];

  try {
    for (const month of [monthOf(now), monthOf(now, 1)]) {
      // The newest file that exists is the one already here.
      if (month === have) return { status: "current", month };
      const url = config.downloadUrl.replace("{month}", month);
      let response: Response;
      try {
        response = await fetchImpl(url, {
          headers: { "user-agent": USER_AGENT },
          signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
        });
      } catch (error) {
        throw new Error(`could not reach ${url}: ${message(error)}`);
      }
      if (response.status === 404) {
        await response.body?.cancel();
        tried.push(`${month} (404)`);
        continue;
      }
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        throw new Error(`${url} answered ${response.status}`);
      }
      const bytes = await install(response.body, config.dbPath, url);
      const info: GeoFileInfo = { month, url, bytes, downloadedAt: now.toISOString() };
      await writeFile(`${config.dbPath}.json`, `${JSON.stringify(info, null, 2)}\n`);
      log.log(`[geo] installed DB-IP City Lite ${month} (${bytes} bytes) at ${config.dbPath}`);
      return { status: "updated", month, bytes };
    }
    throw new Error(`DB-IP has no City Lite file for ${tried.join(" or ")}`);
  } catch (error) {
    const kept = have ? `Keeping the ${have} database.` : "There is no database: GET /geo answers 503.";
    log.error(`[geo] updating the database failed: ${message(error)}. ${kept}`);
    return { status: "failed", error: message(error) };
  }
}

/** Unpacks the .mmdb.gz body next to `dbPath`, checks it opens, and renames it into place. Returns its size. */
async function install(body: ReadableStream<Uint8Array>, dbPath: string, url: string): Promise<number> {
  await mkdir(dirname(dbPath), { recursive: true });
  const temp = `${dbPath}.download-${randomBytes(6).toString("hex")}`;
  try {
    const file = await open(temp, "w");
    let bytes = 0;
    try {
      const unpacked = body
        .pipeThrough(capped(MAX_COMPRESSED_BYTES, url))
        .pipeThrough(new DecompressionStream("gzip"))
        .pipeThrough(capped(MAX_DATABASE_BYTES, `the database in ${url}`));
      for await (const chunk of unpacked) {
        await file.write(chunk);
        bytes += chunk.byteLength;
      }
      await file.sync();
    } finally {
      await file.close();
    }
    try {
      openGeoFile(temp);
    } catch (error) {
      throw new Error(`${url} is not a usable database: ${message(error)}`);
    }
    await rename(temp, dbPath);
    return bytes;
  } finally {
    await rm(temp, { force: true });
  }
}

// `bun src/geo/update.ts`: one update now, for the Docker build and by hand. Exits 1 when it fails.
if (import.meta.main) {
  const { loadConfig } = await import("../config");
  const result = await updateGeoDatabase(loadConfig().geo);
  if (result.status === "current") console.log(`[geo] the ${result.month} database is the newest`);
  process.exit(result.status === "failed" ? 1 : 0);
}
