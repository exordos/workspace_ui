/**
 * Unread indicator constants and compositing for Electron main process.
 *
 * Favicon/static SVG use web `UNREAD_DOT_RADIUS_FRACTION` (80/680).
 * Tray and Dock use smaller fractions defined here.
 */

import type { NativeImage } from "electron";

/** Must match web `brand.unreadIndicatorColor` default / VITE_UNREAD_INDICATOR_COLOR. */
export const UNREAD_INDICATOR_COLOR = "#FF5500";

/** Matches favicon-unread.svg (r=80 on viewBox width 680). */
export const UNREAD_DOT_RADIUS_FRACTION = 80 / 680;

/** Dot on 16×16 menu bar tray icons (between favicon and previous 40/680). */
export const TRAY_UNREAD_DOT_RADIUS_FRACTION = 68 / 680;

/** Smaller dot on Dock app icon (no numeric/text badge). */
export const DOCK_UNREAD_DOT_RADIUS_FRACTION = 56 / 680;

/** Inset of the Dock dot from the top-right corner (scales with icon size). */
export const DOCK_UNREAD_DOT_MARGIN_FRACTION = 32 / 680;

export interface UnreadDotInsets {
  rightPx: number;
  topPx: number;
}

export function getUnreadDotRadiusPx(
  iconSizePx: number,
  fraction = UNREAD_DOT_RADIUS_FRACTION,
): number {
  return Math.max(1, Math.round(iconSizePx * fraction));
}

/** Margin from the top-right edge of the Dock icon to the unread dot. */
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

export function createUnreadDotOverlaySvg(
  sizePx: number,
  fraction = UNREAD_DOT_RADIUS_FRACTION,
): string {
  const radius = getUnreadDotRadiusPx(sizePx, fraction);
  const cx = sizePx - Math.max(1, Math.round(radius / 2));
  const cy = Math.max(1, Math.round(radius / 2));
  return `<svg width="${sizePx}" height="${sizePx}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${cx}" cy="${cy}" r="${radius}" fill="${UNREAD_INDICATOR_COLOR}"/>
    </svg>`;
}

/**
 * Draws an unread dot on a native image (BGRA bitmap). Used for tray and Dock on macOS.
 */
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

  const bitmap = image.toBitmap();
  const out = Buffer.from(bitmap);

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
