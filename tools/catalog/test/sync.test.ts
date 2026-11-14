import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CatalogError } from "../catalog";
import { officialUrl, outputs, parseArgs, type SyncOptions, sync } from "../sync";
import { catalogJson, makeKey, svg, type TemplateSpec, webp } from "./helpers";

const url = "https://github.com/Seylo-dev/Templates/releases/download/catalog/catalog.json";
const key = makeKey();
let root: string;
let lines: string[];

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "catalog-sync-"));
  lines = [];
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

/** A fetch that serves catalog.json and its signature, and counts the calls. */
function server(files: Record<string, Uint8Array | string | Response | Error>) {
  const calls: string[] = [];
  const fetch = async (requested: string) => {
    calls.push(requested);
    const file = files[requested];
    if (file instanceof Error) throw file;
    if (file instanceof Response) return file;
    if (file === undefined) return new Response("Not Found", { status: 404 });
    return new Response(typeof file === "string" ? file : new Uint8Array(file));
  };
  return { fetch, calls };
}

function signed(templates: TemplateSpec[], overrides: Record<string, unknown> = {}, signer = key) {
  const bytes = catalogJson(templates, overrides);
  return { [url]: bytes, [`${url}.minisig`]: signer.sign(bytes) };
}

const options = (fetch: SyncOptions["fetch"], extra: Partial<SyncOptions> = {}): SyncOptions => ({
  root,
  url,
  publicKey: key.publicKey,
  source: "Seylo-dev/Templates",
  fetch,
  log: (line) => lines.push(line),
  ...extra,
});

const read = (path: string) => readFileSync(join(root, path), "utf8");
const landing = () => JSON.parse(read(outputs.landing)) as { sequence: number; templates: { slug: string }[] };

/** What the committed copy holds before a run: a catalog at sequence 10 with one logo. */
async function committed() {
  const { fetch } = server(signed([{ slug: "old", name: "Old", logo: { file: "logo.svg", bytes: svg() } }]));
  await sync(options(fetch));
  return { json: read(outputs.landing), docs: read(outputs.docs), logo: read(`${outputs.logos}/old/logo.svg`) };
}

describe("sync", () => {
  test("downloads, verifies and writes the landing list, the logos and credits, and the docs table", async () => {
    const { fetch, calls } = server(
      signed([
        { slug: "beta", name: "Beta", logo: { file: "logo.webp", bytes: webp() } },
        { slug: "alpha", name: "Alpha", category: "CMS", logo: { file: "logo.svg", bytes: svg() } },
        { slug: "gamma", name: "Gamma" },
      ]),
    );
    const result = await sync(options(fetch));
    expect(result).toEqual({ written: true, sequence: 10, commit: "a".repeat(40), count: 3, unsigned: false });
    expect(calls).toEqual([url, `${url}.minisig`]);

    const data = JSON.parse(read(outputs.landing));
    expect(data).toMatchObject({ source: "Seylo-dev/Templates", sequence: 10, commit: "a".repeat(40) });
    expect(data.templates).toEqual([
      expect.objectContaining({ slug: "alpha", name: "Alpha", category: "CMS", logo: "/templates/alpha/logo.svg" }),
      expect.objectContaining({ slug: "beta", logo: "/templates/beta/logo.webp" }),
      expect.objectContaining({ slug: "gamma", logo: null, monogram: "GA" }),
    ]);
    expect(read(`${outputs.logos}/alpha/logo.svg`)).toBe(svg());
    expect(readdirSync(join(root, outputs.logos)).sort()).toEqual([
      "LICENSE.dashboard-icons",
      "NOTICE",
      "alpha",
      "beta",
    ]);
    expect(read(`${outputs.logos}/NOTICE`)).toContain("templates/alpha/logo.svg");
    expect(read(`${outputs.logos}/LICENSE.dashboard-icons`)).toBe("Apache License\n");
    expect(read(outputs.docs)).toContain("The official catalog has 3 templates in 2 categories:");
    // Nothing left behind next to the app.
    expect(readdirSync(join(root, "apps/landing")).filter((name) => name.startsWith(".catalog-"))).toEqual([]);
  });

  test("a newer catalog replaces the logo folder whole", async () => {
    await committed();
    const { fetch } = server(signed([{ slug: "new", logo: { file: "logo.svg", bytes: svg() } }], { sequence: 11 }));
    await sync(options(fetch));
    expect(existsSync(join(root, outputs.logos, "old"))).toBe(false);
    expect(existsSync(join(root, outputs.logos, "new/logo.svg"))).toBe(true);
    expect(landing().templates.map((t) => t.slug)).toEqual(["new"]);
  });

  test.each([
    ["signed with another key", () => signed([{ slug: "evil" }], { sequence: 11 }, makeKey()), /different key/],
    [
      "with a changed file",
      () => {
        const files = signed([{ slug: "evil" }], { sequence: 11 });
        return { ...files, [url]: catalogJson([{ slug: "evil", name: "Evil" }], { sequence: 11 }) };
      },
      /does not match/,
    ],
    ["without a signature", () => ({ [url]: catalogJson([{ slug: "evil" }], { sequence: 11 }) }), /404/],
    ["older than the committed copy", () => signed([{ slug: "evil" }], { sequence: 9 }), /older than the committed/],
    ["from another source", () => signed([{ slug: "evil" }], { sequence: 11, source: "someone/else" }), /someone/],
    ["in another format", () => signed([{ slug: "evil" }], { sequence: 11, format: 2 }), /format 2/],
    ["not published yet", () => ({}), /answered 404/],
    ["unreachable", () => ({ [url]: new TypeError("fetch failed") }), /Could not reach .*fetch failed/],
    [
      "too large",
      () => ({ [url]: new Response("{}", { headers: { "content-length": String(21 * 1024 * 1024) } }) }),
      /over 20971520 bytes/,
    ],
  ])("refuses a catalog %s: --soft keeps the committed copy", async (_, files, reason) => {
    const before = await committed();
    const { fetch } = server(files());

    await expect(sync(options(fetch))).rejects.toThrow(reason);
    const result = await sync(options(fetch, { soft: true }));
    expect(result).toEqual({ written: false, reason: expect.stringMatching(reason) });
    expect(lines.at(-1)).toMatch(/^catalog: kept the committed copy\. /);
    expect(read(outputs.landing)).toBe(before.json);
    expect(read(outputs.docs)).toBe(before.docs);
    expect(read(`${outputs.logos}/old/logo.svg`)).toBe(before.logo);
  });

  test("a download that breaks off mid-body is a catalog problem: --soft keeps the committed copy", async () => {
    const before = await committed();
    // A fresh body for every request, each one failing after the headers came.
    const breaking = () =>
      new Response(new ReadableStream({ pull: (controller) => controller.error(new TypeError("socket closed")) }));
    const { fetch } = server({});
    const get = async (requested: string) => (requested === url ? breaking() : fetch(requested));

    const error = await sync(options(get)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CatalogError);
    expect((error as Error).message).toBe(`The download of ${url} broke off: socket closed`);
    const result = await sync(options(get, { soft: true }));
    expect(result).toEqual({ written: false, reason: `The download of ${url} broke off: socket closed` });
    expect(lines.at(-1)).toMatch(/^catalog: kept the committed copy\. The download of /);
    expect(read(outputs.landing)).toBe(before.json);
    expect(read(outputs.docs)).toBe(before.docs);
    expect(read(`${outputs.logos}/old/logo.svg`)).toBe(before.logo);
  });

  test("the same sequence again is fine", async () => {
    await committed();
    const { fetch } = server(signed([{ slug: "again" }]));
    expect(await sync(options(fetch))).toMatchObject({ written: true, sequence: 10 });
  });

  test("refuses a redirect away from https", async () => {
    const redirected = new Response("{}");
    Object.defineProperty(redirected, "url", { value: "http://mirror.example.com/catalog.json" });
    const { fetch } = server({ [url]: redirected });
    await expect(sync(options(fetch))).rejects.toThrow(/redirected to http:/);
  });

  test("a bug is not hidden by --soft", async () => {
    const fetch = async () => {
      throw new CatalogError("x");
    };
    // A CatalogError from fetch itself is a network problem: soft.
    expect(await sync(options(fetch, { soft: true }))).toMatchObject({ written: false });
    // Anything that is not a catalog problem fails the build.
    const broken = { ...options(server(signed([{ slug: "a" }])).fetch, { soft: true }), root: "/dev/null/nowhere" };
    await expect(sync(broken)).rejects.toThrow();
  });

  describe("with a placeholder instead of a key in brand.json", () => {
    const placeholder = "PLACEHOLDER_TEMPLATES_MINISIGN_PUBLIC_KEY";

    test("downloads nothing, and --soft keeps the committed copy", async () => {
      const { fetch, calls } = server(signed([{ slug: "alpha" }]));
      await expect(sync(options(fetch, { publicKey: placeholder }))).rejects.toThrow(/not a minisign key,/);
      expect(await sync(options(fetch, { publicKey: placeholder, soft: true }))).toMatchObject({ written: false });
      expect(calls).toEqual([]);
      expect(existsSync(join(root, outputs.landing))).toBe(false);
    });

    test("--local writes an unsigned copy, with a warning", async () => {
      const file = join(root, "catalog.json");
      writeFileSync(file, catalogJson([{ slug: "alpha" }]));
      const result = await sync(options(undefined, { publicKey: placeholder, local: { catalog: file } }));
      expect(result).toMatchObject({ written: true, unsigned: true });
      expect(lines).toContain("catalog: warning: brand.json has no catalog key; this copy is not verified");
    });
  });

  describe("--local once the key is set", () => {
    test("verifies the .minisig next to the file", async () => {
      const file = join(root, "catalog.json");
      const bytes = catalogJson([{ slug: "alpha" }]);
      writeFileSync(file, bytes);
      writeFileSync(`${file}.minisig`, key.sign(bytes));
      expect(await sync(options(undefined, { local: { catalog: file } }))).toMatchObject({ unsigned: false });
    });

    test("refuses a file without a signature", async () => {
      const file = join(root, "catalog.json");
      writeFileSync(file, catalogJson([{ slug: "alpha" }]));
      await expect(sync(options(undefined, { local: { catalog: file } }))).rejects.toThrow(/no signature/);
    });

    test("takes --signature from elsewhere", async () => {
      mkdirSync(join(root, "sig"));
      const file = join(root, "catalog.json");
      const bytes = catalogJson([{ slug: "alpha" }]);
      writeFileSync(file, bytes);
      writeFileSync(join(root, "sig/s"), makeKey().sign(bytes));
      await expect(
        sync(options(undefined, { local: { catalog: file, signature: join(root, "sig/s") } })),
      ).rejects.toThrow(/different key/);
    });
  });
});

describe("the command line", () => {
  test("parses its flags", () => {
    expect(parseArgs([])).toEqual({ soft: false });
    expect(parseArgs(["--soft"])).toEqual({ soft: true });
    expect(parseArgs(["--local", "c.json"])).toEqual({ soft: false, local: { catalog: "c.json" } });
    expect(parseArgs(["--local", "c.json", "--signature", "s"])).toEqual({
      soft: false,
      local: { catalog: "c.json", signature: "s" },
    });
  });

  test.each([[["--soft", "--local", "c.json"]], [["--signature", "s"]], [["--local"]], [["--force"]]])(
    "refuses %j",
    (args) => {
      expect(() => parseArgs(args)).toThrow(/usage/);
    },
  );

  test("downloads the official catalog from the Templates repo's catalog release", () => {
    expect(officialUrl).toBe(url);
  });
});
