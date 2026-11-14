import { describe, expect, test } from "bun:test";
import {
  CatalogError,
  docsSnippet,
  initials,
  isMinisignPublicKey,
  logoProblem,
  mdxText,
  noticeFile,
  parseCatalog,
  siteCatalog,
  tileColor,
  verifyMinisign,
} from "../catalog";
import { catalogJson, makeKey, svg, webp } from "./helpers";

const message = new TextEncoder().encode('{"format":1}');

describe("verifyMinisign", () => {
  const key = makeKey();

  test("accepts minisign's prehashed signatures and returns the trusted comment", () => {
    expect(verifyMinisign(key.publicKey, message, key.sign(message, { trusted: "seq=4" }))).toBe("seq=4");
  });

  test("accepts legacy signatures", () => {
    expect(verifyMinisign(key.publicKey, message, key.sign(message, { legacy: true }))).toContain("catalog.json");
  });

  test("refuses another key", () => {
    expect(() => verifyMinisign(makeKey().publicKey, message, key.sign(message))).toThrow(/different key/);
  });

  test("refuses a changed file", () => {
    const changed = new TextEncoder().encode('{"format":2}');
    expect(() => verifyMinisign(key.publicKey, changed, key.sign(message))).toThrow(/does not match/);
  });

  test("refuses a changed trusted comment", () => {
    const lines = key.sign(message, { trusted: "seq=4" }).split("\n");
    lines[2] = "trusted comment: seq=9";
    expect(() => verifyMinisign(key.publicKey, message, lines.join("\n"))).toThrow(/trusted comment/);
  });

  test("refuses a malformed signature or key", () => {
    expect(() => verifyMinisign(key.publicKey, message, "not a signature")).toThrow(CatalogError);
    expect(() => verifyMinisign("PLACEHOLDER", message, key.sign(message))).toThrow(/malformed/);
  });

  test("a placeholder is not a key", () => {
    expect(isMinisignPublicKey("PLACEHOLDER_TEMPLATES_MINISIGN_PUBLIC_KEY")).toBe(false);
    expect(isMinisignPublicKey(key.publicKey)).toBe(true);
  });
});

describe("logoProblem", () => {
  const bytes = (s: string) => new TextEncoder().encode(s);

  test("passes plain SVGs, WebP and PNG files", () => {
    expect(logoProblem("logo.svg", bytes(svg('<use href="#a"/>')))).toBeNull();
    expect(logoProblem("logo.webp", webp())).toBeNull();
    expect(logoProblem("logo.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBeNull();
  });

  test.each([
    ["a script", "<script>alert(1)</script>"],
    ["an event handler", '<rect onload="alert(1)"/>'],
    ["a foreignObject", "<foreignObject></foreignObject>"],
    ["an embedded image", '<image href="x.png"/>'],
    ["an external link", '<a href="https://example.com"><rect/></a>'],
    ["a javascript link", '<a xlink:href="javascript:alert(1)"><rect/></a>'],
  ])("refuses an SVG with %s", (_, body) => {
    expect(logoProblem("logo.svg", bytes(svg(body)))).toMatch(/script|handler|foreignObject|image|link/);
  });

  test("refuses files that are not what they say or too large", () => {
    expect(logoProblem("logo.svg", bytes("<html></html>"))).toBe("not an SVG");
    expect(logoProblem("logo.webp", bytes(svg()))).toBe("not a WebP file");
    expect(logoProblem("logo.png", webp())).toBe("not a PNG file");
    expect(logoProblem("logo.svg", bytes(svg(" ".repeat(50_001))))).toMatch(/over 50000/);
    expect(logoProblem("logo.webp", new Uint8Array(30_001))).toMatch(/over 30000/);
  });
});

describe("parseCatalog", () => {
  test("reads the templates, their logos and the credits", () => {
    const catalog = parseCatalog(
      catalogJson([{ slug: "alpha", name: "Alpha", logo: { file: "logo.svg", bytes: svg() } }, { slug: "beta" }]),
    );
    expect(catalog.sequence).toBe(10);
    expect(catalog.templates.map((t) => [t.slug, t.name, t.logo?.file ?? null])).toEqual([
      ["alpha", "Alpha", "logo.svg"],
      ["beta", "beta", null],
    ]);
    expect(catalog.licenses).toEqual({ "LICENSE.dashboard-icons": "Apache License\n" });
    expect(catalog.warnings).toEqual([]);
  });

  test("refuses another format", () => {
    expect(() => parseCatalog(catalogJson([], { format: 2 }))).toThrow(/format 2/);
  });

  test("refuses a file that does not match its sha256", () => {
    const bytes = catalogJson([{ slug: "alpha" }], {}, (value) => {
      const [t] = value.templates as { files: Record<string, { text: string }> }[];
      (t as { files: Record<string, { text: string }> }).files["index.ts"]!.text = "export const x = 1;";
    });
    expect(() => parseCatalog(bytes)).toThrow("templates/alpha/index.ts does not match its sha256.");
  });

  test("refuses a duplicate slug, a missing sequence and a license name that is a path", () => {
    expect(() => parseCatalog(catalogJson([{ slug: "alpha" }, { slug: "Alpha" }]))).toThrow(/twice/);
    expect(() => parseCatalog(catalogJson([], { sequence: -1 }))).toThrow(/sequence/);
    expect(() => parseCatalog(catalogJson([], { licenses: { "../../app/page.tsx": "x" } }))).toThrow(/license file/);
    expect(() => parseCatalog(new TextEncoder().encode("<html>"))).toThrow(/not valid JSON/);
  });

  test("leaves out a template whose slug is not a safe file name", () => {
    const catalog = parseCatalog(
      catalogJson([{ slug: "../../app", logo: { file: "logo.svg", bytes: svg() } }, { slug: "beta" }]),
    );
    expect(catalog.templates.map((t) => t.slug)).toEqual(["beta"]);
    expect(catalog.warnings).toEqual(["templates/../../app: left out, not a valid template name"]);
  });

  test("keeps a template whose logo is unsafe, without the logo", () => {
    const catalog = parseCatalog(
      catalogJson([{ slug: "alpha", logo: { file: "logo.svg", bytes: svg("<script>alert(1)</script>") } }]),
    );
    expect(catalog.templates[0]?.logo).toBeNull();
    expect(catalog.warnings[0]).toMatch(/^templates\/alpha\/logo\.svg: left out, has a script/);
  });

  test("falls back for missing names and categories", () => {
    const catalog = parseCatalog(
      catalogJson([{ slug: "alpha" }], {}, (value) => {
        const t = (value.templates as Record<string, unknown>[])[0] as Record<string, unknown>;
        delete t.name;
        delete t.category;
      }),
    );
    expect(catalog.templates[0]).toMatchObject({ name: "alpha", category: "Other" });
  });
});

describe("what the site shows", () => {
  test("letter tiles keep the initials and colors the landing had", () => {
    expect([initials("Appsmith"), tileColor("appsmith")]).toEqual(["AP", "#16A34A"]);
    expect([initials("code-server"), tileColor("code-server")]).toEqual(["CS", "#2563EB"]);
    expect([initials("Directus"), tileColor("directus")]).toEqual(["DI", "#EA580C"]);
    expect(initials("Plausible Analytics")).toBe("PA");
    expect(initials("***")).toBe("?");
  });

  test("lists templates by name, ignoring case, with their logo paths", () => {
    const site = siteCatalog(
      parseCatalog(
        catalogJson([
          { slug: "zeta", name: "Zeta" },
          { slug: "alpha", name: "alpha", logo: { file: "logo.webp", bytes: webp() } },
          { slug: "beta", name: "Beta" },
        ]),
      ),
    );
    expect(site.templates.map((t) => t.name)).toEqual(["alpha", "Beta", "Zeta"]);
    expect(site.templates.map((t) => t.logo)).toEqual(["/templates/alpha/logo.webp", null, null]);
    expect(site).toMatchObject({ sequence: 10, source: "Seylo-dev/Templates" });
  });

  test("the docs table counts templates and categories and escapes MDX", () => {
    const site = siteCatalog(
      parseCatalog(
        catalogJson([
          { slug: "alpha", name: "Alpha <b>{x}</b>", category: "CMS", creates: "App | Postgres" },
          { slug: "beta", name: "Beta", category: "CMS" },
          { slug: "gamma", name: "Gamma", category: "Monitoring" },
        ]),
      ),
    );
    const snippet = docsSnippet(site);
    expect(snippet).toContain("The official catalog has 3 templates in 2 categories:");
    expect(snippet).toContain("| Alpha \\<b\\>\\{x\\}\\</b\\> | CMS | App \\| Postgres |");
    expect(snippet).toContain("| Gamma | Monitoring | App |");
    expect(docsSnippet({ ...site, templates: site.templates.slice(0, 1) })).toContain("1 template in 1 category:");
  });

  test("mdxText leaves plain names alone", () => {
    expect(mdxText("Uptime Kuma")).toBe("Uptime Kuma");
    expect(mdxText("a\nb")).toBe("a b");
  });

  test("NOTICE keeps the catalog's credits", () => {
    const catalog = parseCatalog(catalogJson([]));
    const notice = noticeFile(catalog);
    expect(notice).toContain("templates/alpha/logo.svg   svg/alpha.svg");
    expect(notice).toContain(`commit\n${"a".repeat(40)}`);
  });
});
