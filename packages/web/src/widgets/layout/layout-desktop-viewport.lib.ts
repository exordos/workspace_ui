import type { CSSProperties } from "react";
import { DESKTOP_MIN_VIEWPORT_WIDTH_PX } from "~/shared/config/constants";

export { DESKTOP_MIN_VIEWPORT_WIDTH_PX };

export const DESKTOP_MIN_VIEWPORT_STYLE: CSSProperties = Object.freeze({
  minWidth: `${DESKTOP_MIN_VIEWPORT_WIDTH_PX}px`,
});
