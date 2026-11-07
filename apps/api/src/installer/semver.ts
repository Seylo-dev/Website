/** A version as semver 2.0.0 defines it, without a leading "v". Build metadata (`+...`) is ignored. */
interface Semver {
  core: [bigint, bigint, bigint];
  prerelease: string[];
}

const NUMBER = "0|[1-9]\\d*";
const IDENTIFIER = `(?:${NUMBER}|\\d*[A-Za-z-][0-9A-Za-z-]*)`;
const SEMVER = new RegExp(
  `^(${NUMBER})\\.(${NUMBER})\\.(${NUMBER})` +
    `(?:-(${IDENTIFIER}(?:\\.${IDENTIFIER})*))?` +
    `(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$`,
);

export function parseSemver(version: string): Semver | null {
  const match = SEMVER.exec(version);
  if (!match) return null;
  return {
    core: [BigInt(match[1]!), BigInt(match[2]!), BigInt(match[3]!)],
    prerelease: match[4] ? match[4].split(".") : [],
  };
}

const sign = (a: bigint, b: bigint) => (a < b ? -1 : a > b ? 1 : 0);
const NUMERIC = /^\d+$/;

/**
 * Semver precedence: negative when `a` is older than `b`, 0 when they rank the same, positive when
 * newer. A pre-release ranks below its release (0.2.0-rc.1 < 0.2.0); pre-release identifiers compare
 * numerically when both are numbers (rc.2 < rc.10), numbers rank below words, and a longer list wins
 * when one is a prefix of the other. Throws on something that is not a semver version.
 */
export function compareSemver(a: string, b: string): number {
  const left = parseSemver(a);
  const right = parseSemver(b);
  if (!left || !right) throw new Error(`not a semver version: ${left ? b : a}`);

  for (let i = 0; i < 3; i++) {
    const order = sign(left.core[i]!, right.core[i]!);
    if (order !== 0) return order;
  }
  // A release ranks above any of its pre-releases.
  if (left.prerelease.length === 0 && right.prerelease.length === 0) return 0;
  if (left.prerelease.length === 0) return 1;
  if (right.prerelease.length === 0) return -1;
  for (let i = 0; i < Math.min(left.prerelease.length, right.prerelease.length); i++) {
    const x = left.prerelease[i]!;
    const y = right.prerelease[i]!;
    if (x === y) continue;
    const xNumeric = NUMERIC.test(x);
    const yNumeric = NUMERIC.test(y);
    if (xNumeric && yNumeric) return sign(BigInt(x), BigInt(y));
    if (xNumeric) return -1;
    if (yNumeric) return 1;
    return x < y ? -1 : 1;
  }
  return Math.sign(left.prerelease.length - right.prerelease.length);
}
