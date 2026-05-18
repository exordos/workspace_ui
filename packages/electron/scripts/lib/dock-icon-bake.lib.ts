/**
 * Dev-only: bakes macOS Dock PNGs (`npm run bake:icons`). Not imported by app main.
 */

import type { NativeImage } from "electron";

export const MAC_DOCK_ICON_CORNER_RADIUS_FRACTION = 0.2237;
export const MAC_DOCK_PLATE_INSET_FRACTION = 0.1;
export const MAC_DOCK_LOGO_SIZE_FRACTION = 0.76;
export const MAC_DOCK_ICON_CANVAS_PX = 512;
export const MAC_DOCK_BG_TOP = "#3A3A3C";
export const MAC_DOCK_BG_BOTTOM = "#1C1C1E";

export function isInsideMacDockSquircle(
  x: number,
  y: number,
  sizePx: number,
  originX = 0,
  originY = 0,
): boolean {
  const localX = x - originX;
  const localY = y - originY;
  const radius = Math.min(
    sizePx * MAC_DOCK_ICON_CORNER_RADIUS_FRACTION,
    sizePx / 2,
  );
  if (localX < 0 || localY < 0 || localX >= sizePx || localY >= sizePx) return false;
  if (localX >= radius && localX < sizePx - radius) return true;
  if (localY >= radius && localY < sizePx - radius) return true;

  const checkCorner = (cx: number, cy: number): boolean => {
    const dx = localX - cx;
    const dy = localY - cy;
    return dx * dx + dy * dy <= radius * radius;
  };

  if (localX < radius && localY < radius) return checkCorner(radius, radius);
  if (localX >= sizePx - radius && localY < radius) return checkCorner(sizePx - radius, radius);
  if (localX < radius && localY >= sizePx - radius) return checkCorner(radius, sizePx - radius);
  return checkCorner(sizePx - radius, sizePx - radius);
}

export function getMacDockPlateGeometry(canvasPx: number): {
  insetPx: number;
  platePx: number;
} {
  const insetPx = Math.max(0, Math.round(canvasPx * MAC_DOCK_PLATE_INSET_FRACTION));
  return { insetPx, platePx: Math.max(32, canvasPx - insetPx * 2) };
}

function parseHexColor(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace("#", "");
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function lerpByte(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function backgroundColorAt(y: number, sizePx: number): { r: number; g: number; b: number } {
  const top = parseHexColor(MAC_DOCK_BG_TOP);
  const bottom = parseHexColor(MAC_DOCK_BG_BOTTOM);
  const t = sizePx <= 1 ? 0 : y / (sizePx - 1);
  return {
    r: lerpByte(top.r, bottom.r, t),
    g: lerpByte(top.g, bottom.g, t),
    b: lerpByte(top.b, bottom.b, t),
  };
}

function readLogoBgra(
  logoBitmap: Buffer,
  logoWidth: number,
  logoX: number,
  logoY: number,
): { b: number; g: number; r: number; a: number } | null {
  if (logoX < 0 || logoY < 0 || logoX >= logoWidth) return null;
  const logoHeight = logoBitmap.length / (logoWidth * 4);
  if (logoY >= logoHeight) return null;
  const idx = (logoY * logoWidth + logoX) * 4;
  return {
    b: logoBitmap[idx] ?? 0,
    g: logoBitmap[idx + 1] ?? 0,
    r: logoBitmap[idx + 2] ?? 0,
    a: logoBitmap[idx + 3] ?? 0,
  };
}

function blendOverBackground(
  bg: { r: number; g: number; b: number },
  fg: { b: number; g: number; r: number; a: number },
): { b: number; g: number; r: number } {
  const alpha = fg.a / 255;
  return {
    b: Math.round(fg.b * alpha + bg.b * (1 - alpha)),
    g: Math.round(fg.g * alpha + bg.g * (1 - alpha)),
    r: Math.round(fg.r * alpha + bg.r * (1 - alpha)),
  };
}

export function buildMacDockIconFromLogo(
  logo: NativeImage,
  canvasPx = MAC_DOCK_ICON_CANVAS_PX,
): NativeImage {
  const { nativeImage } = require("electron") as typeof import("electron");
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
      const color =
        logoPixel != null && logoPixel.a > 0 ? blendOverBackground(bg, logoPixel) : bg;

      out[idx] = color.b;
      out[idx + 1] = color.g;
      out[idx + 2] = color.r;
      out[idx + 3] = 255;
    }
  }

  return nativeImage.createFromBitmap(out, { width: canvasPx, height: canvasPx });
}
