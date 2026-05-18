/**
 * One-shot: bakes macOS Dock PNGs from logo + squircle (run before removing runtime compositors).
 *
 *   node scripts/bake-icon-assets.mjs
 *
 * Requires `electron` devDependency. Writes `resources/dock-icon.png` and `dock-icon-unread.png`.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path, { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const electronRoot = resolve(__dirname, "..");
const resourcesDir = resolve(electronRoot, "resources");
const outDir = resolve(electronRoot, "scripts", ".bake-tmp");

mkdirSync(outDir, { recursive: true });

const dockOut = resolve(outDir, "dock-icon-bake.lib.js");
const trayOut = resolve(outDir, "tray-icon-bake.lib.js");
const unreadOut = resolve(outDir, "unread-dot-bake.lib.js");
const runnerOut = resolve(outDir, "bake-runner.cjs");

await build({
  entryPoints: [resolve(electronRoot, "scripts", "lib", "dock-icon-bake.lib.ts")],
  outfile: dockOut,
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["electron"],
  logLevel: "silent",
});

await build({
  entryPoints: [resolve(electronRoot, "scripts", "lib", "tray-icon-bake.lib.ts")],
  outfile: trayOut,
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["electron"],
  logLevel: "silent",
});

await build({
  entryPoints: [resolve(electronRoot, "scripts", "lib", "unread-dot-bake.lib.ts")],
  outfile: unreadOut,
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["electron"],
  logLevel: "silent",
});

const runnerSource = `
const path = require("node:path");
const fs = require("node:fs");
const electron = require("electron");
const app = electron.app;
const nativeImage = electron.nativeImage;
if (app == null || nativeImage == null) {
  console.error("Run via Electron binary, not Node. electron keys:", Object.keys(electron));
  process.exit(1);
}
const {
  buildMacDockIconFromLogo,
} = require(${JSON.stringify(dockOut)});
const {
  buildMacTrayIconFromLogo,
  TRAY_UNREAD_DOT_RADIUS_FRACTION,
  getMacTrayUnreadDotInsets,
} = require(${JSON.stringify(trayOut)});
const {
  compositeUnreadDotOnNativeImage,
  DOCK_UNREAD_DOT_RADIUS_FRACTION,
  getDockUnreadDotInsets,
} = require(${JSON.stringify(unreadOut)});

const resourcesDir = ${JSON.stringify(resourcesDir)};

app.whenReady().then(() => {
  const logoPath = path.join(resourcesDir, "icons", "512x512.png");
  const logo = nativeImage.createFromPath(logoPath);
  if (logo.isEmpty()) {
    console.error("Missing logo:", logoPath);
    app.exit(1);
    return;
  }

  const normal = buildMacDockIconFromLogo(logo);
  const normalPath = path.join(resourcesDir, "dock-icon.png");
  fs.writeFileSync(normalPath, normal.toPNG());

  const dockSize = Math.min(normal.getSize().width, normal.getSize().height);
  const unread = compositeUnreadDotOnNativeImage(
    normal,
    DOCK_UNREAD_DOT_RADIUS_FRACTION,
    getDockUnreadDotInsets(dockSize),
  );
  const unreadPath = path.join(resourcesDir, "dock-icon-unread.png");
  fs.writeFileSync(unreadPath, unread.toPNG());

  const trayNormal = buildMacTrayIconFromLogo(logo);
  const trayNormalPath = path.join(resourcesDir, "tray-icon-mac.png");
  fs.writeFileSync(trayNormalPath, trayNormal.toPNG());

  const traySize = Math.min(trayNormal.getSize().width, trayNormal.getSize().height);
  const trayUnread = compositeUnreadDotOnNativeImage(
    trayNormal,
    TRAY_UNREAD_DOT_RADIUS_FRACTION,
    getMacTrayUnreadDotInsets(traySize),
  );
  const trayUnreadPath = path.join(resourcesDir, "tray-icon-mac-unread.png");
  fs.writeFileSync(trayUnreadPath, trayUnread.toPNG());

  fs.writeFileSync(path.join(resourcesDir, "tray-icon.png"), trayNormal.toPNG());
  fs.writeFileSync(path.join(resourcesDir, "tray-icon-unread.png"), trayUnread.toPNG());

  console.log("Wrote dock + tray PNGs in", resourcesDir);
  app.exit(0);
});
`;

writeFileSync(runnerOut, runnerSource);

const { createRequire } = await import("node:module");
const requireFromRoot = createRequire(resolve(electronRoot, "../../package.json"));
const electronBinary = requireFromRoot("electron");
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const result = spawnSync(electronBinary, [runnerOut], {
  cwd: electronRoot,
  stdio: "inherit",
  env,
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
