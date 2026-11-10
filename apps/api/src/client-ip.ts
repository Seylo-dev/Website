import type { Server } from "bun";

/**
 * Cloudflare's published edge ranges, https://www.cloudflare.com/ips/ (checked 2026-11-07, etag
 * 38f79d050aa027e3be3865e495dcc9bc). Only a request that reached the proxy from one of these came
 * through Cloudflare, so only then is its cf-connecting-ip Cloudflare's record of the visitor.
 * Cloudflare announces changes to the list ahead of time; update it here when it does.
 */
export const CLOUDFLARE_RANGES = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32",
] as const;

/** An address as bytes: 4 for IPv4, 16 for IPv6. */
export type Address = number[];

function parseIpv4(text: string): Address | null {
  const parts = text.split(".");
  if (parts.length !== 4) return null;
  const bytes: Address = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const byte = Number(part);
    if (byte > 255) return null;
    bytes.push(byte);
  }
  return bytes;
}

function parseIpv6(text: string): Address | null {
  const zone = text.indexOf("%");
  const halves = (zone === -1 ? text : text.slice(0, zone)).split("::");
  if (halves.length > 2) return null;
  // Groups to bytes. Only the very last group of the address may be a dotted IPv4 (::ffff:1.2.3.4).
  const bytesOf = (half: string, endsAddress: boolean): Address | null => {
    const groups = half === "" ? [] : half.split(":");
    const bytes: Address = [];
    for (const [i, group] of groups.entries()) {
      if (endsAddress && i === groups.length - 1 && group.includes(".")) {
        const v4 = parseIpv4(group);
        if (!v4) return null;
        bytes.push(...v4);
      } else if (/^[0-9A-Fa-f]{1,4}$/.test(group)) {
        const word = parseInt(group, 16);
        bytes.push(word >> 8, word & 0xff);
      } else {
        return null;
      }
    }
    return bytes;
  };
  if (halves.length === 1) {
    const bytes = bytesOf(halves[0]!, true);
    return bytes?.length === 16 ? bytes : null;
  }
  const head = bytesOf(halves[0]!, false);
  const tail = bytesOf(halves[1]!, true);
  // "::" stands for at least one group of zeros.
  if (!head || !tail || head.length + tail.length > 14) return null;
  return [...head, ...new Array<number>(16 - head.length - tail.length).fill(0), ...tail];
}

/** A plain IPv4 or IPv6 address, or null. IPv4-mapped IPv6 (`::ffff:192.0.2.1`) comes back as IPv4. */
export function parseIp(text: string): Address | null {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > 64) return null;
  if (!trimmed.includes(":")) return parseIpv4(trimmed);
  const bytes = parseIpv6(trimmed);
  if (bytes && bytes.slice(0, 10).every((byte) => byte === 0) && bytes[10] === 0xff && bytes[11] === 0xff) {
    return bytes.slice(12);
  }
  return bytes;
}

/** "10.0.0.0/8" or "2001:db8::/32" as a network and its prefix length; throws on a malformed range. */
export function parseRange(cidr: string): { network: Address; bits: number } {
  const [address, bits] = cidr.split("/");
  const network = parseIp(address ?? "");
  if (!network) throw new Error(`bad range ${cidr}`);
  return { network, bits: Number(bits) };
}

const cloudflare = CLOUDFLARE_RANGES.map(parseRange);

/** Whether `address` is in the range; an IPv4 address is never in an IPv6 range, or the other way round. */
export function inRange(address: Address, { network, bits }: { network: Address; bits: number }): boolean {
  if (address.length !== network.length) return false;
  const whole = Math.floor(bits / 8);
  for (let i = 0; i < whole; i++) if (address[i] !== network[i]) return false;
  const rest = bits % 8;
  if (rest === 0) return true;
  const mask = (0xff << (8 - rest)) & 0xff;
  return ((address[whole]! ^ network[whole]!) & mask) === 0;
}

export function isCloudflare(address: Address): boolean {
  return cloudflare.some((range) => inRange(address, range));
}

/**
 * IPv4 as is, IPv6 by its /64: a single IPv6 host is usually handed a whole /64 and can pick a new
 * address from it for every request.
 */
function rateLimitKey(address: Address): string {
  if (address.length === 4) return address.join(".");
  const groups: string[] = [];
  for (let i = 0; i < 8; i += 2) groups.push(((address[i]! << 8) | address[i + 1]!).toString(16));
  return `${groups.join(":")}::/64`;
}

/** The right-most X-Forwarded-For entry. */
function lastHop(header: string | null): Address | null {
  if (!header) return null;
  return parseIp(header.slice(header.lastIndexOf(",") + 1));
}

/**
 * The key requests are rate limited by.
 *
 * Without `trustProxy` that is the address of the connection. With it, the API sits behind a proxy
 * that appends the address connecting to it to X-Forwarded-For and is the only way in: on Easypanel,
 * visitor -> Cloudflare -> Traefik -> this container. Troubleshoot uploads come that way too: the
 * landing redirects seylo.dev/l here instead of proxying it. Traefik also answers clients that skip
 * Cloudflare: their cf-connecting-ip reaches the API untouched, and so can the start of their
 * X-Forwarded-For (Traefik keeps it when its forwardedHeaders trust the sender), so:
 *
 * - only the last X-Forwarded-For hop is used, the one Traefik appended;
 * - cf-connecting-ip is believed only when that hop is one of Cloudflare's addresses.
 *
 * IPv6 addresses are grouped by /64.
 */
export function clientKey(request: Request, server: Server<unknown> | null, trustProxy: boolean): string {
  const socket = parseIp(server?.requestIP(request)?.address ?? "");
  if (trustProxy) {
    const peer = lastHop(request.headers.get("x-forwarded-for")) ?? socket;
    if (peer && isCloudflare(peer)) {
      const visitor = parseIp(request.headers.get("cf-connecting-ip") ?? "");
      if (visitor) return rateLimitKey(visitor);
    }
    if (peer) return rateLimitKey(peer);
  }
  return socket ? rateLimitKey(socket) : "unknown";
}
