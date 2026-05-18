import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path, { dirname, resolve } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const electronRoot = resolve(__dirname, "..");
const webRoot = resolve(electronRoot, "..", "web");

let trayLib;
let tempBuildDir;

before(async () => {
  // Self-contained build: compile tray.lib.ts into a throwaway temp dir so the
  // test does not depend on `npm run build:electron` having been run first.
  tempBuildDir = mkdtempSync(path.join(tmpdir(), "workspace-tray-test-"));
  const outfile = path.join(tempBuildDir, "tray.lib.js");
  await build({
    entryPoints: [resolve(electronRoot, "src", "tray.lib.ts")],
    outfile,
    bundle: true,
    platform: "node",
    target: "node20",
    format: "esm",
    logLevel: "silent",
  });
  trayLib = await import(`file://${outfile}`);
});

after(() => {
  if (tempBuildDir) {
    rmSync(tempBuildDir, { recursive: true, force: true });
  }
});

describe("getTrayMenuLabels", () => {
  it("returns Russian labels for ru locales", () => {
    const labels = trayLib.getTrayMenuLabels("ru-RU");
    assert.equal(labels.messenger, "Мессенджер");
    assert.equal(labels.calendar, "Календарь");
    assert.equal(labels.mail, "Почта");
    assert.equal(labels.quit, "Выход");
    assert.equal(labels.unreadTaskbarOverlay, "Непрочитанные сообщения");
  });

  it("returns English labels for non-ru locales", () => {
    const labels = trayLib.getTrayMenuLabels("en-US");
    assert.equal(labels.messenger, "Messenger");
    assert.equal(labels.quit, "Quit");
    assert.equal(labels.unreadTaskbarOverlay, "Unread messages");
  });
});

describe("resolveTrayIconFileName", () => {
  it("returns primary tray icon for normal state", () => {
    assert.equal(trayLib.resolveTrayIconFileName("darwin", false), "tray-icon-mac.png");
    assert.equal(trayLib.resolveTrayIconFileName("win32", false), "tray-icon.png");
  });

  it("returns unread tray icon variant when requested", () => {
    assert.equal(trayLib.resolveTrayIconFileName("darwin", true), "tray-icon-mac-unread.png");
    assert.equal(trayLib.resolveTrayIconFileName("linux", true), "tray-icon-unread.png");
  });
});

describe("resolveDockIconFileName", () => {
  it("returns baked dock PNG file names", () => {
    assert.equal(trayLib.resolveDockIconFileName(false), "dock-icon.png");
    assert.equal(trayLib.resolveDockIconFileName(true), "dock-icon-unread.png");
  });
});

describe("TRAY_NAV_ROUTES", () => {
  it("exposes stable internal routes", () => {
    assert.equal(trayLib.TRAY_NAV_ROUTES.messenger, "/open/messenger");
    assert.equal(trayLib.TRAY_NAV_ROUTES.calendar, "/calendar");
    assert.equal(trayLib.TRAY_NAV_ROUTES.mail, "/mail");
  });

  it("messenger sentinel stays in sync with web TRAY_MESSENGER_OPEN_ROUTE", () => {
    // Cross-package contract: tray.lib.ts (electron main) and
    // last-messenger-route.lib.ts (web renderer) MUST agree on the sentinel,
    // otherwise the tray Messenger item silently stops opening the last chat.
    const webLibSource = readFileSync(
      path.join(webRoot, "src", "shared", "lib", "last-messenger-route.lib.ts"),
      "utf8",
    );
    const match = webLibSource.match(/TRAY_MESSENGER_OPEN_ROUTE\s*=\s*"([^"]+)"/);
    assert.ok(match, "TRAY_MESSENGER_OPEN_ROUTE constant not found in web lib");
    assert.equal(trayLib.TRAY_NAV_ROUTES.messenger, match[1]);
  });
});
