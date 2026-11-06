// Writes apps/landing/lib/templates.ts from the panel's templates/*/meta.yaml, with the same
// monogram (initials and tile color from the slug) the panel generates in modules/templates/logo.ts.
//
//   bun run catalog.ts      SEYLO_DIR: the panel's checkout (default ../../../seylo, next to this repo)
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(resolve(process.env.SEYLO_DIR ?? join(here, "../../../seylo")), "templates");
const out = join(here, "../../apps/landing/lib/templates.ts");
const tiles = [
  "#2563EB",
  "#7C3AED",
  "#DB2777",
  "#DC2626",
  "#EA580C",
  "#CA8A04",
  "#16A34A",
  "#0D9488",
  "#0891B2",
  "#4F46E5",
  "#9333EA",
  "#475569",
];
function initials(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/[\s-]+/)
    .filter(Boolean);
  const letters =
    words.length >= 2
      ? `${[...(words[0] ?? "")][0] ?? ""}${[...(words[1] ?? "")][0] ?? ""}`
      : [...(words[0] ?? "?")].slice(0, 2).join("");
  return (letters || "?").toUpperCase();
}
const field = (yaml: string, key: string) => {
  const m = new RegExp(`^${key}:\\s*"?(.*?)"?\\s*$`, "m").exec(yaml);
  if (!m) throw new Error(`no ${key}`);
  return m[1] as string;
};
const list = readdirSync(dir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => {
    const yaml = readFileSync(join(dir, d.name, "meta.yaml"), "utf8");
    const name = field(yaml, "name");
    const index = createHash("sha256").update(d.name).digest()[0] ?? 0;
    return {
      slug: d.name,
      name,
      category: field(yaml, "category"),
      creates: field(yaml, "creates"),
      monogram: initials(name),
      color: tiles[index % tiles.length],
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
const body = `// The template catalog that ships with the panel (Seylo-dev/App templates/*/meta.yaml), in the
// order the panel's Templates page lists it. Monogram and color follow the panel's generated logos
// (apps/panel/src/modules/templates/logo.ts): initials of the name, tile color picked from the slug.
// Regenerate with tools/hero-shot/catalog.ts when the catalog changes.

export interface CatalogTemplate {
  slug: string;
  name: string;
  category: string;
  creates: string;
  monogram: string;
  color: string;
}

export const catalog: CatalogTemplate[] = ${JSON.stringify(list, null, 2).replace(/"(\w+)":/g, "$1:")};
`;
writeFileSync(out, body);
console.log(list.length, "templates");
