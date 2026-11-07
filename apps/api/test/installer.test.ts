import { afterAll, describe, expect, test } from "bun:test";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import brand from "../../../brand/brand.json";
import type { InstallerConfig } from "../src/config";
import { verifyMinisign } from "../src/installer/minisign";
import { createInstallerSource, type InstallerHealth, type InstallerSource } from "../src/installer/source";
import { closeTestDatabases, request, testApp } from "./helpers";

afterAll(closeTestDatabases);

const RELEASES = "https://github.test/acme/app/releases";

/** A throwaway minisign key: the public key in minisign's format and a signer writing .minisig files. */
function minisignKey() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const keyId = crypto.getRandomValues(new Uint8Array(8));
  const raw = Buffer.from(publicKey.export({ format: "jwk" }).x!, "base64url");
  return {
    publicKey: Buffer.concat([Buffer.from("Ed"), keyId, raw]).toString("base64"),
    /** Prehashed ("ED"), like `minisign -S` and the app's release script. */
    sign(message: string | Uint8Array, trusted = "seylo test manifest.json") {
      const sig = sign(null, createHash("blake2b512").update(message).digest(), privateKey);
      const global = sign(null, Buffer.concat([sig, Buffer.from(trusted)]), privateKey);
      return [
        "untrusted comment: signature from minisign secret key",
        Buffer.concat([Buffer.from("ED"), keyId, sig]).toString("base64"),
        `trusted comment: ${trusted}`,
        global.toString("base64"),
        "",
      ].join("\n");
    },
  };
}

const releaseKey = minisignKey();
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const script = (version: string) => `#!/bin/sh\necho "installer ${version}"\n`;

type ReleaseFiles = Record<string, string | Response | Error>;

/** The three files of a release as the app's release workflow publishes them, signed with `key`. */
function release(version: string, options: { script?: string; manifest?: object; key?: typeof releaseKey } = {}) {
  const body = options.script ?? script(version);
  const manifest = JSON.stringify(
    options.manifest ?? {
      schema: 1,
      version,
      installer: {
        url: `${RELEASES}/download/v${version}/install.sh`,
        sha256: sha256(body),
        size: Buffer.byteLength(body),
      },
    },
    null,
    2,
  );
  return {
    "manifest.json": manifest,
    "manifest.json.minisig": (options.key ?? releaseKey).sign(manifest),
    "install.sh": body,
  } satisfies ReleaseFiles;
}

/** A fake GitHub: `<releases>/latest` redirects to `latest`, files are served from `releases[tag]`. */
function fakeGitHub(state: { latest: string | Error; releases: Record<string, ReleaseFiles> }) {
  const urls: string[] = [];
  const impl = (async (input: string | URL | Request) => {
    const url = String(input);
    urls.push(url);
    if (url === `${RELEASES}/latest`) {
      if (state.latest instanceof Error) throw state.latest;
      return new Response(null, {
        status: 302,
        headers: { location: `https://github.test/acme/app/releases/tag/${state.latest}` },
      });
    }
    const match = /\/download\/([^/]+)\/([^/]+)$/.exec(url);
    const file = match ? state.releases[decodeURIComponent(match[1]!)]?.[match[2]!] : undefined;
    if (file instanceof Error) throw file;
    if (file instanceof Response) return file.clone();
    if (typeof file === "string") return new Response(file);
    return new Response("Not Found", { status: 404 });
  }) as typeof fetch;
  return { impl, urls, state };
}

function quietLog() {
  const lines: string[] = [];
  const push = (...args: unknown[]) => void lines.push(args.join(" "));
  return { log: { log: push, error: push }, lines };
}

const config: InstallerConfig = {
  releasesUrl: RELEASES,
  publicKey: releaseKey.publicKey,
  cacheSeconds: 60,
  localPath: null,
};

function source(github: ReturnType<typeof fakeGitHub>, overrides: Partial<InstallerConfig> = {}) {
  const logs = quietLog();
  return {
    source: createInstallerSource({ ...config, ...overrides }, github.impl, { log: logs.log }),
    lines: logs.lines,
  };
}

const errorOf = (installer: InstallerSource) => installer.health().lastCheck?.error?.message ?? "";

describe("installer source", () => {
  test("serves a release whose install.sh matches its signed manifest, and caches it", async () => {
    const github = fakeGitHub({ latest: "v0.2.0", releases: { "v0.2.0": release("0.2.0") } });
    const { source: installer, lines } = source(github);

    expect(await installer.get(0)).toEqual({
      script: script("0.2.0"),
      origin: "release",
      version: "0.2.0",
      sha256: sha256(script("0.2.0")),
    });
    expect((await installer.get(30_000))?.origin).toBe("cache");
    expect(github.urls).toHaveLength(4);
    expect(installer.health()).toMatchObject({
      state: "ok",
      serving: { version: "0.2.0", tag: "v0.2.0" },
      lastCheck: { ok: true, error: null },
    });
    expect(lines.join("\n")).toContain("serving install.sh of v0.2.0");

    // Checked again once the cache period is over.
    expect((await installer.get(61_000))?.origin).toBe("release");
    expect(github.urls).toHaveLength(8);
  });

  test("resolves latest once and downloads every file from that tag", async () => {
    const github = fakeGitHub({ latest: "v0.2.0", releases: { "v0.2.0": release("0.2.0") } });
    await source(github).source.get(0);
    expect(github.urls).toEqual([
      `${RELEASES}/latest`,
      `${RELEASES}/download/v0.2.0/manifest.json`,
      `${RELEASES}/download/v0.2.0/manifest.json.minisig`,
      `${RELEASES}/download/v0.2.0/install.sh`,
    ]);
  });

  test("refuses a tampered install.sh", async () => {
    // Same length as the real one, so only the hash can tell.
    const files = { ...release("0.2.0"), "install.sh": script("0.2.0").replace("installer", "owned! :)") };
    const github = fakeGitHub({ latest: "v0.2.0", releases: { "v0.2.0": files } });
    const { source: installer, lines } = source(github);

    expect(await installer.get(0)).toBeNull();
    expect(installer.health()).toMatchObject({
      state: "failing",
      serving: null,
      lastCheck: { ok: false, tag: "v0.2.0", error: { kind: "rejected" } },
    });
    expect(errorOf(installer)).toContain(`has sha256 ${sha256(files["install.sh"])}, but the signed manifest says`);
    expect(lines.join("\n")).toContain("REFUSED");
  });

  test("keeps serving the last good copy when the release is tampered with later", async () => {
    const github = fakeGitHub({ latest: "v0.2.0", releases: { "v0.2.0": release("0.2.0") } });
    const { source: installer } = source(github);
    await installer.get(0);

    // The same tag's install.sh replaced on GitHub, by someone without the release key.
    github.state.releases["v0.2.0"]!["install.sh"] = script("0.2.0").replace("installer", "owned! :)");
    expect(await installer.get(61_000)).toMatchObject({ script: script("0.2.0"), origin: "cache", version: "0.2.0" });
    expect(installer.health()).toMatchObject({
      state: "stale",
      serving: { version: "0.2.0", verifiedAt: new Date(0).toISOString() },
      lastCheck: { ok: false, error: { kind: "rejected" } },
    });
    expect(errorOf(installer)).toContain("has sha256");
  });

  test("refuses a manifest whose signature does not match", async () => {
    const files = release("0.2.0");
    // The manifest edited after signing, to name the hash of a script of the attacker's choosing.
    const evil = "#!/bin/sh\necho owned\n";
    const manifest = files["manifest.json"].replace(sha256(script("0.2.0")), sha256(evil));
    const github = fakeGitHub({
      latest: "v0.2.0",
      releases: { "v0.2.0": { ...files, "manifest.json": manifest, "install.sh": evil } },
    });
    const { source: installer } = source(github);

    expect(await installer.get(0)).toBeNull();
    expect(errorOf(installer)).toContain("signature does not match");
  });

  test("refuses a malformed or missing signature", async () => {
    const github = fakeGitHub({
      latest: "v0.2.0",
      releases: { "v0.2.0": { ...release("0.2.0"), "manifest.json.minisig": "not a signature" } },
    });
    const { source: installer } = source(github);
    expect(await installer.get(0)).toBeNull();
    expect(installer.health().lastCheck?.error).toMatchObject({ kind: "rejected" });

    github.state.releases["v0.2.0"] = {
      ...release("0.2.0"),
      "manifest.json.minisig": new Response("Not Found", { status: 404 }),
    };
    expect(await installer.get(31_000)).toBeNull();
    expect(errorOf(installer)).toContain("404");
  });

  test("refuses a release signed with another key", async () => {
    const github = fakeGitHub({ latest: "v0.2.0", releases: { "v0.2.0": release("0.2.0", { key: minisignKey() }) } });
    const { source: installer } = source(github);

    expect(await installer.get(0)).toBeNull();
    expect(errorOf(installer)).toContain("signed with a different key");
  });

  test("refuses files mixed from two releases", async () => {
    const old = release("0.1.0");
    const current = release("0.2.0");

    // v0.2.0 carries v0.1.0's genuinely signed manifest and script: the version gives it away.
    const replayed = source(fakeGitHub({ latest: "v0.2.0", releases: { "v0.2.0": old } })).source;
    expect(await replayed.get(0)).toBeNull();
    expect(errorOf(replayed)).toContain("is for version 0.1.0");

    // v0.2.0's signed manifest next to v0.1.0's install.sh: the hash gives it away.
    const mixed = source(
      fakeGitHub({ latest: "v0.2.0", releases: { "v0.2.0": { ...current, "install.sh": old["install.sh"] } } }),
    ).source;
    expect(await mixed.get(0)).toBeNull();
    expect(errorOf(mixed)).toContain("but the signed manifest says");
  });

  test("a release published mid-check does not mix files: all come from the tag resolved first", async () => {
    const github = fakeGitHub({
      latest: "v0.1.0",
      releases: { "v0.1.0": release("0.1.0"), "v0.2.0": release("0.2.0") },
    });
    // v0.2.0 becomes the latest release right after "latest" was resolved.
    const racing = (async (input: string | URL | Request, init?: RequestInit) => {
      const response = await github.impl(input, init);
      if (String(input).endsWith("/latest")) github.state.latest = "v0.2.0";
      return response;
    }) as typeof fetch;
    const installer = createInstallerSource(config, racing, { log: quietLog().log });

    expect(await installer.get(0)).toMatchObject({ script: script("0.1.0"), origin: "release", version: "0.1.0" });
    const downloads = github.urls.filter((url) => url.includes("/download/"));
    expect(downloads.every((url) => url.includes("/download/v0.1.0/"))).toBe(true);
    expect(await installer.get(61_000)).toMatchObject({ script: script("0.2.0"), version: "0.2.0" });
  });

  test("a network failure keeps the last good copy and is retried", async () => {
    const github = fakeGitHub({ latest: "v0.2.0", releases: { "v0.2.0": release("0.2.0") } });
    const { source: installer } = source(github);
    await installer.get(0);

    github.state.latest = new Error("getaddrinfo ENOTFOUND github.test");
    expect(await installer.get(61_000)).toMatchObject({ script: script("0.2.0"), origin: "cache" });
    expect(installer.health()).toMatchObject({
      state: "stale",
      lastCheck: { ok: false, error: { kind: "unreachable" } },
    });

    // Not retried on every request, but well before another cache period is over.
    const calls = github.urls.length;
    await installer.get(70_000);
    expect(github.urls).toHaveLength(calls);

    github.state.latest = "v0.2.0";
    expect((await installer.get(91_000))?.origin).toBe("release");
    expect(installer.health().state).toBe("ok");
  });

  test("a download that fails halfway keeps the last good copy", async () => {
    const github = fakeGitHub({ latest: "v0.2.0", releases: { "v0.2.0": release("0.2.0") } });
    const { source: installer } = source(github);
    await installer.get(0);

    github.state.releases["v0.3.0"] = { ...release("0.3.0"), "install.sh": new Error("connection reset") };
    github.state.latest = "v0.3.0";
    expect(await installer.get(61_000)).toMatchObject({ version: "0.2.0", origin: "cache" });
    expect(installer.health().lastCheck).toMatchObject({ tag: "v0.3.0", error: { kind: "unreachable" } });
  });

  test("with nothing verified, a network failure leaves nothing to serve", async () => {
    const { source: installer } = source(fakeGitHub({ latest: new Error("offline"), releases: {} }));
    expect(await installer.get(0)).toBeNull();
    expect(installer.health()).toMatchObject({ state: "failing", lastCheck: { error: { kind: "unreachable" } } });
  });

  test("never serves something that isn't a script, signed or not", async () => {
    const html = "<html>Not Found</html>";
    const github = fakeGitHub({ latest: "v0.2.0", releases: { "v0.2.0": release("0.2.0", { script: html }) } });
    const { source: installer } = source(github);
    expect(await installer.get(0)).toBeNull();
    expect(errorOf(installer)).toContain("does not start with #!");
  });

  test("refuses a tag that is not a version, an oversized script and a size mismatch", async () => {
    const badTag = source(fakeGitHub({ latest: "..%2F..%2Fevil", releases: {} })).source;
    expect(await badTag.get(0)).toBeNull();
    expect(errorOf(badTag)).toContain("names no release tag");

    const big = `#!/bin/sh\n${"#".repeat(1024 * 1024)}\n`;
    const huge = source(
      fakeGitHub({ latest: "v0.2.0", releases: { "v0.2.0": release("0.2.0", { script: big }) } }),
    ).source;
    expect(await huge.get(0)).toBeNull();
    expect(errorOf(huge)).toContain("larger than");

    const body = script("0.2.0");
    const manifest = { schema: 1, version: "0.2.0", installer: { sha256: sha256(body), size: 3 } };
    const sized = source(
      fakeGitHub({ latest: "v0.2.0", releases: { "v0.2.0": release("0.2.0", { manifest }) } }),
    ).source;
    expect(await sized.get(0)).toBeNull();
    expect(errorOf(sized)).toContain("bytes, but the signed manifest says 3");
  });

  test("concurrent requests share one check", async () => {
    const github = fakeGitHub({ latest: "v0.2.0", releases: { "v0.2.0": release("0.2.0") } });
    const { source: installer } = source(github);
    const results = await Promise.all([installer.get(0), installer.get(0), installer.get(0)]);
    expect(results.map((r) => r?.version)).toEqual(["0.2.0", "0.2.0", "0.2.0"]);
    expect(github.urls).toHaveLength(4);
  });

  test("falls back to the local file while nothing is verified", async () => {
    const localPath = `${import.meta.dir}/fixtures/install.sh`;
    const github = fakeGitHub({ latest: new Error("offline"), releases: {} });
    expect(await source(github, { localPath }).source.get(0)).toMatchObject({ origin: "local", version: null });
  });

  test("the real v0.1.1 manifest verifies with the release key in brand.json", async () => {
    const dir = `${import.meta.dir}/fixtures/release-v0.1.1`;
    const bytes = await Bun.file(`${dir}/manifest.json`).bytes();
    const signature = await Bun.file(`${dir}/manifest.json.minisig`).text();
    expect(verifyMinisign(brand.minisignPublicKey, bytes, signature)).toBe("seylo 0.1.1 manifest.json");

    const manifest = JSON.parse(new TextDecoder().decode(bytes)) as { version: string; installer: { sha256: string } };
    expect(manifest.version).toBe("0.1.1");
    expect(manifest.installer.sha256).toMatch(/^[0-9a-f]{64}$/);

    // One flipped bit and it no longer verifies.
    const tampered = new Uint8Array(bytes);
    tampered[10] = tampered[10]! ^ 1;
    expect(() => verifyMinisign(brand.minisignPublicKey, tampered, signature)).toThrow("signature does not match");
  });
});

describe("installer routes", () => {
  const verified: InstallerSource = {
    get: async () => ({ script: "#!/bin/sh\n", origin: "release", version: "0.2.0", sha256: "ab".repeat(32) }),
    health: () => ({ state: "ok", serving: null, lastCheck: null }),
  };

  test("serves / on the install host with its release and hash, and 503 with nothing to serve", async () => {
    const { app } = await testApp({ installer: verified });
    const response = await app.handle(new Request("http://install.site.test/"));
    expect(await response.text()).toBe("#!/bin/sh\n");
    expect(response.headers.get("x-installer-version")).toBe("0.2.0");
    expect(response.headers.get("x-installer-sha256")).toBe("ab".repeat(32));
    expect((await (await testApp()).app.handle(request("/install.sh"))).status).toBe(503);
  });

  test("/healthz stays 200 while a good copy is served and reports the failed check", async () => {
    const withState = (state: InstallerHealth["state"]): InstallerSource => ({
      get: async () => null,
      health: () => ({
        state,
        serving: null,
        lastCheck: {
          at: new Date(0).toISOString(),
          ok: false,
          tag: "v0.2.0",
          error: { kind: "rejected", message: "bad" },
        },
      }),
    });

    const stale = await (await testApp({ installer: withState("stale") })).app.handle(request("/healthz"));
    expect(stale.status).toBe(200);
    expect(await stale.json()).toMatchObject({
      status: "degraded",
      installer: { state: "stale", lastCheck: { error: { kind: "rejected" } } },
    });

    const failing = await (await testApp({ installer: withState("failing") })).app.handle(request("/healthz"));
    expect(failing.status).toBe(503);

    const fresh = await (await testApp()).app.handle(request("/healthz"));
    expect(fresh.status).toBe(200);
    expect(await fresh.json()).toMatchObject({ status: "ok", installer: { state: "pending" } });
  });
});
