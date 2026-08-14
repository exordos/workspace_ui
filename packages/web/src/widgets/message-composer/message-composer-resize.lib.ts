/**
 * Manual composer height is a temporary override of auto-resize.
 *
 * Auto-resize owns the field until the user drags the handle or expands
 * to full messenger height. We snap back to auto when the field is again
 * at the size where those controls first appear, so extra empty space
 * does not outlive the text that created it.
 */
import {
  COMPOSER_TEXTAREA_HEIGHT_BUTTON_MIN_HEIGHT_PX,
  COMPOSER_TEXTAREA_RESIZE_HANDLE_MIN_HEIGHT_PX,
} from "./message-composer-constants.lib";

/** Treat a 1px miss as "already at the bound" (same epsilon as full-height). */
export const COMPOSER_RESIZE_AUTO_SNAP_PX = 1;

export interface ShouldReleaseManualComposerResizeInput {
  textareaContentHeight: number;
  /** Current or next locked shell height. Omit when only content is known. */
  nextHeight?: number;
  /** Natural auto-sized shell height. Omit when only content is known. */
  minHeight?: number;
  isFullHeight: boolean;
  /** True when the textarea content height just decreased. */
  contentShrunk?: boolean;
}

/**
 * Whether a locked shell should drop `height` and return to auto-resize.
 *
 * Two-line content (handle threshold) always releases, including fullscreen:
 * there is nothing left for a manual override to do. Dragging/keying the
 * shell down to its natural size also releases. A content shrink outside
 * fullscreen releases so deleted text can pull the field down.
 */
export function shouldReleaseManualComposerResize({
  textareaContentHeight,
  nextHeight,
  minHeight,
  isFullHeight,
  contentShrunk = false,
}: ShouldReleaseManualComposerResizeInput): boolean {
  if (textareaContentHeight <= COMPOSER_TEXTAREA_RESIZE_HANDLE_MIN_HEIGHT_PX) {
    return true;
  }
  // Fullscreen tracks the messenger max. A tiny viewport can make max ===
  // natural; that is not "the user dragged back to auto".
  if (
    !isFullHeight &&
    nextHeight != null &&
    minHeight != null &&
    nextHeight <= minHeight + COMPOSER_RESIZE_AUTO_SNAP_PX
  ) {
    return true;
  }
  return contentShrunk && !isFullHeight;
}

/** Drag handle appears at two lines, and stays while a taller override is locked. */
export function isComposerResizeHandleVisible(
  textareaContentHeight: number,
  manualHeight: number | null,
): boolean {
  return (
    textareaContentHeight >= COMPOSER_TEXTAREA_RESIZE_HANDLE_MIN_HEIGHT_PX || manualHeight != null
  );
}

/**
 * Expand/collapse is a fullscreen control, not a "manual mode is on" badge.
 * Hide it once content is back below the four-line threshold, unless the
 * shell is currently expanded to the messenger.
 */
export function isComposerHeightButtonVisible(
  textareaContentHeight: number,
  isFullHeight: boolean,
): boolean {
  return isFullHeight || textareaContentHeight >= COMPOSER_TEXTAREA_HEIGHT_BUTTON_MIN_HEIGHT_PX;
}
