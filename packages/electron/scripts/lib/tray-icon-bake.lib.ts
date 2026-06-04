/**
 * Dev-only: bakes menu bar tray PNGs (`npm run bake:icons`). Not imported by app main.
 */

import type { NativeImage } from "electron";

/** 16pt @2x — native menu bar asset size. */
export const MAC_TRAY_ICON_CANVAS_PX = 32;

/** Win/Linux tray PNG size (Linux uses full resolution; Windows downscales to 16 in main). */
export const LINUX_TRAY_ICON_CANVAS_PX = 32;

export const MAC_TRAY_LOGO_SIZE_FRACTION = 0.62;

/** Larger glyph — status panels often render tray icons smaller than the PNG bounds. */
export const LINUX_TRAY_LOGO_SIZE_FRACTION = 0.78;

export const MAC_TRAY_ICON_WHITE = 255;

/** Smaller than Dock/favicon — menu bar dot must stay subtle at 32px. */
export const TRAY_UNREAD_DOT_RADIUS_FRACTION = 42 / 680;

/** Source alpha at or above this value becomes fully opaque white (binary tray silhouettes). */
export const TRAY_BINARY_ALPHA_THRESHOLD = 48;

/** @deprecated Use {@link TRAY_BINARY_ALPHA_THRESHOLD}. */
export const LINUX_TRAY_ALPHA_THRESHOLD = TRAY_BINARY_ALPHA_THRESHOLD;

export type TrayIconAlphaMode = "luminance" | "binary";

export function resolveTraySilhouetteAlpha(
  b: number,
  g: number,
  r: number,
  a: number,
  mode: TrayIconAlphaMode,
): number {
  if (a === 0) return 0;
  if (mode === "binary") {
    return a >= TRAY_BINARY_ALPHA_THRESHOLD ? 255 : 0;
  }
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return Math.min(255, Math.round((a / 255) * (luminance / 255) * 255));
}

export function getMacTrayLogoLayout(canvasPx = MAC_TRAY_ICON_CANVAS_PX): {
  canvasPx: number;
  logoSize: number;
  offsetX: number;
  offsetY: number;
} {
  return getTrayLogoLayout(canvasPx, MAC_TRAY_LOGO_SIZE_FRACTION);
}

export function getLinuxTrayLogoLayout(canvasPx = LINUX_TRAY_ICON_CANVAS_PX): {
  canvasPx: number;
  logoSize: number;
  offsetX: number;
  offsetY: number;
} {
  return getTrayLogoLayout(canvasPx, LINUX_TRAY_LOGO_SIZE_FRACTION);
}

function getTrayLogoLayout(
  canvasPx: number,
  logoSizeFraction: number,
): {
  canvasPx: number;
  logoSize: number;
  offsetX: number;
  offsetY: number;
} {
  const logoSize = Math.max(14, Math.round(canvasPx * logoSizeFraction));
  const offsetX = Math.floor((canvasPx - logoSize) / 2);
  const offsetY = Math.floor((canvasPx - logoSize) / 2);
  return { canvasPx, logoSize, offsetX, offsetY };
}

export function getMacTrayUnreadDotInsets(canvasPx = MAC_TRAY_ICON_CANVAS_PX): {
  rightPx: number;
  topPx: number;
} {
  const { logoSize, offsetX, offsetY } = getMacTrayLogoLayout(canvasPx);
  const radius = Math.max(1, Math.round(canvasPx * TRAY_UNREAD_DOT_RADIUS_FRACTION));
  const logoRight = offsetX + logoSize;
  const logoTop = offsetY;
  const cx = logoRight - Math.max(1, Math.round(radius * 0.35));
  const cy = logoTop + Math.max(1, Math.round(radius * 0.9));
  return {
    rightPx: Math.max(0, canvasPx - radius - cx),
    topPx: Math.max(0, cy - radius),
  };
}

export function getLinuxTrayUnreadDotInsets(canvasPx = LINUX_TRAY_ICON_CANVAS_PX): {
  rightPx: number;
  topPx: number;
} {
  return getMacTrayUnreadDotInsets(canvasPx);
}

function buildTrayIconFromLogo(
  logo: NativeImage,
  options: {
    canvasPx: number;
    logoSizeFraction: number;
    alphaMode: TrayIconAlphaMode;
  },
): NativeImage {
  const { nativeImage } = require("electron") as typeof import("electron");
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
        alphaMode,
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

/** macOS menu bar: solid white silhouette, no grayscale anti-aliasing. */
export function buildMacTrayIconFromLogo(logo: NativeImage): NativeImage {
  return buildTrayIconFromLogo(logo, {
    canvasPx: MAC_TRAY_ICON_CANVAS_PX,
    logoSizeFraction: MAC_TRAY_LOGO_SIZE_FRACTION,
    alphaMode: "binary",
  });
}

/** StatusNotifier: solid white silhouette, no grayscale anti-aliasing. */
export function buildLinuxTrayIconFromLogo(logo: NativeImage): NativeImage {
  return buildTrayIconFromLogo(logo, {
    canvasPx: LINUX_TRAY_ICON_CANVAS_PX,
    logoSizeFraction: LINUX_TRAY_LOGO_SIZE_FRACTION,
    alphaMode: "binary",
  });
}
