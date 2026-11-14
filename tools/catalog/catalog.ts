// The template catalog, read the way the panel reads it. Seylo-dev/Templates publishes one signed
// catalog.json (format 1, defined in the App repo's apps/panel/src/modules/templates/catalog-file.ts);
// this file checks one and turns it into what the landing and the docs show. sync.ts downloads and writes.

import { createHash, createPublicKey, verify } from "node:crypto";

export const catalogFormat = 1;
/** The panel's slug rule (check-templates.ts). Slugs become file paths here, so nothing else gets through. */
export const slugPattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
export const logoFiles = ["logo.svg", "logo.webp", "logo.png"] as const;
export type LogoFile = (typeof logoFiles)[number];

/** A catalog that must not be used: bad signature, wrong format or source, a file that fails its hash. */
export class CatalogError extends Error {
  override name = "CatalogError";
}

export interface CatalogTemplate {
  slug: string;
  name: string;
  description: string;
  category: string;
  creates: string;
  logo: { file: LogoFile; bytes: Uint8Array; sha256: string } | null;
}

export interface Catalog {
  source: string;
  commit: string;
  sequence: number;
  generatedAt: string;
  notice: string;
  licenses: Record<string, string>;
  templates: CatalogTemplate[];
  /** Templates or logos left out, one line each ("templates/<slug>/logo.svg: ..."). */
  warnings: string[];
}

const sha256Hex = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown, fallback: string) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;

/** A minisign public key ("RW..." base64: "Ed", 8-byte key id, 32-byte Ed25519 key). A placeholder is not one. */
export function isMinisignPublicKey(value: string): boolean {
  const pk = Buffer.from(value.trim(), "base64");
  return pk.length === 42 && pk.subarray(0, 2).toString() === "Ed" && pk.toString("base64") === value.trim();
}

/**
 * Checks a minisign signature (prehashed "ED", as minisign makes them, or legacy "Ed") and its trusted
 * comment, the same check as the panel's crypto/minisign.ts. Returns the trusted comment.
 */
export function verifyMinisign(publicKey: string, message: Uint8Array, signatureFile: string): string {
  if (!isMinisignPublicKey(publicKey)) throw new CatalogError("The catalog signing key is malformed.");
  const pk = Buffer.from(publicKey.trim(), "base64");
  const [, sigLine, trustedLine, globalLine] = signatureFile.trim().split(/\r?\n/);
  if (!sigLine || !trustedLine?.startsWith("trusted comment: ") || !globalLine)
    throw new CatalogError("The catalog signature is malformed.");
  const sig = Buffer.from(sigLine, "base64");
  if (sig.length !== 74) throw new CatalogError("The catalog signature is malformed.");
  if (!sig.subarray(2, 10).equals(pk.subarray(2, 10)))
    throw new CatalogError("The catalog was signed with a different key.");
  const key = createPublicKey({
    key: { kty: "OKP", crv: "Ed25519", x: pk.subarray(10).toString("base64url") },
    format: "jwk",
  });
  const algorithm = sig.subarray(0, 2).toString();
  const signed =
    algorithm === "ED"
      ? createHash("blake2b512").update(message).digest()
      : algorithm === "Ed"
        ? Buffer.from(message)
        : null;
  if (!signed) throw new CatalogError("The catalog signature uses an unknown algorithm.");
  if (!verify(null, signed, key, sig.subarray(10))) throw new CatalogError("The catalog signature does not match.");
  const trusted = trustedLine.slice("trusted comment: ".length);
  if (!verify(null, Buffer.concat([sig.subarray(10), Buffer.from(trusted)]), key, Buffer.from(globalLine, "base64")))
    throw new CatalogError("The catalog signature's trusted comment does not match.");
  return trusted;
}

/**
 * Why a logo is not shown, or null when it is fine: the panel's rules (size, real SVG/WebP/PNG, nothing
 * active or remote in an SVG). The site serves these files from its own origin, where an SVG opened
 * directly is a document, so a logo that breaks them is left out even from a signed catalog.
 */
export function logoProblem(file: LogoFile, bytes: Uint8Array): string | null {
  const limit = file === "logo.svg" ? 50_000 : 30_000;
  if (bytes.byteLength > limit) return `${bytes.byteLength} bytes, over ${limit}`;
  const head = Buffer.from(bytes.subarray(0, 12));
  if (file === "logo.svg") {
    const svg = new TextDecoder().decode(bytes);
    if (!svg.includes("<svg") || bytes.includes(0)) return "not an SVG";
    if (
      /<script|<foreignObject|<image|\son[a-z]+\s*=|(?:href|src)\s*=\s*["']?(?:https?:|data:|javascript:|\/\/)/i.test(
        svg,
      )
    )
      return "has a script, an event handler, a foreignObject, an embedded image or an external link";
    return null;
  }
  if (file === "logo.webp")
    return head.subarray(0, 4).toString("latin1") === "RIFF" && head.subarray(8, 12).toString("latin1") === "WEBP"
      ? null
      : "not a WebP file";
  return head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    ? null
    : "not a PNG file";
}

/**
 * Reads a catalog.json. Refuses the whole file (CatalogError) when it is not one to use: not JSON,
 * another format, no source, commit, sequence or time, a duplicate slug or a file whose sha256 does not
 * match. A template with a slug that is not a safe name is left out alone, and so is a logo that breaks
 * logoProblem (the template keeps its letter tile); both are listed in `warnings`.
 */
export function parseCatalog(bytes: Uint8Array): Catalog {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new CatalogError("The catalog is not valid JSON.");
  }
  if (!isRecord(value)) throw new CatalogError("The catalog is not a JSON object.");
  if (value.format !== catalogFormat)
    throw new CatalogError(
      `The catalog has format ${JSON.stringify(value.format ?? null)}; this site reads format ${catalogFormat}.`,
    );
  if (typeof value.source !== "string" || value.source === "") throw new CatalogError("The catalog names no source.");
  if (typeof value.commit !== "string" || !/^[0-9a-f]{7,64}$/.test(value.commit))
    throw new CatalogError("The catalog names no commit.");
  if (typeof value.sequence !== "number" || !Number.isSafeInteger(value.sequence) || value.sequence < 0)
    throw new CatalogError("The catalog has no valid sequence number.");
  if (typeof value.generatedAt !== "string" || Number.isNaN(Date.parse(value.generatedAt)))
    throw new CatalogError("The catalog has no valid generatedAt time.");
  if (!Array.isArray(value.templates)) throw new CatalogError("The catalog has no templates list.");

  const licenses: Record<string, string> = {};
  if (isRecord(value.licenses))
    for (const [name, body] of Object.entries(value.licenses)) {
      if (!/^LICENSE\.[A-Za-z0-9._-]+$/.test(name) || name.includes(".."))
        throw new CatalogError(`The catalog names a license file ${JSON.stringify(name)}.`);
      if (typeof body === "string") licenses[name] = body;
    }

  const warnings: string[] = [];
  const seen = new Set<string>();
  const templates: CatalogTemplate[] = [];
  for (const [index, raw] of value.templates.entries()) {
    if (!isRecord(raw) || typeof raw.slug !== "string" || raw.slug === "")
      throw new CatalogError(`Template ${index + 1} of the catalog has no slug.`);
    const slug = raw.slug;
    if (seen.has(slug.toLowerCase())) throw new CatalogError(`The catalog lists ${slug} twice.`);
    seen.add(slug.toLowerCase());
    if (!isRecord(raw.files)) throw new CatalogError(`templates/${slug} in the catalog has no files.`);
    const files = new Map<string, { bytes: Uint8Array; sha256: string }>();
    for (const [name, file] of Object.entries(raw.files)) {
      if (!isRecord(file) || typeof file.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(file.sha256))
        throw new CatalogError(`templates/${slug}/${name} in the catalog has no valid sha256.`);
      let content: Uint8Array;
      if (typeof file.text === "string") content = new TextEncoder().encode(file.text);
      else if (typeof file.base64 === "string" && /^[A-Za-z0-9+/]*={0,2}$/.test(file.base64))
        content = new Uint8Array(Buffer.from(file.base64, "base64"));
      else throw new CatalogError(`templates/${slug}/${name} in the catalog has no content.`);
      if (sha256Hex(content) !== file.sha256)
        throw new CatalogError(`templates/${slug}/${name} does not match its sha256.`);
      files.set(name, { bytes: content, sha256: file.sha256 });
    }
    if (!slugPattern.test(slug) || slug.length > 60) {
      warnings.push(`templates/${slug}: left out, not a valid template name`);
      continue;
    }
    let logo: CatalogTemplate["logo"] = null;
    const logoFile = logoFiles.find((f) => files.has(f));
    if (logoFile) {
      const { bytes: logoBytes, sha256 } = files.get(logoFile) as { bytes: Uint8Array; sha256: string };
      const problem = logoProblem(logoFile, logoBytes);
      if (problem) warnings.push(`templates/${slug}/${logoFile}: left out, ${problem}`);
      else logo = { file: logoFile, bytes: logoBytes, sha256 };
    }
    templates.push({
      slug,
      name: text(raw.name, slug),
      description: text(raw.description, ""),
      category: text(raw.category, "Other"),
      creates: text(raw.creates, ""),
      logo,
    });
  }
  return {
    source: value.source,
    commit: value.commit,
    sequence: value.sequence,
    generatedAt: value.generatedAt,
    notice: typeof value.notice === "string" ? value.notice : "",
    licenses,
    templates,
    warnings,
  };
}

// ---- What the site shows ----------------------------------------------------------------------------

// The letter tile for templates without a logo: initials of the name on a color picked from the slug,
// as the panel drew every template before it had logos.
const tiles = [
  "#2563EB",
  "#7C3AED",
  "#DB2777",
  "#DC2626",
  "#EA580C",
  "#CA8A04",
  "#16A34A",
  "#0D9488",
  "#0891B2",
  "#4F46E5",
  "#9333EA",
  "#475569",
];

export function initials(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/[\s-]+/)
    .filter(Boolean);
  const letters =
    words.length >= 2
      ? `${[...(words[0] ?? "")][0] ?? ""}${[...(words[1] ?? "")][0] ?? ""}`
      : [...(words[0] ?? "?")].slice(0, 2).join("");
  return (letters || "?").toUpperCase();
}

export function tileColor(slug: string): string {
  const index = createHash("sha256").update(slug).digest()[0] ?? 0;
  return tiles[index % tiles.length] as string;
}

/** One template as the landing lists it. */
export interface SiteTemplate {
  slug: string;
  name: string;
  category: string;
  creates: string;
  monogram: string;
  color: string;
  /** Its logo on the landing ("/templates/<slug>/logo.svg"), or null for the letter tile. */
  logo: string | null;
}

/** apps/landing/lib/templates.generated.json: where the list came from, and the templates by name. */
export interface SiteCatalog {
  source: string;
  commit: string;
  sequence: number;
  generatedAt: string;
  templates: SiteTemplate[];
}

/** The landing's data, in the order the panel's Templates page lists them (by name). */
export function siteCatalog(catalog: Catalog): SiteCatalog {
  return {
    source: catalog.source,
    commit: catalog.commit,
    sequence: catalog.sequence,
    generatedAt: catalog.generatedAt,
    templates: catalog.templates
      .map((t) => ({
        slug: t.slug,
        name: t.name,
        category: t.category,
        creates: t.creates,
        monogram: initials(t.name),
        color: tileColor(t.slug),
        logo: t.logo ? `/templates/${t.slug}/${t.logo.file}` : null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }) || a.slug.localeCompare(b.slug)),
  };
}

/** Text for an MDX table cell: no markup, no JSX, no expressions, no line breaks. */
export function mdxText(value: string): string {
  return value.replace(/\s+/g, " ").replace(/[\\`*_[\]{}<>|#&!~]/g, (c) => `\\${c}`);
}

/**
 * apps/docs/content/generated/templates-catalog.mdx, which the Templates guide includes: the number of
 * templates and a table of them. Plain Markdown, so search and the Markdown copies of the page have it.
 */
export function docsSnippet(site: SiteCatalog): string {
  const count = site.templates.length;
  const categories = new Set(site.templates.map((t) => t.category)).size;
  const rows = site.templates.map((t) => `| ${mdxText(t.name)} | ${mdxText(t.category)} | ${mdxText(t.creates)} |`);
  // No "generated" comment in it: the Markdown copies of the page would show it. The folder name says it.
  return [
    `The official catalog has ${count} ${count === 1 ? "template" : "templates"} in ${categories} ${
      categories === 1 ? "category" : "categories"
    }:`,
    "",
    "| Template | Category | Creates |",
    "| --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

/** apps/landing/public/templates/NOTICE: the catalog's credits for the logo files next to it. */
export function noticeFile(catalog: Catalog): string {
  const notice = catalog.notice.trim();
  return [
    "Template logos on the Seylo website",
    "",
    `The files in this folder are the logos of the Seylo template catalog (${catalog.source}, commit`,
    `${catalog.commit}), at the same paths as in that repository: templates/<slug>/logo.<ext>.`,
    "The catalog's NOTICE, which credits each of them, follows.",
    "",
    "----",
    "",
    ...(notice ? [notice] : ["(The catalog has no NOTICE.)"]),
    "",
  ].join("\n");
}
