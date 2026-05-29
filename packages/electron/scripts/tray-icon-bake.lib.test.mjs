import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const electronRoot = path.resolve(__dirname, "..");

let trayBakeLib;

describe("tray-icon-bake.lib", () => {
  before(async () => {
    const tempBuildDir = mkdtempSync(path.join(tmpdir(), "workspace-tray-bake-test-"));
    const outfile = path.join(tempBuildDir, "tray-icon-bake.lib.js");
    await build({
      entryPoints: [path.resolve(electronRoot, "scripts", "lib", "tray-icon-bake.lib.ts")],
      outfile,
      bundle: true,
      platform: "node",
      format: "cjs",
      external: ["electron"],
      logLevel: "silent",
    });
    const requireFromTemp = createRequire(import.meta.url);
    trayBakeLib = requireFromTemp(outfile);
  });

  describe("resolveTraySilhouetteAlpha", () => {
    it("uses binary alpha for linux tray (no halftones)", () => {
      assert.equal(trayBakeLib.resolveTraySilhouetteAlpha(0, 0, 0, 0, "binary"), 0);
      assert.equal(trayBakeLib.resolveTraySilhouetteAlpha(0, 0, 0, 47, "binary"), 0);
      assert.equal(trayBakeLib.resolveTraySilhouetteAlpha(0, 0, 0, 48, "binary"), 255);
      assert.equal(trayBakeLib.resolveTraySilhouetteAlpha(128, 128, 128, 200, "binary"), 255);
    });

    it("keeps luminance-weighted alpha for mac menu bar", () => {
      assert.equal(trayBakeLib.resolveTraySilhouetteAlpha(0, 0, 0, 0, "luminance"), 0);
      const mid = trayBakeLib.resolveTraySilhouetteAlpha(128, 128, 128, 128, "luminance");
      assert.ok(mid > 0 && mid < 255);
    });
  });
});
