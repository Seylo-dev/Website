import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import brand from "../../../brand/brand.json";
import { loadConfig } from "../src/config";

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
});
