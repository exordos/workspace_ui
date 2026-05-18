import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path, { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { before, describe, it } from "node:test";
import { build } from "esbuild";

const __dirname = dirname(fileURLToPath(import.meta.url));
const electronRoot = resolve(__dirname, "..");
const webUnreadLibPath = resolve(
  electronRoot,
  "..",
  "web",
  "src",
  "shared",
  "lib",
  "unread-indicator.lib.ts",
);

let unreadIndicatorLib;
let tempBuildDir;

before(async () => {
  tempBuildDir = mkdtempSync(path.join(tmpdir(), "workspace-unread-indicator-test-"));
  const outfile = path.join(tempBuildDir, "unread-indicator.lib.js");
  await build({
    entryPoints: [resolve(electronRoot, "src", "unread-indicator.lib.ts")],
    outfile,
    bundle: true,
    platform: "node",
    target: "node20",
    format: "esm",
    logLevel: "silent",
  });
  unreadIndicatorLib = await import(`file://${outfile}`);
});

describe("unread-indicator.lib (electron)", () => {
  it("stays in sync with web UNREAD_DOT_RADIUS_FRACTION", () => {
    const webSource = readFileSync(webUnreadLibPath, "utf8");
    const webMatch = webSource.match(
      /UNREAD_DOT_RADIUS_FRACTION = ([0-9.]+) \/ ([0-9.]+)/,
    );
    assert.ok(webMatch, "web UNREAD_DOT_RADIUS_FRACTION not found");
    const webFraction = Number(webMatch[1]) / Number(webMatch[2]);
    assert.equal(unreadIndicatorLib.UNREAD_DOT_RADIUS_FRACTION, webFraction);
  });

  it("createUnreadDotOverlaySvg uses UNREAD_INDICATOR_COLOR", () => {
    const svg = unreadIndicatorLib.createUnreadDotOverlaySvg(16);
    assert.ok(svg.includes(unreadIndicatorLib.UNREAD_INDICATOR_COLOR));
    assert.ok(svg.includes("<circle"));
  });

  it("createUnreadDotOverlaySvg keeps the circle inside the viewBox", () => {
    const sizePx = 16;
    const svg = unreadIndicatorLib.createUnreadDotOverlaySvg(sizePx);
    const cx = Number(svg.match(/cx="(\d+)"/)?.[1]);
    const cy = Number(svg.match(/cy="(\d+)"/)?.[1]);
    const r = Number(svg.match(/r="(\d+)"/)?.[1]);
    assert.ok(Number.isFinite(cx) && Number.isFinite(cy) && Number.isFinite(r));
    assert.ok(cx - r >= 0 && cx + r <= sizePx);
    assert.ok(cy - r >= 0 && cy + r <= sizePx);
  });
});

process.on("exit", () => {
  if (tempBuildDir) {
    rmSync(tempBuildDir, { recursive: true, force: true });
  }
});
