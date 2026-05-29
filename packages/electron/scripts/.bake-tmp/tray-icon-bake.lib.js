"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// scripts/lib/tray-icon-bake.lib.ts
var tray_icon_bake_lib_exports = {};
__export(tray_icon_bake_lib_exports, {
  LINUX_TRAY_ALPHA_THRESHOLD: () => LINUX_TRAY_ALPHA_THRESHOLD,
  LINUX_TRAY_ICON_CANVAS_PX: () => LINUX_TRAY_ICON_CANVAS_PX,
  LINUX_TRAY_LOGO_SIZE_FRACTION: () => LINUX_TRAY_LOGO_SIZE_FRACTION,
  MAC_TRAY_ICON_CANVAS_PX: () => MAC_TRAY_ICON_CANVAS_PX,
  MAC_TRAY_ICON_WHITE: () => MAC_TRAY_ICON_WHITE,
  MAC_TRAY_LOGO_SIZE_FRACTION: () => MAC_TRAY_LOGO_SIZE_FRACTION,
  TRAY_UNREAD_DOT_RADIUS_FRACTION: () => TRAY_UNREAD_DOT_RADIUS_FRACTION,
  buildLinuxTrayIconFromLogo: () => buildLinuxTrayIconFromLogo,
  buildMacTrayIconFromLogo: () => buildMacTrayIconFromLogo,
  getLinuxTrayLogoLayout: () => getLinuxTrayLogoLayout,
  getLinuxTrayUnreadDotInsets: () => getLinuxTrayUnreadDotInsets,
  getMacTrayLogoLayout: () => getMacTrayLogoLayout,
  getMacTrayUnreadDotInsets: () => getMacTrayUnreadDotInsets,
  resolveTraySilhouetteAlpha: () => resolveTraySilhouetteAlpha
});
module.exports = __toCommonJS(tray_icon_bake_lib_exports);
var MAC_TRAY_ICON_CANVAS_PX = 32;
var LINUX_TRAY_ICON_CANVAS_PX = 32;
var MAC_TRAY_LOGO_SIZE_FRACTION = 0.62;
var LINUX_TRAY_LOGO_SIZE_FRACTION = 0.78;
var MAC_TRAY_ICON_WHITE = 255;
var TRAY_UNREAD_DOT_RADIUS_FRACTION = 42 / 680;
var LINUX_TRAY_ALPHA_THRESHOLD = 48;
function resolveTraySilhouetteAlpha(b, g, r, a, mode) {
  if (a === 0) return 0;
  if (mode === "binary") {
    return a >= LINUX_TRAY_ALPHA_THRESHOLD ? 255 : 0;
  }
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return Math.min(255, Math.round(a / 255 * (luminance / 255) * 255));
}
function getMacTrayLogoLayout(canvasPx = MAC_TRAY_ICON_CANVAS_PX) {
  return getTrayLogoLayout(canvasPx, MAC_TRAY_LOGO_SIZE_FRACTION);
}
function getLinuxTrayLogoLayout(canvasPx = LINUX_TRAY_ICON_CANVAS_PX) {
  return getTrayLogoLayout(canvasPx, LINUX_TRAY_LOGO_SIZE_FRACTION);
}
function getTrayLogoLayout(canvasPx, logoSizeFraction) {
  const logoSize = Math.max(14, Math.round(canvasPx * logoSizeFraction));
  const offsetX = Math.floor((canvasPx - logoSize) / 2);
  const offsetY = Math.floor((canvasPx - logoSize) / 2);
  return { canvasPx, logoSize, offsetX, offsetY };
}
function getMacTrayUnreadDotInsets(canvasPx = MAC_TRAY_ICON_CANVAS_PX) {
  const { logoSize, offsetX, offsetY } = getMacTrayLogoLayout(canvasPx);
  const radius = Math.max(1, Math.round(canvasPx * TRAY_UNREAD_DOT_RADIUS_FRACTION));
  const logoRight = offsetX + logoSize;
  const logoTop = offsetY;
  const cx = logoRight - Math.max(1, Math.round(radius * 0.35));
  const cy = logoTop + Math.max(1, Math.round(radius * 0.9));
  return {
    rightPx: Math.max(0, canvasPx - radius - cx),
    topPx: Math.max(0, cy - radius)
  };
}
function getLinuxTrayUnreadDotInsets(canvasPx = LINUX_TRAY_ICON_CANVAS_PX) {
  return getMacTrayUnreadDotInsets(canvasPx);
}
function buildTrayIconFromLogo(logo, options) {
  const { nativeImage } = require("electron");
  const { canvasPx, logoSizeFraction, alphaMode } = options;
  const { logoSize, offsetX, offsetY } = getTrayLogoLayout(canvasPx, logoSizeFraction);
  const resized = logo.resize({ width: logoSize, height: logoSize });
  const { width: logoW, height: logoH } = resized.getSize();
  const logoBitmap = resized.toBitmap();
  const white = MAC_TRAY_ICON_WHITE;
  const out = Buffer.alloc(canvasPx * canvasPx * 4, 0);
  for (let y = 0; y < canvasPx; y++) {
    for (let x = 0; x < canvasPx; x++) {
      const lx = x - offsetX;
      const ly = y - offsetY;
      if (lx < 0 || ly < 0 || lx >= logoW || ly >= logoH) {
        continue;
      }
      const lidx = (ly * logoW + lx) * 4;
      const alpha = resolveTraySilhouetteAlpha(
        logoBitmap[lidx] ?? 0,
        logoBitmap[lidx + 1] ?? 0,
        logoBitmap[lidx + 2] ?? 0,
        logoBitmap[lidx + 3] ?? 0,
        alphaMode
      );
      if (alpha === 0) continue;
      const idx = (y * canvasPx + x) * 4;
      out[idx] = white;
      out[idx + 1] = white;
      out[idx + 2] = white;
      out[idx + 3] = alpha;
    }
  }
  return nativeImage.createFromBitmap(out, { width: canvasPx, height: canvasPx });
}
function buildMacTrayIconFromLogo(logo) {
  return buildTrayIconFromLogo(logo, {
    canvasPx: MAC_TRAY_ICON_CANVAS_PX,
    logoSizeFraction: MAC_TRAY_LOGO_SIZE_FRACTION,
    alphaMode: "luminance"
  });
}
function buildLinuxTrayIconFromLogo(logo) {
  return buildTrayIconFromLogo(logo, {
    canvasPx: LINUX_TRAY_ICON_CANVAS_PX,
    logoSizeFraction: LINUX_TRAY_LOGO_SIZE_FRACTION,
    alphaMode: "binary"
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  LINUX_TRAY_ALPHA_THRESHOLD,
  LINUX_TRAY_ICON_CANVAS_PX,
  LINUX_TRAY_LOGO_SIZE_FRACTION,
  MAC_TRAY_ICON_CANVAS_PX,
  MAC_TRAY_ICON_WHITE,
  MAC_TRAY_LOGO_SIZE_FRACTION,
  TRAY_UNREAD_DOT_RADIUS_FRACTION,
  buildLinuxTrayIconFromLogo,
  buildMacTrayIconFromLogo,
  getLinuxTrayLogoLayout,
  getLinuxTrayUnreadDotInsets,
  getMacTrayLogoLayout,
  getMacTrayUnreadDotInsets,
  resolveTraySilhouetteAlpha
});
