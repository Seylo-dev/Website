import { describe, expect, test } from "bun:test";
import { compareSemver, parseSemver } from "../src/installer/semver";

describe("semver", () => {
  test("ranks versions in semver 2.0.0's order", () => {
    // The precedence example from the spec, then core versions that a string compare gets wrong.
    const ordered = [
      "0.2.0-rc.1",
      "0.2.0",
      "0.9.0",
      "0.10.0",
      "1.0.0-alpha",
      "1.0.0-alpha.1",
      "1.0.0-alpha.beta",
      "1.0.0-beta",
      "1.0.0-beta.2",
      "1.0.0-beta.11",
      "1.0.0-rc.1",
      "1.0.0",
      "1.0.1",
      "1.1.0",
      "2.0.0",
      "10.0.0",
    ];
    for (let i = 0; i < ordered.length - 1; i++) {
      expect([ordered[i], compareSemver(ordered[i]!, ordered[i + 1]!)]).toEqual([ordered[i], -1]);
      expect(compareSemver(ordered[i + 1]!, ordered[i]!)).toBe(1);
    }
    const shuffled = [...ordered].reverse();
    expect(shuffled.sort(compareSemver)).toEqual(ordered);
  });

  test("equal versions, build metadata and big numbers", () => {
    expect(compareSemver("0.2.0", "0.2.0")).toBe(0);
    expect(compareSemver("0.2.0-rc.1", "0.2.0-rc.1")).toBe(0);
    expect(compareSemver("0.2.0+build.7", "0.2.0")).toBe(0);
    expect(compareSemver("0.2.0-rc.2", "0.2.0-rc.10")).toBe(-1);
    // Numeric identifiers rank below alphanumeric ones.
    expect(compareSemver("0.2.0-rc.1", "0.2.0-rc.a")).toBe(-1);
    // Past Number.MAX_SAFE_INTEGER, where 9007199254740993 would round to ...992.
    expect(compareSemver("0.0.9007199254740993", "0.0.9007199254740992")).toBe(1);
    expect(compareSemver("0.0.0-9007199254740993", "0.0.0-9007199254740992")).toBe(1);
  });

  test("rejects what is not a semver version", () => {
    for (const version of [
      "",
      "1.2",
      "1.2.3.4",
      "v1.2.3",
      "01.2.3",
      "1.2.3-",
      "1.2.3-rc..1",
      "1.2.3-01",
      "1.2.3-rc_1",
    ]) {
      expect([version, parseSemver(version)]).toEqual([version, null]);
    }
    expect(parseSemver("1.2.3-rc.1+abc")).toEqual({ core: [1n, 2n, 3n], prerelease: ["rc", "1"] });
    expect(() => compareSemver("0.2.0", "0.02.0")).toThrow("not a semver version: 0.02.0");
  });
});
