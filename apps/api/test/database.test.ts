import { afterAll, describe, expect, test } from "bun:test";
import { loadConfig } from "../src/config";
import { DatabaseConfigError, openDatabase } from "../src/db";
import { backends, closeTestDatabases, openTestDatabase } from "./helpers";

afterAll(closeTestDatabases);

describe("database choice", () => {
  test("DATABASE_URL comes from the environment, empty means unset", () => {
    expect(loadConfig({ DATABASE_URL: "postgres://u:p@db:5432/site" }).databaseUrl).toBe("postgres://u:p@db:5432/site");
    expect(loadConfig({ DATABASE_URL: " " }).databaseUrl).toBeNull();
    expect(loadConfig({}).databaseUrl).toBeNull();
  });

  const failure = (promise: Promise<unknown>) =>
    promise.then(
      () => null,
      (error: Error) => error,
    );

  test("production refuses to start without DATABASE_URL", async () => {
    const error = await failure(openDatabase({ databaseUrl: null, dataDir: ":memory:", production: true }));
    expect(error).toBeInstanceOf(DatabaseConfigError);
    expect(error?.message).toStartWith("DATABASE_URL is not set.");
    expect(error?.message).toContain("internal connection URL");
  });

  test("only takes a postgres URL, and never echoes it", async () => {
    const options = { dataDir: ":memory:", production: true };
    const mysql = await failure(openDatabase({ ...options, databaseUrl: "mysql://u:hunter2@db/site" }));
    expect(mysql?.message).toContain("must be a postgres:// URL");
    expect(mysql?.message).not.toContain("hunter2");
    const invalid = await failure(openDatabase({ ...options, databaseUrl: "hunter2-not-a-url" }));
    expect(invalid?.message).toContain("not a valid URL");
    expect(invalid?.message).not.toContain("hunter2");
  });

  test("a host where no Postgres answers says what to check, without the password", async () => {
    // A closed port and a name that doesn't resolve (a typo, a service not created yet) fail the same way.
    for (const host of ["127.0.0.1:1", "site-db.invalid:5432"]) {
      const options = { dataDir: ":memory:", production: true, bootWaitMs: 0 };
      const error = await failure(openDatabase({ ...options, databaseUrl: `postgres://u:hunter2@${host}/site` }));
      expect(error?.message).toStartWith(
        `Could not open the database at postgres://${host}/site: Failed to connect. No Postgres answered`,
      );
      expect(error?.message).toContain("(<project>_<service>)");
      expect(error?.message).not.toContain("hunter2");
    }
  });

  test("outside production a missing DATABASE_URL means SQLite", async () => {
    const db = await openTestDatabase({ databaseUrl: null, dataDir: ":memory:", production: false });
    expect(db.kind).toBe("sqlite");
  });
});

const postgres = backends.find((backend) => backend.name === "postgres");

describe.skipIf(!postgres)("postgres connection", () => {
  const withParams = (databaseUrl: string | null, params: Record<string, string>) => {
    const url = new URL(databaseUrl!);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return url.toString();
  };

  test("sslmode in the URL decides TLS", async () => {
    const options = await postgres!.newDatabase();

    const plain = await openTestDatabase({
      ...options,
      databaseUrl: withParams(options.databaseUrl, { sslmode: "disable" }),
    });
    expect(plain.kind).toBe("postgres");
    expect(plain.location).toEndWith("?sslmode=disable");
    const [plainRow] = await plain.sql`SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()`;
    expect(plainRow.ssl).toBe(false);

    // The test server may or may not have TLS. Either way `require` must never fall back to plain.
    try {
      const tls = await openTestDatabase({
        ...options,
        databaseUrl: withParams(options.databaseUrl, { sslmode: "require" }),
      });
      const [tlsRow] = await tls.sql`SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()`;
      expect(tlsRow.ssl).toBe(true);
    } catch (error) {
      expect((error as Error).message).toContain("does not support SSL");
    }
  });

  test("a database that can't be used fails at once, without the password in the message", async () => {
    const url = new URL((await postgres!.newDatabase()).databaseUrl!);
    url.pathname = "/site_api_test_missing";
    const started = Date.now();
    const error = await openDatabase({ databaseUrl: url.toString(), dataDir: ":memory:", production: true }).then(
      () => null,
      (error: Error) => error,
    );
    expect(Date.now() - started).toBeLessThan(5000);
    expect(error?.message).toStartWith(`Could not open the database at postgres://${url.hostname}`);
    expect(error?.message).toContain("does not exist");
    if (url.password) expect(error?.message).not.toContain(url.password);
  });
});
