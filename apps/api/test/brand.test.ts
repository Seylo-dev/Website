import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import brand from "../../../brand/brand.json";

// The docs print the release key for checking downloads by hand, in plain MDX code blocks that can't
// read brand.json. This keeps them in step with the key the installer endpoint checks against.
const docs = resolve(import.meta.dir, "../../docs/content/docs");

describe("release key", () => {
  test("brand.json has a minisign public key", () => {
    expect(brand.minisignPublicKey).toMatch(/^RW[A-Za-z0-9+/]{54}$/);
  });

  test.each(["security.mdx", "guides/command-line.mdx"])("docs/%s prints the key from brand.json", async (page) => {
    const text = await Bun.file(`${docs}/${page}`).text();
    const keys = text.match(/RW[A-Za-z0-9+/]{54}/g) ?? [];
    expect(keys.length).toBeGreaterThan(0);
    expect(new Set(keys)).toEqual(new Set([brand.minisignPublicKey]));
  });
});
