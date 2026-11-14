// The committed copy and how the landing and the docs use it.

import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import landingConfig from "../../../apps/landing/next.config";
import { catalog as landingCatalog, namesOf } from "../../../apps/landing/lib/templates";
import { docsSnippet, logoFiles, logoProblem, type SiteCatalog, slugPattern } from "../catalog";
import { outputs, repoRoot } from "../sync";

const committed = JSON.parse(readFileSync(join(repoRoot, outputs.landing), "utf8")) as SiteCatalog;
const logos = join(repoRoot, outputs.logos);

describe("the committed copy", () => {
  test("has templates, each with a safe slug", () => {
    expect(committed.templates.length).toBeGreaterThan(0);
    for (const t of committed.templates) expect(t.slug).toMatch(slugPattern);
  });

  test("the docs table was written from the same catalog", () => {
    expect(readFileSync(join(repoRoot, outputs.docs), "utf8")).toBe(docsSnippet(committed));
  });

  test("the logo folder holds exactly the listed logos, the NOTICE and the licenses", () => {
    const listed = committed.templates.flatMap((t) => (t.logo ? [t.logo.replace(/^\/templates\//, "")] : []));
    const onDisk = readdirSync(logos, { recursive: true, encoding: "utf8" })
      .filter((path) => statSync(join(logos, path)).isFile())
      .filter((path) => path !== "NOTICE" && !path.startsWith("LICENSE."));
    expect(onDisk.sort()).toEqual(listed.sort());
    const notice = readFileSync(join(logos, "NOTICE"), "utf8");
    for (const path of listed) {
      expect(notice).toContain(`templates/${path}`);
      const file = path.split("/")[1] as (typeof logoFiles)[number];
      expect(logoProblem(file, new Uint8Array(readFileSync(join(logos, path))))).toBeNull();
    }
    expect(readdirSync(logos).filter((name) => name.startsWith("LICENSE.")).length).toBeGreaterThan(0);
  });
});

describe("the landing", () => {
  test("lists the committed catalog", () => {
    expect(landingCatalog).toEqual(committed.templates);
  });

  test("names only templates the catalog has, in the order asked", () => {
    const list = [
      { slug: "b", name: "Bee", category: "", creates: "", monogram: "B", color: "#000", logo: null },
      { slug: "a", name: "Ay", category: "", creates: "", monogram: "A", color: "#000", logo: null },
    ];
    expect(namesOf(["a", "gone", "b"], list)).toEqual(["Ay", "Bee"]);
    expect(namesOf(["gone"], list)).toEqual([]);
  });

  test("serves the logos with a sandbox CSP and nosniff", async () => {
    const rules = (await landingConfig.headers?.()) ?? [];
    const rule = rules.find((r) => r.source === "/templates/:path*");
    expect(rule?.headers).toEqual([
      { key: "Content-Security-Policy", value: "default-src 'none'; style-src 'unsafe-inline'; sandbox" },
      { key: "X-Content-Type-Options", value: "nosniff" },
    ]);
  });
});

describe("the builds", () => {
  test.each(["apps/landing", "apps/docs"])("%s syncs the catalog before building, softly", (app) => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, app, "package.json"), "utf8"));
    expect(pkg.scripts.prebuild).toBe("bun ../../tools/catalog/sync.ts --soft");
    expect(existsSync(resolve(repoRoot, app, "../../tools/catalog/sync.ts"))).toBe(true);
  });

  test("the Templates guide includes the generated table", () => {
    const page = join(repoRoot, "apps/docs/content/docs/guides/templates.mdx");
    const include = /<include>(.+?)<\/include>/.exec(readFileSync(page, "utf8"))?.[1];
    expect(include && resolve(dirname(page), include)).toBe(join(repoRoot, outputs.docs));
  });
});
