// minisign signature checks, ported from the app repo's panel
// (apps/panel/src/modules/updates/manifest.ts, verifyMinisign). Release
// manifests are signed with the release key in brand.json, and the panel,
// the agent and the installer all check them the same way.
//
//   public key:  base64("Ed" + key id (8 bytes) + Ed25519 public key (32 bytes))
//   .minisig:    untrusted comment: ...
//                base64(algorithm (2) + key id (8) + signature (64))
//                trusted comment: ...
//                base64(global signature (64) over signature + trusted comment)
//
// "ED" signs the BLAKE2b-512 hash of the file (what minisign writes by
// default), "Ed" the file itself.

import { createHash, createPublicKey, verify } from "node:crypto";

export class SignatureError extends Error {
  override name = "SignatureError";
}

/** Checks `signatureFile` over `message` with the minisign key `publicKeyBase64`. Returns the trusted comment; throws SignatureError. */
export function verifyMinisign(publicKeyBase64: string, message: Uint8Array, signatureFile: string): string {
  const pk = Buffer.from(publicKeyBase64.trim(), "base64");
  if (pk.length !== 42 || pk.subarray(0, 2).toString() !== "Ed")
    throw new SignatureError("the release signing key is malformed");
  const lines = signatureFile.trim().split(/\r?\n/);
  const sigLine = lines[1];
  const trustedLine = lines[2];
  const globalLine = lines[3];
  if (!sigLine || !trustedLine?.startsWith("trusted comment: ") || !globalLine) {
    throw new SignatureError("the signature file is malformed");
  }
  const sig = Buffer.from(sigLine, "base64");
  if (sig.length !== 74) throw new SignatureError("the signature file is malformed");
  const algorithm = sig.subarray(0, 2).toString();
  if (!sig.subarray(2, 10).equals(pk.subarray(2, 10))) throw new SignatureError("it was signed with a different key");
  const key = createPublicKey({
    key: { kty: "OKP", crv: "Ed25519", x: pk.subarray(10).toString("base64url") },
    format: "jwk",
  });
  const signed =
    algorithm === "ED"
      ? createHash("blake2b512").update(message).digest()
      : algorithm === "Ed"
        ? Buffer.from(message)
        : null;
  if (!signed) throw new SignatureError("the signature uses an unknown algorithm");
  if (!verify(null, signed, key, sig.subarray(10))) throw new SignatureError("the signature does not match");
  const trusted = trustedLine.slice("trusted comment: ".length);
  const global = Buffer.from(globalLine, "base64");
  if (!verify(null, Buffer.concat([sig.subarray(10), Buffer.from(trusted)]), key, global)) {
    throw new SignatureError("the signature's trusted comment does not match");
  }
  return trusted;
}
