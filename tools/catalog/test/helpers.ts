// Test catalogs and minisign keys. Keys are made per test run and never written anywhere.

import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";

export interface TestKey {
  publicKey: string;
  sign(message: Uint8Array, options?: { trusted?: string; legacy?: boolean }): string;
}

/** A minisign key pair: the "RW..." public key and a signer that writes .minisig files. */
export function makeKey(): TestKey {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw = Buffer.from(publicKey.export({ format: "jwk" }).x as string, "base64url");
  const keyId = randomBytes(8);
  return {
    publicKey: Buffer.concat([Buffer.from("Ed"), keyId, raw]).toString("base64"),
    sign(message, { trusted = "timestamp:1763100000\tfile:catalog.json\thashed", legacy = false } = {}) {
      const signed = legacy ? Buffer.from(message) : createHash("blake2b512").update(message).digest();
      const sig = sign(null, signed, privateKey);
      const global = sign(null, Buffer.concat([sig, Buffer.from(trusted)]), privateKey);
      return [
        "untrusted comment: signature from minisign secret key",
        Buffer.concat([Buffer.from(legacy ? "Ed" : "ED"), keyId, sig]).toString("base64"),
        `trusted comment: ${trusted}`,
        global.toString("base64"),
        "",
      ].join("\n");
    },
  };
}

const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export const svg = (body = '<rect width="10" height="10"/>') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${body}</svg>`;
export const webp = () =>
  new Uint8Array([...Buffer.from("RIFF"), 4, 0, 0, 0, ...Buffer.from("WEBP"), ...Buffer.from("VP8 ")]);

export interface TemplateSpec {
  slug: string;
  name?: string;
  category?: string;
  creates?: string;
  description?: string;
  logo?: { file: string; bytes: Uint8Array | string };
}

/** A format-1 catalog file, built the way check-templates.ts --emit builds one. */
export function catalogJson(
  templates: TemplateSpec[],
  overrides: Record<string, unknown> = {},
  edit?: (value: Record<string, unknown>) => void,
): Uint8Array {
  const value: Record<string, unknown> = {
    format: 1,
    source: "Seylo-dev/Templates",
    commit: "a".repeat(40),
    sequence: 10,
    generatedAt: "2026-11-14T10:00:00.000Z",
    notice: "App logos\n\n  templates/alpha/logo.svg   svg/alpha.svg\n",
    licenses: { "LICENSE.dashboard-icons": "Apache License\n" },
    templates: templates.map((t) => {
      const files: Record<string, unknown> = {};
      for (const [name, content] of [
        ["meta.yaml", `name: "${t.name ?? t.slug}"\n`],
        ["index.ts", "export function generate() { return { services: [] }; }\n"],
      ] as const)
        files[name] = { sha256: sha(new TextEncoder().encode(content)), text: content };
      if (t.logo) {
        const bytes = typeof t.logo.bytes === "string" ? new TextEncoder().encode(t.logo.bytes) : t.logo.bytes;
        files[t.logo.file] = { sha256: sha(bytes), base64: Buffer.from(bytes).toString("base64") };
      }
      return {
        slug: t.slug,
        minPanel: null,
        name: t.name ?? t.slug,
        description: t.description ?? `The ${t.slug} app.`,
        category: t.category ?? "Developer tools",
        creates: t.creates ?? "App",
        tags: [],
        files,
      };
    }),
    ...overrides,
  };
  edit?.(value);
  return new TextEncoder().encode(JSON.stringify(value, null, 2));
}
