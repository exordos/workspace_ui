/**
 * Unread indicator constants for Electron (Windows taskbar overlay SVG).
 *
 * Tray and Dock use baked `*-unread.png` assets in `resources/`.
 * Web favicon uses `public/favicon-unread.svg`.
 */

/** Must match web `brand.unreadIndicatorColor` default / VITE_UNREAD_INDICATOR_COLOR. */
export const UNREAD_INDICATOR_COLOR = "#FF5500";

/** Matches favicon-unread.svg (r=80 on viewBox width 680). */
export const UNREAD_DOT_RADIUS_FRACTION = 80 / 680;

export function getUnreadDotRadiusPx(
  iconSizePx: number,
  fraction = UNREAD_DOT_RADIUS_FRACTION,
): number {
  return Math.max(1, Math.round(iconSizePx * fraction));
}

export function createUnreadDotOverlaySvg(
  sizePx: number,
  fraction = UNREAD_DOT_RADIUS_FRACTION,
): string {
  const radius = getUnreadDotRadiusPx(sizePx, fraction);
  const cx = sizePx - radius;
  const cy = radius;
  return `<svg width="${sizePx}" height="${sizePx}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${cx}" cy="${cy}" r="${radius}" fill="${UNREAD_INDICATOR_COLOR}"/>
    </svg>`;
}
