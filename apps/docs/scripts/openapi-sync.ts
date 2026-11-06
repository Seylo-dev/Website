// Refreshes openapi.json, the panel's OpenAPI document that the API reference is built from.
//
//   bun run openapi:sync                     the latest release's openapi.json from the app repo
//   bun run openapi:sync --from <path>       a local file, for example ../App/openapi.json
//
// The file is committed, so `bun run build` never needs the network. It is only replaced when the
// new document parses and looks like the panel's API.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import brand from "../../../brand/brand.json";

const releaseUrl = `https://github.com/${brand.github.repo}/releases/latest/download/openapi.json`;
const out = resolve(import.meta.dirname, "../openapi.json");

function usage(): never {
  console.error("usage: bun run openapi:sync [--from <path to openapi.json>]");
  process.exit(1);
}

async function load(args: string[]): Promise<{ text: string; from: string }> {
  if (args.length === 0) {
    const res = await fetch(releaseUrl, { redirect: "follow" });
    if (!res.ok) {
      console.error(`openapi:sync: ${releaseUrl} answered ${res.status}.`);
      console.error("Use --from <path> with a checkout of the app repo, or a release that carries openapi.json.");
      process.exit(1);
    }
    return { text: await res.text(), from: releaseUrl };
  }
  if (args[0] === "--from" && args[1] && args.length === 2) {
    const path = resolve(args[1]);
    return { text: readFileSync(path, "utf8"), from: path };
  }
  usage();
}

const { text, from } = await load(process.argv.slice(2));

let doc: { openapi?: unknown; paths?: unknown; info?: { version?: unknown } };
try {
  doc = JSON.parse(text);
} catch {
  console.error(`openapi:sync: ${from} is not JSON.`);
  process.exit(1);
}
if (typeof doc.openapi !== "string" || typeof doc.paths !== "object" || doc.paths === null) {
  console.error(`openapi:sync: ${from} is not an OpenAPI document (no "openapi" or "paths").`);
  process.exit(1);
}

writeFileSync(out, text);
const methods = new Set(["get", "put", "post", "delete", "options", "head", "patch", "trace"]);
const operations = Object.values(doc.paths as Record<string, object>).reduce(
  (n, item) => n + Object.keys(item).filter((key) => methods.has(key)).length,
  0,
);
console.log(`wrote ${out} from ${from} (${operations} operations, version ${String(doc.info?.version ?? "?")})`);
