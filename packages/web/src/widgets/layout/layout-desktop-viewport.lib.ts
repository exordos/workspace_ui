import type { CSSProperties } from "react";

export const DESKTOP_MIN_VIEWPORT_WIDTH_PX = 1200;

export const DESKTOP_MIN_VIEWPORT_STYLE: CSSProperties = Object.freeze({
  minWidth: `${DESKTOP_MIN_VIEWPORT_WIDTH_PX}px`,
});
