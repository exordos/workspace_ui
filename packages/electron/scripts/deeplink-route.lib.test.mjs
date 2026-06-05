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

let routeLib;
let tempBuildDir;

before(async () => {
  tempBuildDir = mkdtempSync(path.join(tmpdir(), "workspace-deeplink-route-test-"));
  const outfile = path.join(tempBuildDir, "deeplink-route.lib.js");
  await build({
    entryPoints: [resolve(electronRoot, "src", "deeplink-route.lib.ts")],
    outfile,
    bundle: true,
    platform: "node",
    target: "node20",
    format: "esm",
    logLevel: "silent",
  });
  routeLib = await import(`file://${outfile}`);
});

after(() => {
  if (tempBuildDir) {
    rmSync(tempBuildDir, { recursive: true, force: true });
  }
});

describe("isSafeDeeplinkRoute", () => {
  it("accepts internal routes with query strings", () => {
    assert.equal(routeLib.isSafeDeeplinkRoute("/dm/42-alice?msg=42"), true);
    assert.equal(routeLib.isSafeDeeplinkRoute("/stream/10-general/topic/Bugs?msg=55"), true);
  });

  it("rejects unsafe or unusable routes", () => {
    assert.equal(routeLib.isSafeDeeplinkRoute(""), false);
    assert.equal(routeLib.isSafeDeeplinkRoute("//evil.example/path"), false);
    assert.equal(routeLib.isSafeDeeplinkRoute("https://evil.example/path"), false);
    assert.equal(routeLib.isSafeDeeplinkRoute(`java${"script"}:alert(1)`), false);
    assert.equal(routeLib.isSafeDeeplinkRoute("data:text/html,hello"), false);
    assert.equal(routeLib.isSafeDeeplinkRoute("vbscript:msgbox(1)"), false);
    assert.equal(routeLib.isSafeDeeplinkRoute(`/${"a".repeat(513)}`), false);
  });
});

describe("resolveNotificationClickRoute", () => {
  it("returns a trimmed safe clickRoute", () => {
    assert.equal(
      routeLib.resolveNotificationClickRoute({ clickRoute: "  /dm/42-alice?msg=42  " }),
      "/dm/42-alice?msg=42",
    );
  });

  it("returns null for missing or unsafe clickRoute", () => {
    assert.equal(routeLib.resolveNotificationClickRoute(null), null);
    assert.equal(routeLib.resolveNotificationClickRoute({}), null);
    assert.equal(routeLib.resolveNotificationClickRoute({ clickRoute: 42 }), null);
    assert.equal(routeLib.resolveNotificationClickRoute({ clickRoute: "//evil.example" }), null);
  });
});
