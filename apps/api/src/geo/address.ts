import { type Address, inRange, parseIp, parseRange } from "../client-ip";

/**
 * Addresses no server is reached at, from IANA's special-purpose registries
 * (https://www.iana.org/assignments/iana-ipv4-special-registry and iana-ipv6-special-registry):
 * private, shared (carrier-grade NAT), loopback, link-local, documentation, benchmarking, 6to4
 * relays, multicast and reserved. IPv6 outside 2000::/3 is never a global unicast address, so only
 * the special ranges inside it are listed. An IPv4-mapped IPv6 address is judged as the IPv4 one.
 */
const NOT_PUBLIC = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.0.2.0/24",
  "192.88.99.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "198.51.100.0/24",
  "203.0.113.0/24",
  "224.0.0.0/4",
  "240.0.0.0/4",
  // Teredo, benchmarking, ORCHID and the other protocol assignments.
  "2001::/23",
  "2001:db8::/32",
  "2002::/16",
  "3fff::/20",
].map(parseRange);

const GLOBAL_UNICAST = parseRange("2000::/3");

export type CheckedAddress =
  { ok: true; address: string } | { ok: false; error: "invalid_ip" | "not_public"; message: string };

/** The address as the database reader takes it: dotted IPv4, or all eight IPv6 groups. */
function canonical(address: Address): string {
  if (address.length === 4) return address.join(".");
  const groups: string[] = [];
  for (let i = 0; i < 16; i += 2) groups.push(((address[i]! << 8) | address[i + 1]!).toString(16));
  return groups.join(":");
}

/** A public IPv4 or IPv6 address to look up, or why it can't be. Zone ids and CIDR suffixes are invalid. */
export function checkAddress(text: string): CheckedAddress {
  const trimmed = text.trim();
  const address = /[%/]/.test(trimmed) ? null : parseIp(trimmed);
  if (!address) return { ok: false, error: "invalid_ip", message: "Pass one IPv4 or IPv6 address as ?ip=." };
  const special =
    NOT_PUBLIC.some((range) => inRange(address, range)) || (address.length === 16 && !inRange(address, GLOBAL_UNICAST));
  if (special) {
    return { ok: false, error: "not_public", message: "This is a private or reserved address, so it has no location." };
  }
  return { ok: true, address: canonical(address) };
}
