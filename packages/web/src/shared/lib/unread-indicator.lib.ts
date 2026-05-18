/**
 * Unread indicator dot — shared geometry and default color.
 *
 * Static `*-unread.svg` assets use the same relative size (see UNREAD_DOT_RADIUS_FRACTION).
 * Canvas/runtime overlays compute radius from icon pixel size.
 */

import { brand } from "~/shared/lib/brand";

/** Default #FF5500 — brighter than brand accent for legibility at 16–32px. Override via VITE_UNREAD_INDICATOR_COLOR. */
export const UNREAD_INDICATOR_COLOR = brand.unreadIndicatorColor;

/** Dot radius / icon width (matches r=80 on viewBox 680 in favicon-unread.svg). */
export const UNREAD_DOT_RADIUS_FRACTION = 80 / 680;

export function getUnreadDotRadiusPx(iconSizePx: number): number {
  return Math.max(3, Math.round(iconSizePx * UNREAD_DOT_RADIUS_FRACTION));
}

export function getUnreadDotCenterTopRight(iconSizePx: number): { x: number; y: number } {
  const radius = getUnreadDotRadiusPx(iconSizePx);
  return {
    x: iconSizePx - radius,
    y: radius,
  };
}
