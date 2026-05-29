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

// scripts/lib/unread-dot-bake.lib.ts
var unread_dot_bake_lib_exports = {};
__export(unread_dot_bake_lib_exports, {
  DOCK_UNREAD_DOT_MARGIN_FRACTION: () => DOCK_UNREAD_DOT_MARGIN_FRACTION,
  DOCK_UNREAD_DOT_RADIUS_FRACTION: () => DOCK_UNREAD_DOT_RADIUS_FRACTION,
  UNREAD_INDICATOR_COLOR: () => UNREAD_INDICATOR_COLOR,
  compositeUnreadDotOnNativeImage: () => compositeUnreadDotOnNativeImage,
  getDockUnreadDotInsets: () => getDockUnreadDotInsets,
  getUnreadDotRadiusPx: () => getUnreadDotRadiusPx
});
module.exports = __toCommonJS(unread_dot_bake_lib_exports);
var UNREAD_INDICATOR_COLOR = "#FF5500";
var DOCK_UNREAD_DOT_RADIUS_FRACTION = 56 / 680;
var DOCK_UNREAD_DOT_MARGIN_FRACTION = 32 / 680;
function getUnreadDotRadiusPx(iconSizePx, fraction) {
  return Math.max(1, Math.round(iconSizePx * fraction));
}
function getDockUnreadDotInsets(iconSizePx) {
  const margin = Math.max(3, Math.round(iconSizePx * DOCK_UNREAD_DOT_MARGIN_FRACTION));
  return { rightPx: margin, topPx: margin };
}
function parseHexColor(hex) {
  const normalized = hex.replace("#", "");
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16)
  };
}
function compositeUnreadDotOnNativeImage(image, fraction, insets = { rightPx: 1, topPx: 0 }) {
  const { nativeImage } = require("electron");
  const { width, height } = image.getSize();
  const iconSize = Math.min(width, height);
  const radius = getUnreadDotRadiusPx(iconSize, fraction);
  const cx = width - radius - insets.rightPx;
  const cy = radius + insets.topPx;
  const { r, g, b } = parseHexColor(UNREAD_INDICATOR_COLOR);
  const radiusSq = radius * radius;
  const out = image.toBitmap();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > radiusSq) continue;
      const idx = (y * width + x) * 4;
      out[idx] = b;
      out[idx + 1] = g;
      out[idx + 2] = r;
      out[idx + 3] = 255;
    }
  }
  return nativeImage.createFromBitmap(out, { width, height });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DOCK_UNREAD_DOT_MARGIN_FRACTION,
  DOCK_UNREAD_DOT_RADIUS_FRACTION,
  UNREAD_INDICATOR_COLOR,
  compositeUnreadDotOnNativeImage,
  getDockUnreadDotInsets,
  getUnreadDotRadiusPx
});
