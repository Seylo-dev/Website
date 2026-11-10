import { afterAll, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config";
import { checkAddress } from "../src/geo/address";
import { GEO_ATTRIBUTION, openGeoDatabase } from "../src/geo/database";
import { createGeoSource, type GeoSource } from "../src/geo/source";
import { monthOf, readGeoFileInfo, updateGeoDatabase } from "../src/geo/update";
import { closeTestDatabases, request, testApp } from "./helpers";
import { buildMmdb, cityRecord, fixtureDatabase } from "./mmdb";

const dirs: string[] = [];
afterAll(async () => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  await closeTestDatabases();
});

function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), "site-api-geo-"));
  dirs.push(dir);
  return dir;
}

/** A source over the fixture database, as the app gets it. */
function fixtureSource(): GeoSource {
  const db = openGeoDatabase(fixtureDatabase());
  return { lookup: (address) => db.lookup(address), health: () => ({ state: "ok", database: null, lastUpdate: null }) };
}

const quiet = { log: () => {}, error: () => {} };

describe("addresses", () => {
  test("public IPv4 and IPv6 addresses are looked up in a canonical form", () => {
    expect(checkAddress(" 88.198.10.1 ")).toEqual({ ok: true, address: "88.198.10.1" });
    expect(checkAddress("2A01:4F8::1")).toEqual({ ok: true, address: "2a01:4f8:0:0:0:0:0:1" });
    // An IPv4-mapped address is the IPv4 one.
    expect(checkAddress("::ffff:88.198.10.1")).toEqual({ ok: true, address: "88.198.10.1" });
  });

  test("anything that isn't one address is invalid", () => {
    for (const bad of [
      "",
      "localhost",
      "example.com",
      "1.2.3",
      "1.2.3.4.5",
      "256.1.1.1",
      "88.198.0.0/16",
      "fe80::1%eth0",
      "1.2.3.4:80",
    ]) {
      expect([bad, checkAddress(bad)]).toEqual([bad, expect.objectContaining({ ok: false, error: "invalid_ip" })]);
    }
  });

  test("private, shared, loopback, link-local, documentation, multicast and reserved addresses are refused", () => {
    for (const special of [
      "10.1.2.3",
      "172.16.0.1",
      "192.168.1.1",
      "100.64.0.1",
      "127.0.0.1",
      "169.254.169.254",
      "0.0.0.0",
      "192.0.2.10",
      "198.51.100.4",
      "203.0.113.7",
      "198.18.0.1",
      "224.0.0.1",
      "255.255.255.255",
      "::",
      "::1",
      "fe80::1",
      "fd00::5",
      "ff02::1",
      "2001:db8::7",
      "2001::1",
      "2002:c000:204::1",
      "64:ff9b::808:808",
      "3fff::1",
      "::ffff:10.0.0.1",
    ]) {
      expect([special, checkAddress(special)]).toEqual([
        special,
        expect.objectContaining({ ok: false, error: "not_public" }),
      ]);
    }
  });
});

describe("database", () => {
  test("reads city, region, country and code from DB-IP's City Lite layout", () => {
    const db = openGeoDatabase(fixtureDatabase());
    expect(db.lookup("88.198.10.1")).toEqual({
      city: "Falkenstein",
      region: "Saxony",
      country: "Germany",
      countryCode: "DE",
    });
    expect(db.lookup("2a01:4f8:0:0:0:0:0:1")).toEqual({
      city: "Falkenstein",
      region: "Saxony",
      country: "Germany",
      countryCode: "DE",
    });
    expect(db.lookup("5.29.4.4")).toEqual({ city: null, region: null, country: "Israel", countryCode: "IL" });
    // DB-IP's "ZZ" is no country, and an address it doesn't hold is all nulls.
    expect(db.lookup("45.1.1.1")).toEqual({ city: null, region: null, country: null, countryCode: null });
    expect(db.lookup("8.8.8.8")).toEqual({ city: null, region: null, country: null, countryCode: null });
    expect(db.builtAt.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });

  test("refuses what isn't an IPv6 city database", () => {
    expect(() => openGeoDatabase(fixtureDatabase({ ipVersion: 4 }))).toThrow("IPv4-only");
    expect(() => openGeoDatabase(fixtureDatabase({ databaseType: "DBIP-ASN-Lite" }))).toThrow("not a city one");
    expect(() => openGeoDatabase(Buffer.from("not a database"))).toThrow();
  });
});

describe("GET /geo", () => {
  test("answers the location with DB-IP's attribution, never cached", async () => {
    const { app } = await testApp({ geo: fixtureSource() });
    const response = await app.handle(request("/geo?ip=88.198.10.1"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      city: "Falkenstein",
      region: "Saxony",
      country: "Germany",
      countryCode: "DE",
      attribution: GEO_ATTRIBUTION,
    });
    expect(GEO_ATTRIBUTION).toBe("Geolocation by DB-IP (https://db-ip.com)");

    const v6 = await app.handle(request(`/geo?ip=${encodeURIComponent("2a01:4f8:c0c:1234::1")}`));
    expect(await v6.json()).toMatchObject({ city: "Falkenstein", countryCode: "DE" });
    const unknown = await app.handle(request("/geo?ip=8.8.8.8"));
    expect(unknown.status).toBe(200);
    expect(await unknown.json()).toEqual({
      city: null,
      region: null,
      country: null,
      countryCode: null,
      attribution: GEO_ATTRIBUTION,
    });
  });

  test("400 for an invalid, missing, private or reserved address", async () => {
    const { app } = await testApp({ geo: fixtureSource() });
    for (const [path, error] of [
      ["/geo", "invalid_ip"],
      ["/geo?ip=", "invalid_ip"],
      ["/geo?ip=not-an-ip", "invalid_ip"],
      ["/geo?ip=10.0.0.5", "not_public"],
      ["/geo?ip=203.0.113.7", "not_public"],
      [`/geo?ip=${encodeURIComponent("fd00::5")}`, "not_public"],
    ] as const) {
      const response = await app.handle(request(path));
      expect([path, response.status]).toEqual([path, 400]);
      expect(await response.json()).toMatchObject({ error });
    }
  });

  test("503 with Retry-After while no database is loaded", async () => {
    const { app } = await testApp();
    const response = await app.handle(request("/geo?ip=88.198.10.1"));
    expect(response.status).toBe(503);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await response.json()).toMatchObject({ error: "unavailable" });
  });

  test("the address looked up is never logged", async () => {
    const { app } = await testApp({ geo: fixtureSource() });
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
      spyOn(console, method).mockImplementation(() => {}),
    );
    try {
      await app.handle(request("/geo?ip=88.198.77.66"));
      await app.handle(request("/geo?ip=10.77.66.55"));
      for (const spy of spies) {
        for (const call of spy.mock.calls) expect(JSON.stringify(call)).not.toMatch(/77\.66/);
      }
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });

  test("120 lookups per hour per address, on a budget of their own", async () => {
    const { app } = await testApp({ geo: fixtureSource() });
    const ip = "198.51.100.200";
    for (let i = 0; i < 120; i++) expect((await app.handle(request("/geo?ip=88.198.10.1", { ip }))).status).toBe(200);
    expect((await app.handle(request("/geo?ip=88.198.10.1", { ip }))).status).toBe(429);
    // Telemetry from the same address still goes through, and other addresses still look up.
    const ping = await app.handle(
      request("/telemetry", {
        method: "POST",
        ip,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ installId: "inst_geo_budget_000001", version: "0.2.5", nodes: 1, services: 0 }),
      }),
    );
    expect(ping.status).toBe(204);
    expect((await app.handle(request("/geo?ip=88.198.10.1"))).status).toBe(200);
  });

  test("/healthz reports the database without changing its status", async () => {
    const health = await (await testApp()).app.handle(request("/healthz"));
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ status: "ok", geo: { state: "missing", database: null } });
  });
});

/** DB-IP's download as the updater sees it: the files of the months listed, gzipped; 404 for the rest. */
function fakeDbIp(files: Record<string, Buffer | number>) {
  const asked: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input);
    asked.push(url);
    const month = /dbip-city-lite-(\d{4}-\d{2})\.mmdb\.gz$/.exec(url)?.[1] ?? "";
    const file = files[month];
    if (file === undefined) return new Response("Not found", { status: 404 });
    if (typeof file === "number") return new Response("Server error", { status: file });
    return new Response(Bun.gzipSync(new Uint8Array(file)));
  }) as typeof fetch;
  return { fetch: fetchImpl, asked };
}

const NOV = new Date("2026-11-10T06:00:00Z");

function geoConfig(dir: string, autoUpdate = true) {
  return {
    dbPath: join(dir, "geo", "dbip-city-lite.mmdb"),
    autoUpdate,
    downloadUrl: "https://download.test/free/dbip-city-lite-{month}.mmdb.gz",
  };
}

describe("updating the database", () => {
  test("months are UTC and roll back over a year", () => {
    expect(monthOf(NOV)).toBe("2026-11");
    expect(monthOf(new Date("2027-01-01T00:30:00Z"), 1)).toBe("2026-12");
    expect(monthOf(new Date("2026-03-31T23:59:59Z"), 1)).toBe("2026-02");
  });

  test("downloads this month's file once and records which month it is", async () => {
    const config = geoConfig(tempDir());
    const dbIp = fakeDbIp({ "2026-11": fixtureDatabase() });
    expect(await updateGeoDatabase(config, { fetch: dbIp.fetch, now: NOV, log: quiet })).toMatchObject({
      status: "updated",
      month: "2026-11",
    });
    expect(dbIp.asked).toEqual(["https://download.test/free/dbip-city-lite-2026-11.mmdb.gz"]);
    expect(readFileSync(config.dbPath).equals(fixtureDatabase())).toBe(true);
    expect(await readGeoFileInfo(config.dbPath)).toMatchObject({ month: "2026-11", bytes: fixtureDatabase().length });

    // Already the newest: nothing is downloaded.
    expect(await updateGeoDatabase(config, { fetch: dbIp.fetch, now: NOV, log: quiet })).toEqual({
      status: "current",
      month: "2026-11",
    });
    expect(dbIp.asked).toHaveLength(1);
  });

  test("takes last month's file while this month's is not out, and keeps it", async () => {
    const config = geoConfig(tempDir());
    const dbIp = fakeDbIp({ "2026-10": fixtureDatabase() });
    expect(await updateGeoDatabase(config, { fetch: dbIp.fetch, now: NOV, log: quiet })).toMatchObject({
      status: "updated",
      month: "2026-10",
    });
    // Asking again asks for November only.
    expect(await updateGeoDatabase(config, { fetch: dbIp.fetch, now: NOV, log: quiet })).toEqual({
      status: "current",
      month: "2026-10",
    });
    expect(dbIp.asked.filter((url) => url.includes("2026-11"))).toHaveLength(2);
    expect(dbIp.asked.filter((url) => url.includes("2026-10"))).toHaveLength(1);
  });

  test("a failed or bad download keeps the database that was there", async () => {
    const config = geoConfig(tempDir());
    await updateGeoDatabase(config, { fetch: fakeDbIp({ "2026-10": fixtureDatabase() }).fetch, now: NOV, log: quiet });
    const before = statSync(config.dbPath).mtimeMs;

    const errors: string[] = [];
    const log = { log: () => {}, error: (line: string) => errors.push(line) };
    const asIs = buildMmdb([["88.198.0.0/16", cityRecord("Falkenstein", "Saxony", "Germany", "DE")]], {
      databaseType: "DBIP-ASN-Lite",
    });
    for (const file of [500, Buffer.from("<html>not gzip</html>"), asIs] as const) {
      const fetchImpl =
        typeof file === "number" || file === asIs
          ? fakeDbIp({ "2026-11": file }).fetch
          : ((async () => new Response(file)) as unknown as typeof fetch);
      const result = await updateGeoDatabase(config, { fetch: fetchImpl, now: NOV, log });
      expect(result.status).toBe("failed");
    }
    const unreachable = (async () => {
      throw new Error("connect ECONNREFUSED");
    }) as unknown as typeof fetch;
    expect((await updateGeoDatabase(config, { fetch: unreachable, now: NOV, log })).status).toBe("failed");

    expect(errors).toHaveLength(4);
    expect(errors.every((line) => line.includes("Keeping the 2026-10 database"))).toBe(true);
    expect(statSync(config.dbPath).mtimeMs).toBe(before);
    expect((await readGeoFileInfo(config.dbPath))?.month).toBe("2026-10");
    expect(openGeoDatabase(readFileSync(config.dbPath)).lookup("88.198.1.1").city).toBe("Falkenstein");
    // No half-written download, and no copy made to open one, is left behind.
    expect([...new Bun.Glob("*.{download,open}-*").scanSync(join(config.dbPath, ".."))]).toEqual([]);
  });

  test("the source loads the file, picks up a new month and keeps serving through a failure", async () => {
    const config = geoConfig(tempDir());
    const october = buildMmdb([["88.198.0.0/16", cityRecord("Nuremberg", "Bavaria", "Germany", "DE")]]);
    let files: Record<string, Buffer | number> = { "2026-10": october };
    const fetchImpl = ((input: string | URL | Request) => fakeDbIp(files).fetch(input)) as typeof fetch;
    const source = createGeoSource(config, { fetch: fetchImpl, log: quiet });
    expect(source.lookup("88.198.1.1")).toBeNull();
    expect(source.health().state).toBe("missing");

    await source.refresh(NOV);
    expect(source.lookup("88.198.1.1")).toMatchObject({ city: "Nuremberg" });
    expect(source.health()).toMatchObject({ state: "ok", database: { month: "2026-10" }, lastUpdate: { ok: true } });

    // November is out.
    files = { "2026-10": october, "2026-11": fixtureDatabase() };
    await source.refresh(new Date("2026-11-11T00:00:00Z"));
    expect(source.lookup("88.198.1.1")).toMatchObject({ city: "Falkenstein" });
    expect(source.health().database?.month).toBe("2026-11");

    // December fails: November keeps answering, and /healthz says so.
    files = { "2026-12": 503, "2026-11": 503 };
    await source.refresh(new Date("2026-12-02T00:00:00Z"));
    expect(source.lookup("88.198.1.1")).toMatchObject({ city: "Falkenstein" });
    expect(source.health()).toMatchObject({
      state: "stale",
      database: { month: "2026-11" },
      lastUpdate: { ok: false },
    });
  });

  test("without autoUpdate the source only reads the file", async () => {
    const dir = tempDir();
    const config = geoConfig(dir, false);
    const dbIp = fakeDbIp({ "2026-11": fixtureDatabase() });
    const source = createGeoSource(config, { fetch: dbIp.fetch, log: quiet });
    await source.refresh(NOV);
    expect(dbIp.asked).toEqual([]);
    expect(source.health().state).toBe("missing");

    // A file put there by hand (bun run geo:update) is loaded on the next refresh.
    await updateGeoDatabase(config, { fetch: dbIp.fetch, now: NOV, log: quiet });
    await source.refresh(NOV);
    expect(source.lookup("5.29.1.1")).toMatchObject({ country: "Israel" });

    // A file that doesn't open leaves the loaded one in service.
    writeFileSync(config.dbPath, "garbage");
    await source.refresh(NOV);
    expect(source.lookup("5.29.1.1")).toMatchObject({ country: "Israel" });
  });

  test("config: the file's path and automatic updates, on in production only", () => {
    expect(loadConfig({}).geo).toMatchObject({ autoUpdate: false });
    expect(loadConfig({}).geo.dbPath).toEndWith("/apps/api/data/geo/dbip-city-lite.mmdb");
    expect(loadConfig({ NODE_ENV: "production" }).geo.autoUpdate).toBe(true);
    expect(loadConfig({ NODE_ENV: "production", GEO_AUTO_UPDATE: "false" }).geo.autoUpdate).toBe(false);
    expect(loadConfig({ GEO_DB_PATH: "/srv/geo/city.mmdb" }).geo.dbPath).toBe("/srv/geo/city.mmdb");
    expect(loadConfig({}).geo.downloadUrl).toBe("https://download.db-ip.com/free/dbip-city-lite-{month}.mmdb.gz");
    expect(() => loadConfig({ GEO_AUTO_UPDATE: "yes" })).toThrow("GEO_AUTO_UPDATE must be true or false");
  });
});
