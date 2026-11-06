import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { loadConfig } from "../src/config";

describe("config", () => {
  test("serves install.sh from the latest release of the app repo", () => {
    const config = loadConfig({ NODE_ENV: "production" });
    expect(config.installer.releaseUrl).toBe("https://github.com/Seylo-dev/App/releases/latest/download/install.sh");
    expect(config.installer.localPath).toBeNull();
  });

  test("falls back to a checkout of the app repo next to this one outside production", () => {
    const config = loadConfig({});
    expect(config.installer.localPath).toBe(resolve(import.meta.dir, "../../../../seylo/installer/install.sh"));
  });

  test("INSTALLER_RELEASE_URL and INSTALL_SCRIPT_PATH override both", () => {
    const config = loadConfig({ INSTALLER_RELEASE_URL: "https://example.test/install.sh", INSTALL_SCRIPT_PATH: "/x" });
    expect(config.installer.releaseUrl).toBe("https://example.test/install.sh");
    expect(config.installer.localPath).toBe("/x");
  });
});
