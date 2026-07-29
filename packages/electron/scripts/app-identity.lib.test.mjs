import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path, { dirname, resolve } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const electronRoot = resolve(__dirname, "..");

let appIdentityLib;
let tempBuildDir;

before(async () => {
  tempBuildDir = mkdtempSync(path.join(tmpdir(), "workspace-app-identity-test-"));
  const outfile = path.join(tempBuildDir, "app-identity.lib.js");
  await build({
    entryPoints: [resolve(electronRoot, "src", "app-identity.lib.ts")],
    outfile,
    bundle: true,
    platform: "node",
    target: "node20",
    format: "esm",
    logLevel: "silent",
  });
  appIdentityLib = await import(`file://${outfile}`);
});

after(() => {
  if (tempBuildDir) {
    rmSync(tempBuildDir, { recursive: true, force: true });
  }
});

describe("app identity constants", () => {
  it("keeps the slug safe for paths, window classes and deb package names", () => {
    assert.match(appIdentityLib.APP_SLUG, /^[a-z0-9][a-z0-9-]*$/);
  });

  it("uses a reverse-DNS application id", () => {
    assert.match(appIdentityLib.APP_ID, /^[a-z0-9]+(\.[a-z0-9]+)+$/);
  });
});

describe("getUserDataDirName", () => {
  it("uses the plain slug for packaged builds", () => {
    assert.equal(appIdentityLib.getUserDataDirName(true), appIdentityLib.APP_SLUG);
  });

  it("keeps dev builds in a separate profile", () => {
    const devDirName = appIdentityLib.getUserDataDirName(false);
    assert.notEqual(devDirName, appIdentityLib.APP_SLUG);
    assert.ok(devDirName.startsWith(appIdentityLib.APP_SLUG));
  });
});

describe("pickLegacyUserDataDirName", () => {
  it("returns null when no legacy profile exists", () => {
    assert.equal(
      appIdentityLib.pickLegacyUserDataDirName(() => false),
      null,
    );
  });

  it("finds the profile written by packaged builds", () => {
    assert.equal(
      appIdentityLib.pickLegacyUserDataDirName((dirName) => dirName === "electron-app"),
      "electron-app",
    );
  });

  it("prefers the product-name profile when several exist", () => {
    assert.equal(
      appIdentityLib.pickLegacyUserDataDirName(() => true),
      appIdentityLib.APP_DISPLAY_NAME,
    );
  });

  it("never adopts the shared unpackaged Electron profile", () => {
    assert.ok(!appIdentityLib.LEGACY_USER_DATA_DIR_NAMES.includes("Electron"));
  });
});
