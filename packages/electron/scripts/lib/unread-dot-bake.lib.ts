/**
 * Dev-only: composites unread dot when baking Dock PNGs. Not imported by app main.
 */

import type { NativeImage } from "electron";

export const UNREAD_INDICATOR_COLOR = "#FF5500";
export const DOCK_UNREAD_DOT_RADIUS_FRACTION = 56 / 680;
export const DOCK_UNREAD_DOT_MARGIN_FRACTION = 32 / 680;

export interface UnreadDotInsets {
  rightPx: number;
  topPx: number;
}

export function getUnreadDotRadiusPx(iconSizePx: number, fraction: number): number {
  return Math.max(1, Math.round(iconSizePx * fraction));
}

export function getDockUnreadDotInsets(iconSizePx: number): UnreadDotInsets {
  const margin = Math.max(3, Math.round(iconSizePx * DOCK_UNREAD_DOT_MARGIN_FRACTION));
  return { rightPx: margin, topPx: margin };
}

function parseHexColor(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace("#", "");
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

export function compositeUnreadDotOnNativeImage(
  image: NativeImage,
  fraction: number,
  insets: UnreadDotInsets = { rightPx: 1, topPx: 0 },
): NativeImage {
  const { nativeImage } = require("electron") as typeof import("electron");
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
