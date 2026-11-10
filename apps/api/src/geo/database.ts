import { randomBytes } from "node:crypto";
import { constants, copyFileSync, rmSync } from "node:fs";
import { type CityResponse, Reader } from "mmdb-lib";

/** What GET /geo answers for an address; null where the database knows nothing. */
export interface GeoLocation {
  city: string | null;
  region: string | null;
  country: string | null;
  /** ISO 3166-1 alpha-2, for example "DE". */
  countryCode: string | null;
}

/** DB-IP's license (CC BY 4.0) asks for this next to every answer and on every page that shows one. */
export const GEO_ATTRIBUTION = "Geolocation by DB-IP (https://db-ip.com)";

export interface GeoDatabase {
  /** `address` as checkAddress() returns it. Unknown addresses answer all nulls. */
  lookup(address: string): GeoLocation;
  /** When DB-IP built the file (the metadata's build_epoch). */
  builtAt: Date;
}

const nothing: GeoLocation = { city: null, region: null, country: null, countryCode: null };

/** A name from the database: trimmed text of a sane length, else null. */
function name(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 && text.length <= 200 ? text : null;
}

/** DB-IP's City Lite record (GeoIP2 City layout) as a GeoLocation; "ZZ" is DB-IP's "no country". */
export function toLocation(record: CityResponse | null): GeoLocation {
  if (!record) return nothing;
  const iso = name(record.country?.iso_code);
  const countryCode = iso && /^[A-Z]{2}$/.test(iso) && iso !== "ZZ" ? iso : null;
  return {
    city: name(record.city?.names?.en),
    region: name(record.subdivisions?.[0]?.names?.en),
    country: countryCode ? name(record.country?.names?.en) : null,
    countryCode,
  };
}

/**
 * A MaxMind-format database over `bytes`, refused unless it is an IPv6 city database (DB-IP's
 * City Lite holds IPv4 and IPv6). Throws with the reason.
 */
export function openGeoDatabase(bytes: Buffer): GeoDatabase {
  const reader = new Reader<CityResponse>(bytes);
  const { metadata } = reader;
  if (metadata.binaryFormatMajorVersion !== 2)
    throw new Error(`MaxMind DB format ${metadata.binaryFormatMajorVersion}, not 2`);
  if (metadata.ipVersion !== 6) throw new Error("an IPv4-only database");
  if (!/city/i.test(metadata.databaseType ?? ""))
    throw new Error(`a ${metadata.databaseType} database, not a city one`);
  if (!(metadata.nodeCount > 0)) throw new Error("an empty database");
  return {
    builtAt: metadata.buildEpoch,
    lookup: (address) => toLocation(reader.get(address)),
  };
}

/**
 * Opens the file at `path` memory-mapped: the City Lite file is over 100 MB, and a mapping keeps it
 * out of the heap. A mapped file cut short under the process kills it (SIGBUS), so what gets mapped
 * is a private copy, deleted right away (its blocks stay until the mapping is released): whatever
 * happens to `path` later, a rename or a `cp` over it, never touches what is being read.
 */
export function openGeoFile(path: string): GeoDatabase {
  const copy = `${path}.open-${randomBytes(6).toString("hex")}`;
  copyFileSync(path, copy, constants.COPYFILE_FICLONE);
  try {
    const mapped = Bun.mmap(copy, { shared: false });
    return openGeoDatabase(Buffer.from(mapped.buffer, mapped.byteOffset, mapped.byteLength));
  } finally {
    rmSync(copy, { force: true });
  }
}
