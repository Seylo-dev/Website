import { afterAll, describe, expect, test } from "bun:test";
import type { Server } from "bun";
import { clientKey } from "../src/client-ip";
import { closeTestDatabases, testApp } from "./helpers";

afterAll(closeTestDatabases);

/** A request as it reaches the container, from `socket`, with the headers the hops in front of it set. */
function from(socket: string | null, headers: Record<string, string> = {}) {
  const request = new Request("http://api.test/telemetry", { method: "POST", headers });
  const server = socket
    ? ({ requestIP: () => ({ address: socket, family: socket.includes(":") ? "IPv6" : "IPv4", port: 40000 }) } as never)
    : null;
  return { request, server: server as Server<unknown> | null };
}

const key = (trustProxy: boolean, socket: string | null, headers: Record<string, string> = {}) => {
  const { request, server } = from(socket, headers);
  return clientKey(request, server, trustProxy);
};

// Traefik's address on the Docker network, which every request with TRUST_PROXY comes from.
const TRAEFIK = "10.11.0.5";
// 172.70.0.0/15 is part of Cloudflare's 172.64.0.0/13; 2a06:98c1:: is in 2a06:98c0::/29.
const CF_EDGE_V4 = "172.70.120.17";
const CF_EDGE_V6 = "2a06:98c1:3120::7";

describe("clientKey with TRUST_PROXY", () => {
  test("a client that skips Cloudflare can't pick its key with cf-connecting-ip or the first X-Forwarded-For hop", () => {
    // The client connects to Traefik from 203.0.113.9 and sends both headers; Traefik appends 203.0.113.9.
    const forged = (spoof: string) =>
      key(true, TRAEFIK, { "cf-connecting-ip": spoof, "x-forwarded-for": `${spoof}, 203.0.113.9` });
    expect(forged("198.51.100.1")).toBe("203.0.113.9");
    expect(forged("198.51.100.2")).toBe("203.0.113.9");
    // Not even by claiming a Cloudflare address as an earlier hop.
    expect(key(true, TRAEFIK, { "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": `${CF_EDGE_V4}, 203.0.113.9` })).toBe(
      "203.0.113.9",
    );
    // A Traefik that drops untrusted X-Forwarded-For and writes only the peer: same key.
    expect(key(true, TRAEFIK, { "cf-connecting-ip": "198.51.100.1", "x-forwarded-for": "203.0.113.9" })).toBe(
      "203.0.113.9",
    );
  });

  test("a request through Cloudflare is keyed on the visitor Cloudflare names", () => {
    // Cloudflare appends the visitor to whatever X-Forwarded-For it got, Traefik appends the edge.
    expect(
      key(true, TRAEFIK, {
        "cf-connecting-ip": "198.51.100.7",
        "x-forwarded-for": `6.6.6.6, 198.51.100.7, ${CF_EDGE_V4}`,
      }),
    ).toBe("198.51.100.7");
    expect(key(true, TRAEFIK, { "cf-connecting-ip": "198.51.100.7", "x-forwarded-for": CF_EDGE_V6 })).toBe(
      "198.51.100.7",
    );
    // From Cloudflare but without a usable cf-connecting-ip: the edge address, never the client's own header.
    expect(key(true, TRAEFIK, { "x-forwarded-for": `6.6.6.6, ${CF_EDGE_V4}` })).toBe(CF_EDGE_V4);
    expect(key(true, TRAEFIK, { "cf-connecting-ip": "nonsense", "x-forwarded-for": CF_EDGE_V4 })).toBe(CF_EDGE_V4);
  });

  test("addresses just outside Cloudflare's ranges are not Cloudflare", () => {
    const via = (edge: string) => key(true, TRAEFIK, { "cf-connecting-ip": "198.51.100.7", "x-forwarded-for": edge });
    // 172.64.0.0/13 ends at 172.71.255.255; 2a06:98c0::/29 at 2a06:98c7:ffff:...
    expect(via("172.72.0.1")).toBe("172.72.0.1");
    expect(via("172.63.255.255")).toBe("172.63.255.255");
    expect(via("2a06:98c8::1")).toBe("2a06:98c8:0:0::/64");
    // And the edges of the ranges themselves are.
    expect(via("172.64.0.0")).toBe("198.51.100.7");
    expect(via("172.71.255.255")).toBe("198.51.100.7");
    expect(via("2a06:98c7:ffff:ffff:ffff:ffff:ffff:ffff")).toBe("198.51.100.7");
  });

  test("IPv6: keyed by /64, through Cloudflare and directly", () => {
    // A visitor on IPv6 through Cloudflare, rotating addresses inside its /64.
    const viaCloudflare = (visitor: string) =>
      key(true, TRAEFIK, { "cf-connecting-ip": visitor, "x-forwarded-for": CF_EDGE_V6 });
    expect(viaCloudflare("2001:db8:abcd:12:1:2:3:4")).toBe("2001:db8:abcd:12::/64");
    expect(viaCloudflare("2001:db8:abcd:12:ffff::9")).toBe("2001:db8:abcd:12::/64");
    expect(viaCloudflare("2001:db8:abcd:13::1")).toBe("2001:db8:abcd:13::/64");

    // An IPv6 client that skips Cloudflare and forges both headers.
    expect(
      key(true, TRAEFIK, {
        "cf-connecting-ip": "2001:db8:ffff::1",
        "x-forwarded-for": "2001:db8:ffff::1, 2001:DB8:1:2::abcd",
      }),
    ).toBe("2001:db8:1:2::/64");
    // IPv4-mapped IPv6 is the IPv4 address, zone ids are dropped.
    expect(key(true, TRAEFIK, { "x-forwarded-for": "::ffff:203.0.113.9" })).toBe("203.0.113.9");
    expect(key(true, TRAEFIK, { "x-forwarded-for": "fe80::1%eth0" })).toBe("fe80:0:0:0::/64");
  });

  test("without a usable X-Forwarded-For, the connection's address", () => {
    expect(key(true, "203.0.113.9")).toBe("203.0.113.9");
    expect(key(true, "203.0.113.9", { "x-forwarded-for": "not-an-ip" })).toBe("203.0.113.9");
    expect(key(true, "203.0.113.9", { "x-forwarded-for": "1.2.3.4, 1.2.3" })).toBe("203.0.113.9");
    expect(key(true, "203.0.113.9", { "x-forwarded-for": "1::2::3" })).toBe("203.0.113.9");
    expect(key(true, null, { "cf-connecting-ip": "198.51.100.7" })).toBe("unknown");
  });
});

describe("clientKey without TRUST_PROXY", () => {
  test("only the connection's address counts", () => {
    const headers = { "cf-connecting-ip": "198.51.100.7", "x-forwarded-for": `198.51.100.7, ${CF_EDGE_V4}` };
    expect(key(false, "203.0.113.9", headers)).toBe("203.0.113.9");
    // Even when the connection itself comes from Cloudflare.
    expect(key(false, CF_EDGE_V4, headers)).toBe(CF_EDGE_V4);
    expect(key(false, "::ffff:203.0.113.9", headers)).toBe("203.0.113.9");
    expect(key(false, "2001:db8:5:6:7:8:9:a", headers)).toBe("2001:db8:5:6::/64");
    expect(key(false, null, headers)).toBe("unknown");
  });
});

describe("rate limits with TRUST_PROXY", () => {
  // Every request comes from one client that skips Cloudflare, but sends new headers each time.
  const forged = (path: string, i: number, init: RequestInit) => {
    const headers = new Headers(init.headers);
    headers.set("cf-connecting-ip", `198.51.100.${i}`);
    headers.set("x-forwarded-for", `198.51.100.${i}, 203.0.113.77`);
    return new Request(`http://api.test${path}`, { ...init, headers });
  };

  test("forged headers don't get past the report upload limit", async () => {
    const { app } = await testApp();
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) {
      const init = { method: "POST", body: "# hi", headers: { "content-type": "text/markdown" } };
      statuses.push((await app.handle(forged("/l", i, init))).status);
    }
    expect(statuses.slice(0, 20).every((status) => status === 201)).toBe(true);
    expect(statuses[20]).toBe(429);
  });

  test("forged headers don't get past the telemetry limit", async () => {
    const { app } = await testApp();
    const ping = (i: number) => ({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        installId: `install-forged-${String(i).padStart(4, "0")}`,
        version: "0.2.0",
        nodes: 1,
        services: 1,
      }),
    });
    const statuses: number[] = [];
    for (let i = 0; i < 61; i++) statuses.push((await app.handle(forged("/telemetry", i, ping(i)))).status);
    expect(statuses.slice(0, 60).every((status) => status === 204)).toBe(true);
    expect(statuses[60]).toBe(429);
  });
});
