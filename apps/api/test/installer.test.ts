import { afterAll, describe, expect, test } from "bun:test";
import { createInstallerSource } from "../src/installer/source";
import { closeTestDatabases, request, testApp } from "./helpers";

afterAll(closeTestDatabases);

const config = { releaseUrl: "https://example.test/install.sh", cacheSeconds: 60, localPath: null };

function fakeFetch(responses: Array<Response | Error>) {
  let calls = 0;
  const impl = (async () => {
    const next = responses[Math.min(calls++, responses.length - 1)]!;
    if (next instanceof Error) throw next;
    return next.clone();
  }) as unknown as typeof fetch;
  return { impl, calls: () => calls };
}

describe("installer source", () => {
  test("caches the release and serves the stale copy when GitHub fails", async () => {
    const fetcher = fakeFetch([new Response("#!/bin/sh\necho v1\n"), new Error("offline")]);
    const source = createInstallerSource(config, fetcher.impl);

    expect(await source.get(0)).toEqual({ script: "#!/bin/sh\necho v1\n", origin: "release" });
    expect((await source.get(30_000))?.origin).toBe("cache");
    expect(fetcher.calls()).toBe(1);
    expect(await source.get(120_000)).toEqual({ script: "#!/bin/sh\necho v1\n", origin: "cache" });
    expect(fetcher.calls()).toBe(2);
  });

  test("never serves something that isn't a script", async () => {
    const source = createInstallerSource(config, fakeFetch([new Response("<html>Not Found</html>")]).impl);
    expect(await source.get()).toBeNull();
  });

  test("falls back to the local file", async () => {
    const localPath = `${import.meta.dir}/fixtures/install.sh`;
    const source = createInstallerSource({ ...config, localPath }, fakeFetch([new Error("offline")]).impl);
    expect((await source.get())?.origin).toBe("local");
  });

  test("serves / on the install host and 503 with nothing to serve", async () => {
    const script = { get: async () => ({ script: "#!/bin/sh\n", origin: "release" as const }) };
    const { app } = await testApp({ installer: script });
    const response = await app.handle(new Request("http://install.site.test/"));
    expect(await response.text()).toBe("#!/bin/sh\n");
    expect((await (await testApp()).app.handle(request("/install.sh"))).status).toBe(503);
  });
});
