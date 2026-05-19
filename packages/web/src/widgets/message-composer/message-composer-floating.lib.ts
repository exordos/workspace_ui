/**
 * Floating popover positioning for emoji, schedule, and saved-snippet menus.
 */
import { computeFloatingPickerPosition } from "./message-composer-picker-position.lib";
import type { CSSProperties } from "react";

export function getFloatingPickerStyle(
  anchor: HTMLElement | null,
  pickerWidth: number,
  pickerHeight: number,
): CSSProperties {
  if (typeof window === "undefined") return {};
  const { left, top, width } = computeFloatingPickerPosition({
    anchorRect: anchor?.getBoundingClientRect() ?? null,
    pickerWidth,
    pickerHeight,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  });
  return { left, top, width };
}
