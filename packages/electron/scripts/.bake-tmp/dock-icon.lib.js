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

// src/dock-icon.lib.ts
var dock_icon_lib_exports = {};
__export(dock_icon_lib_exports, {
  MAC_DOCK_BG_BOTTOM: () => MAC_DOCK_BG_BOTTOM,
  MAC_DOCK_BG_TOP: () => MAC_DOCK_BG_TOP,
  MAC_DOCK_ICON_CANVAS_PX: () => MAC_DOCK_ICON_CANVAS_PX,
  MAC_DOCK_ICON_CORNER_RADIUS_FRACTION: () => MAC_DOCK_ICON_CORNER_RADIUS_FRACTION,
  MAC_DOCK_LOGO_SIZE_FRACTION: () => MAC_DOCK_LOGO_SIZE_FRACTION,
  MAC_DOCK_PLATE_INSET_FRACTION: () => MAC_DOCK_PLATE_INSET_FRACTION,
  buildMacDockIconFromLogo: () => buildMacDockIconFromLogo,
  getMacDockPlateGeometry: () => getMacDockPlateGeometry,
  isInsideMacDockSquircle: () => isInsideMacDockSquircle
});
module.exports = __toCommonJS(dock_icon_lib_exports);
var MAC_DOCK_ICON_CORNER_RADIUS_FRACTION = 0.2237;
var MAC_DOCK_PLATE_INSET_FRACTION = 0.1;
var MAC_DOCK_LOGO_SIZE_FRACTION = 0.76;
var MAC_DOCK_ICON_CANVAS_PX = 512;
var MAC_DOCK_BG_TOP = "#3A3A3C";
var MAC_DOCK_BG_BOTTOM = "#1C1C1E";
function isInsideMacDockSquircle(x, y, sizePx, originX = 0, originY = 0) {
  const localX = x - originX;
  const localY = y - originY;
  const radius = Math.min(
    sizePx * MAC_DOCK_ICON_CORNER_RADIUS_FRACTION,
    sizePx / 2
  );
  if (localX < 0 || localY < 0 || localX >= sizePx || localY >= sizePx) return false;
  if (localX >= radius && localX < sizePx - radius) return true;
  if (localY >= radius && localY < sizePx - radius) return true;
  const checkCorner = (cx, cy) => {
    const dx = localX - cx;
    const dy = localY - cy;
    return dx * dx + dy * dy <= radius * radius;
  };
  if (localX < radius && localY < radius) return checkCorner(radius, radius);
  if (localX >= sizePx - radius && localY < radius) return checkCorner(sizePx - radius, radius);
  if (localX < radius && localY >= sizePx - radius) return checkCorner(radius, sizePx - radius);
  return checkCorner(sizePx - radius, sizePx - radius);
}
function getMacDockPlateGeometry(canvasPx) {
  const insetPx = Math.max(0, Math.round(canvasPx * MAC_DOCK_PLATE_INSET_FRACTION));
  return { insetPx, platePx: Math.max(32, canvasPx - insetPx * 2) };
}
function parseHexColor(hex) {
  const normalized = hex.replace("#", "");
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16)
  };
}
function lerpByte(a, b, t) {
  return Math.round(a + (b - a) * t);
}
function backgroundColorAt(y, sizePx) {
  const top = parseHexColor(MAC_DOCK_BG_TOP);
  const bottom = parseHexColor(MAC_DOCK_BG_BOTTOM);
  const t = sizePx <= 1 ? 0 : y / (sizePx - 1);
  return {
    r: lerpByte(top.r, bottom.r, t),
    g: lerpByte(top.g, bottom.g, t),
    b: lerpByte(top.b, bottom.b, t)
  };
}
function readLogoBgra(logoBitmap, logoWidth, logoX, logoY) {
  if (logoX < 0 || logoY < 0 || logoX >= logoWidth) return null;
  const logoHeight = logoBitmap.length / (logoWidth * 4);
  if (logoY >= logoHeight) return null;
  const idx = (logoY * logoWidth + logoX) * 4;
  return {
    b: logoBitmap[idx] ?? 0,
    g: logoBitmap[idx + 1] ?? 0,
    r: logoBitmap[idx + 2] ?? 0,
    a: logoBitmap[idx + 3] ?? 0
  };
}
function blendOverBackground(bg, fg) {
  const alpha = fg.a / 255;
  return {
    b: Math.round(fg.b * alpha + bg.b * (1 - alpha)),
    g: Math.round(fg.g * alpha + bg.g * (1 - alpha)),
    r: Math.round(fg.r * alpha + bg.r * (1 - alpha))
  };
}
function buildMacDockIconFromLogo(logo, canvasPx = MAC_DOCK_ICON_CANVAS_PX) {
  const { nativeImage } = require("electron");
  const { insetPx, platePx } = getMacDockPlateGeometry(canvasPx);
  const logoSize = Math.max(32, Math.round(platePx * MAC_DOCK_LOGO_SIZE_FRACTION));
  const resized = logo.resize({ width: logoSize, height: logoSize });
  const { width: logoW, height: logoH } = resized.getSize();
  const logoBitmap = resized.toBitmap();
  const offsetX = insetPx + Math.floor((platePx - logoW) / 2);
  const offsetY = insetPx + Math.floor((platePx - logoH) / 2);
  const out = Buffer.alloc(canvasPx * canvasPx * 4, 0);
  for (let y = 0; y < canvasPx; y++) {
    for (let x = 0; x < canvasPx; x++) {
      const idx = (y * canvasPx + x) * 4;
      if (!isInsideMacDockSquircle(x, y, platePx, insetPx, insetPx)) {
        out[idx] = 0;
        out[idx + 1] = 0;
        out[idx + 2] = 0;
        out[idx + 3] = 0;
        continue;
      }
      const bg = backgroundColorAt(y - insetPx, platePx);
      const logoPixel = readLogoBgra(logoBitmap, logoW, x - offsetX, y - offsetY);
      const color = logoPixel != null && logoPixel.a > 0 ? blendOverBackground(bg, logoPixel) : bg;
      out[idx] = color.b;
      out[idx + 1] = color.g;
      out[idx + 2] = color.r;
      out[idx + 3] = 255;
    }
  }
  return nativeImage.createFromBitmap(out, { width: canvasPx, height: canvasPx });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  MAC_DOCK_BG_BOTTOM,
  MAC_DOCK_BG_TOP,
  MAC_DOCK_ICON_CANVAS_PX,
  MAC_DOCK_ICON_CORNER_RADIUS_FRACTION,
  MAC_DOCK_LOGO_SIZE_FRACTION,
  MAC_DOCK_PLATE_INSET_FRACTION,
  buildMacDockIconFromLogo,
  getMacDockPlateGeometry,
  isInsideMacDockSquircle
});
