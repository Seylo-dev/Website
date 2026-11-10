// A tiny MaxMind DB writer, so the geo tests build their own database instead of downloading
// DB-IP's. It writes the subset of the format (https://maxmind.github.io/MaxMind-DB/) a city
// database needs: an IPv6 search tree with 24-bit records, and strings, unsigned integers,
// doubles, booleans, maps and arrays in the data section.

import { parseIp } from "../src/client-ip";

export type MmdbValue = string | number | boolean | MmdbValue[] | { [key: string]: MmdbValue };

const TYPE = { string: 2, double: 3, uint32: 6, map: 7, array: 11, boolean: 14 } as const;
const METADATA_MARKER = Buffer.from("abcdef4d61784d696e642e636f6d", "hex");

/** Control byte(s): the type and the size (extended types and long sizes take extra bytes). */
function header(type: number, size: number): number[] {
  let sizeBits: number;
  const extra: number[] = [];
  if (size < 29) sizeBits = size;
  else if (size < 29 + 256) {
    sizeBits = 29;
    extra.push(size - 29);
  } else if (size < 285 + 65_536) {
    sizeBits = 30;
    extra.push((size - 285) >> 8, (size - 285) & 0xff);
  } else {
    sizeBits = 31;
    const rest = size - 65_821;
    extra.push((rest >> 16) & 0xff, (rest >> 8) & 0xff, rest & 0xff);
  }
  const lead = type <= 7 ? [(type << 5) | sizeBits] : [sizeBits, type - 7];
  return [...lead, ...extra];
}

export function encode(value: MmdbValue): Buffer {
  if (typeof value === "string") {
    const bytes = Buffer.from(value, "utf8");
    return Buffer.concat([Buffer.from(header(TYPE.string, bytes.length)), bytes]);
  }
  if (typeof value === "boolean") return Buffer.from(header(TYPE.boolean, value ? 1 : 0));
  if (typeof value === "number") {
    if (Number.isInteger(value) && value >= 0 && value < 2 ** 32) {
      const bytes: number[] = [];
      for (let rest = value; rest > 0; rest = Math.floor(rest / 256)) bytes.unshift(rest % 256);
      return Buffer.from([...header(TYPE.uint32, bytes.length), ...bytes]);
    }
    const bytes = Buffer.alloc(8);
    bytes.writeDoubleBE(value);
    return Buffer.concat([Buffer.from(header(TYPE.double, 8)), bytes]);
  }
  if (Array.isArray(value)) {
    return Buffer.concat([Buffer.from(header(TYPE.array, value.length)), ...value.map(encode)]);
  }
  const entries = Object.entries(value);
  return Buffer.concat([
    Buffer.from(header(TYPE.map, entries.length)),
    ...entries.flatMap(([key, item]) => [encode(key), encode(item)]),
  ]);
}

type Record = { node: number } | { data: number } | null;

/**
 * A database holding `networks` ("203.0.113.0/24" or "2001:db8::/32" with their record). IPv4
 * networks go under ::/96, where readers look IPv4 addresses up in an IPv6 database.
 */
export function buildMmdb(
  networks: Array<[string, MmdbValue]>,
  options: { databaseType?: string; ipVersion?: number; buildEpoch?: number } = {},
): Buffer {
  const nodes: Array<[Record, Record]> = [[null, null]];
  const data: Buffer[] = [];
  let dataSize = 0;

  for (const [cidr, value] of networks) {
    const [text, prefix] = cidr.split("/");
    const address = parseIp(text ?? "");
    if (!address) throw new Error(`bad network ${cidr}`);
    const bytes = address.length === 4 ? [...new Array<number>(12).fill(0), ...address] : address;
    const bits = Number(prefix) + (address.length === 4 ? 96 : 0);
    const encoded = encode(value);
    const offset = dataSize;
    data.push(encoded);
    dataSize += encoded.length;

    let node = 0;
    for (let depth = 0; depth < bits; depth++) {
      const bit = (bytes[depth >> 3]! >> (7 - (depth & 7))) & 1;
      const pair = nodes[node]!;
      if (depth === bits - 1) {
        pair[bit] = { data: offset };
        break;
      }
      const next = pair[bit];
      if (next && "node" in next) {
        node = next.node;
      } else {
        nodes.push([null, null]);
        pair[bit] = { node: nodes.length - 1 };
        node = nodes.length - 1;
      }
    }
  }

  const nodeCount = nodes.length;
  const value = (record: Record) =>
    !record ? nodeCount : "node" in record ? record.node : nodeCount + 16 + record.data;
  const tree = Buffer.alloc(nodeCount * 6);
  nodes.forEach(([left, right], i) => {
    tree.writeUIntBE(value(left), i * 6, 3);
    tree.writeUIntBE(value(right), i * 6 + 3, 3);
  });

  const metadata = encode({
    binary_format_major_version: 2,
    binary_format_minor_version: 0,
    build_epoch: options.buildEpoch ?? 1_793_491_200,
    database_type: options.databaseType ?? "DBIP-City-Lite",
    description: { en: "test database" },
    ip_version: options.ipVersion ?? 6,
    languages: ["en"],
    node_count: nodeCount,
    record_size: 24,
  });
  return Buffer.concat([tree, Buffer.alloc(16), ...data, METADATA_MARKER, metadata]);
}

/** Records shaped like DB-IP City Lite's (the GeoIP2 City layout). */
export function cityRecord(city: string | null, region: string | null, country: string, iso: string): MmdbValue {
  return {
    ...(city ? { city: { names: { en: city } } } : {}),
    continent: { code: "EU", geoname_id: 6255148, names: { en: "Europe" } },
    country: { geoname_id: 2921044, is_in_european_union: true, iso_code: iso, names: { en: country, de: country } },
    location: { latitude: 50.4779, longitude: 12.3713 },
    ...(region ? { subdivisions: [{ names: { en: region } }] } : {}),
  };
}

/** A fixture with a few public networks in both families. */
export function fixtureDatabase(options: { databaseType?: string; ipVersion?: number } = {}): Buffer {
  return buildMmdb(
    [
      ["88.198.0.0/16", cityRecord("Falkenstein", "Saxony", "Germany", "DE")],
      ["2a01:4f8::/32", cityRecord("Falkenstein", "Saxony", "Germany", "DE")],
      ["3.80.0.0/12", cityRecord("Ashburn", "Virginia", "United States", "US")],
      ["5.29.0.0/16", cityRecord(null, null, "Israel", "IL")],
      ["45.0.0.0/8", cityRecord(null, null, "Unknown", "ZZ")],
    ],
    options,
  );
}
