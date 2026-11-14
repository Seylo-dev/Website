// Writes the site's copy of the template catalog from the signed catalog Seylo-dev/Templates publishes.
// The landing and the docs run it before every build (prebuild, with --soft); see README.md.
//
//   bun tools/catalog/sync.ts                 download, verify, write; fails on any problem
//   bun tools/catalog/sync.ts --soft          the same, but a catalog it cannot get or trust keeps the
//                                             committed copy and exits 0 (builds never fail on it)
//   bun tools/catalog/sync.ts --local <catalog.json> [--signature <catalog.json.minisig>]
//                                             a local file, such as the App repo's templates/catalog.json
//
// It downloads catalog.json and catalog.json.minisig from the Templates repo's "catalog" release,
// verifies the signature with brand.json's templatesMinisignPublicKey (the release key: the catalog is
// signed with the same key as Seylo releases), checks the format, the source, every file's sha256 and
// that the catalog is not older than the committed copy, then writes:
//
//   apps/landing/lib/templates.generated.json        the landing's template list
//   apps/landing/public/templates/<slug>/logo.<ext>  the logos, with NOTICE and LICENSE.* from the catalog
//   apps/docs/content/generated/templates-catalog.mdx  the count and table the Templates guide includes
//
// Before the catalog is published the download answers 404, and --soft keeps the committed copy.
// Only a brand.json key that is not a minisign key (a placeholder) skips the signature: downloads are
// refused and only --local works, unsigned.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import brand from "../../brand/brand.json";
import {
  type Catalog,
  CatalogError,
  docsSnippet,
  isMinisignPublicKey,
  noticeFile,
  parseCatalog,
  siteCatalog,
  verifyMinisign,
} from "./catalog";

export const repoRoot = resolve(import.meta.dir, "../..");
export const officialUrl = `https://github.com/${brand.github.templatesRepo}/releases/download/catalog/catalog.json`;

/** Where the outputs go, relative to the repo root. */
export const outputs = {
  landing: "apps/landing/lib/templates.generated.json",
  logos: "apps/landing/public/templates",
  docs: "apps/docs/content/generated/templates-catalog.mdx",
} as const;

const maxBytes = 20 * 1024 * 1024;
const timeoutMs = 15_000;

export interface SyncOptions {
  /** The repo root the outputs are written under. */
  root: string;
  /** catalog.json's URL; the signature is the same URL with .minisig. */
  url: string;
  /** The catalog key (brand.json templatesMinisignPublicKey); a placeholder means none. */
  publicKey: string;
  /** The source a catalog must name (brand.json github.templatesRepo). */
  source: string;
  /** A local catalog instead of a download. */
  local?: { catalog: string; signature?: string } | undefined;
  /** A catalog it cannot get or trust keeps the committed copy instead of failing. */
  soft?: boolean;
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
  log?: (line: string) => void;
}

export type SyncResult =
  | { written: true; sequence: number; commit: string; count: number; unsigned: boolean }
  | { written: false; reason: string };

async function download(url: string, get: NonNullable<SyncOptions["fetch"]>): Promise<Uint8Array> {
  let response: Response;
  try {
    response = await get(url, { signal: AbortSignal.timeout(timeoutMs), redirect: "follow" });
  } catch (error) {
    throw new CatalogError(`Could not reach ${url}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) throw new CatalogError(`${url} answered ${response.status}.`);
  if (response.url && !response.url.startsWith("https://"))
    throw new CatalogError(`${url} redirected to ${response.url}.`);
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > maxBytes) throw new CatalogError(`${url} is over ${maxBytes} bytes.`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new CatalogError(`${url} is over ${maxBytes} bytes.`);
  return bytes;
}

/** The sequence of the committed copy, or null when there is none (or it cannot be read). */
export function committedSequence(root: string): number | null {
  try {
    const value = JSON.parse(readFileSync(join(root, outputs.landing), "utf8")) as { sequence?: unknown };
    return typeof value.sequence === "number" ? value.sequence : null;
  } catch {
    return null;
  }
}

/** Gets and checks a catalog. Throws CatalogError for one that must not be used. */
async function obtain(options: SyncOptions): Promise<{ catalog: Catalog; unsigned: boolean }> {
  const keyed = isMinisignPublicKey(options.publicKey);
  let bytes: Uint8Array;
  let signature: string | null;
  if (options.local) {
    bytes = new Uint8Array(readFileSync(options.local.catalog));
    const sigPath = options.local.signature ?? `${options.local.catalog}.minisig`;
    signature = existsSync(sigPath) ? readFileSync(sigPath, "utf8") : null;
  } else {
    if (!keyed)
      throw new CatalogError(
        "brand.json templatesMinisignPublicKey is not a minisign key, so no download can be verified.",
      );
    const get = options.fetch ?? fetch;
    bytes = await download(options.url, get);
    signature = new TextDecoder().decode(await download(`${options.url}.minisig`, get));
  }
  if (keyed) {
    if (signature === null) throw new CatalogError("The catalog has no signature (catalog.json.minisig).");
    verifyMinisign(options.publicKey, bytes, signature);
  }
  const catalog = parseCatalog(bytes);
  if (catalog.source !== options.source)
    throw new CatalogError(`The catalog is from ${catalog.source}, not ${options.source}.`);
  const floor = committedSequence(options.root);
  if (floor !== null && catalog.sequence < floor)
    throw new CatalogError(
      `The catalog (sequence ${catalog.sequence}) is older than the committed copy (sequence ${floor}).`,
    );
  return { catalog, unsigned: !keyed };
}

function writeAtomic(path: string, content: string | Uint8Array) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, content);
  renameSync(tmp, path);
}

/** Writes the landing's list, its logos and credits, and the docs' table. */
export function writeOutputs(root: string, catalog: Catalog) {
  const site = siteCatalog(catalog);
  // The logo folder is the catalog's alone: build it next to the app, then swap it in whole, so a logo
  // the catalog dropped is gone and a half-written folder is never served.
  const logos = join(root, outputs.logos);
  mkdirSync(dirname(logos), { recursive: true });
  const stage = mkdtempSync(join(dirname(dirname(logos)), ".catalog-"));
  try {
    for (const t of catalog.templates) {
      if (!t.logo) continue;
      mkdirSync(join(stage, t.slug), { recursive: true });
      writeFileSync(join(stage, t.slug, t.logo.file), t.logo.bytes);
    }
    writeFileSync(join(stage, "NOTICE"), noticeFile(catalog));
    for (const [name, body] of Object.entries(catalog.licenses)) writeFileSync(join(stage, name), body);
    rmSync(logos, { recursive: true, force: true });
    renameSync(stage, logos);
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
  writeAtomic(join(root, outputs.landing), `${JSON.stringify(site, null, 2)}\n`);
  writeAtomic(join(root, outputs.docs), docsSnippet(site));
  return site;
}

export async function sync(options: SyncOptions): Promise<SyncResult> {
  const log = options.log ?? ((line: string) => console.log(line));
  let got: { catalog: Catalog; unsigned: boolean };
  try {
    got = await obtain(options);
  } catch (error) {
    if (!(error instanceof CatalogError) || !options.soft) throw error;
    log(`catalog: kept the committed copy. ${error.message}`);
    return { written: false, reason: error.message };
  }
  const { catalog, unsigned } = got;
  for (const warning of catalog.warnings) log(`catalog: warning: ${warning}`);
  if (unsigned) log("catalog: warning: brand.json has no catalog key; this copy is not verified");
  const site = writeOutputs(options.root, catalog);
  log(
    `catalog: ${site.templates.length} templates, sequence ${catalog.sequence} (commit ${catalog.commit.slice(0, 12)}${
      unsigned ? ", unsigned" : ""
    })`,
  );
  return { written: true, sequence: catalog.sequence, commit: catalog.commit, count: site.templates.length, unsigned };
}

const usage = "usage: bun tools/catalog/sync.ts [--soft] | --local <catalog.json> [--signature <catalog.json.minisig>]";

export function parseArgs(args: string[]): { soft: boolean; local?: { catalog: string; signature?: string } } {
  let soft = false;
  let catalog: string | undefined;
  let signature: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--soft") soft = true;
    else if (arg === "--local" && args[i + 1]) catalog = args[++i];
    else if (arg === "--signature" && args[i + 1]) signature = args[++i];
    else throw new Error(usage);
  }
  if (signature && !catalog) throw new Error(usage);
  if (soft && catalog) throw new Error(usage);
  if (!catalog) return { soft };
  return { soft, local: signature ? { catalog, signature } : { catalog } };
}

if (import.meta.main) {
  let args: ReturnType<typeof parseArgs>;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error((error as Error).message);
    process.exit(2);
  }
  try {
    await sync({
      root: repoRoot,
      url: officialUrl,
      publicKey: brand.templatesMinisignPublicKey,
      source: brand.github.templatesRepo,
      soft: args.soft,
      local: args.local && {
        catalog: resolve(args.local.catalog),
        ...(args.local.signature ? { signature: resolve(args.local.signature) } : {}),
      },
    });
  } catch (error) {
    console.error(`catalog: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
