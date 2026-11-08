import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import brand from "../../../brand/brand.json";
import { loadConfig } from "../src/config";
import { DEFAULT_DAILY_BUDGETS } from "../src/daily-limits";

describe("config", () => {
  test("serves install.sh from the app repo's releases, checked with the release key in brand.json", () => {
    const config = loadConfig({ NODE_ENV: "production" });
    expect(config.installer.releasesUrl).toBe("https://github.com/Seylo-dev/App/releases");
    expect(config.installer.publicKey).toBe(brand.minisignPublicKey);
    expect(config.installer.publicKey).toMatch(/^RW[A-Za-z0-9+/]{54}$/);
    expect(config.installer.localPath).toBeNull();
  });

  test("falls back to a checkout of the app repo next to this one outside production", () => {
    const config = loadConfig({});
    expect(config.installer.localPath).toBe(resolve(import.meta.dir, "../../../../seylo/installer/install.sh"));
  });

  test("INSTALLER_RELEASES_URL and INSTALL_SCRIPT_PATH override both, but never the key", () => {
    const config = loadConfig({
      INSTALLER_RELEASES_URL: "https://mirror.test/releases/",
      INSTALL_SCRIPT_PATH: "/x",
      INSTALLER_PUBLIC_KEY: "RWQ",
    });
    expect(config.installer.releasesUrl).toBe("https://mirror.test/releases");
    expect(config.installer.publicKey).toBe(brand.minisignPublicKey);
    expect(config.installer.localPath).toBe("/x");
  });

  test("daily budgets: 2 GiB of reports and 50,000 new installs unless set, 0 turns one off", () => {
    expect(loadConfig({}).budgets).toEqual(DEFAULT_DAILY_BUDGETS);
    expect(DEFAULT_DAILY_BUDGETS).toEqual({ reportBytes: 2 * 1024 ** 3, telemetryInstalls: 50_000 });
    expect(loadConfig({ REPORT_MIB_PER_DAY: "512", TELEMETRY_INSTALLS_PER_DAY: " 0 " }).budgets).toEqual({
      reportBytes: 512 * 1024 ** 2,
      telemetryInstalls: 0,
    });
    expect(loadConfig({ REPORT_MIB_PER_DAY: "" }).budgets.reportBytes).toBe(DEFAULT_DAILY_BUDGETS.reportBytes);
  });

  test("a budget that isn't a whole number stops the API instead of being guessed at", () => {
    for (const value of ["2GiB", "-1", "1.5", "1e9", "9999999999"]) {
      expect(() => loadConfig({ REPORT_MIB_PER_DAY: value })).toThrow("REPORT_MIB_PER_DAY must be a whole number");
    }
    expect(() => loadConfig({ TELEMETRY_INSTALLS_PER_DAY: "lots" })).toThrow("TELEMETRY_INSTALLS_PER_DAY");
  });
});
