
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
} = require("/Users/doublek/work/workspace/packages/electron/scripts/.bake-tmp/dock-icon-bake.lib.js");
const {
  buildMacTrayIconFromLogo,
  buildLinuxTrayIconFromLogo,
  TRAY_UNREAD_DOT_RADIUS_FRACTION,
  getMacTrayUnreadDotInsets,
  getLinuxTrayUnreadDotInsets,
} = require("/Users/doublek/work/workspace/packages/electron/scripts/.bake-tmp/tray-icon-bake.lib.js");
const {
  compositeUnreadDotOnNativeImage,
  DOCK_UNREAD_DOT_RADIUS_FRACTION,
  getDockUnreadDotInsets,
} = require("/Users/doublek/work/workspace/packages/electron/scripts/.bake-tmp/unread-dot-bake.lib.js");

const resourcesDir = "/Users/doublek/work/workspace/packages/electron/resources";

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

  const linuxTrayNormal = buildLinuxTrayIconFromLogo(logo);
  fs.writeFileSync(path.join(resourcesDir, "tray-icon-linux.png"), linuxTrayNormal.toPNG());

  const linuxTraySize = Math.min(linuxTrayNormal.getSize().width, linuxTrayNormal.getSize().height);
  const linuxTrayUnread = compositeUnreadDotOnNativeImage(
    linuxTrayNormal,
    TRAY_UNREAD_DOT_RADIUS_FRACTION,
    getLinuxTrayUnreadDotInsets(linuxTraySize),
  );
  fs.writeFileSync(path.join(resourcesDir, "tray-icon-linux-unread.png"), linuxTrayUnread.toPNG());

  console.log("Wrote dock + tray PNGs in", resourcesDir);
  app.exit(0);
});
