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
  COMPOSER_TEXTAREA_MIN_HEIGHT_PX,
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
}

/**
 * Whether a locked shell should drop `height` and return to auto-resize.
 *
 * Short content returns to auto when the shell reaches its natural height.
 * Long content stays locked at the four-line floor, and fullscreen stays
 * locked until the user collapses or drags it down.
 */
export function shouldReleaseManualComposerResize({
  textareaContentHeight,
  nextHeight,
  minHeight,
  isFullHeight,
}: ShouldReleaseManualComposerResizeInput): boolean {
  if (isFullHeight || nextHeight == null || minHeight == null) return false;
  return (
    textareaContentHeight <= COMPOSER_TEXTAREA_HEIGHT_BUTTON_MIN_HEIGHT_PX &&
    nextHeight <= minHeight + COMPOSER_RESIZE_AUTO_SNAP_PX
  );
}

/** The manual drag floor is natural for short text and four lines for long text. */
export function resolveComposerManualEditorMinHeight(textareaContentHeight: number): number {
  return Math.min(
    Math.max(textareaContentHeight, COMPOSER_TEXTAREA_MIN_HEIGHT_PX),
    COMPOSER_TEXTAREA_HEIGHT_BUTTON_MIN_HEIGHT_PX,
  );
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
 * Keep the tall layout inside a two-to-four-line hysteresis window.
 *
 * Moving compact actions into the left rail gives the textarea more width.
 * Without separate enter and exit thresholds, that width change can make the
 * measured content height alternate on every typed character.
 */
export interface ResolveComposerHeightButtonVisibilityInput {
  effectiveEditorHeight: number;
  isFullHeight: boolean;
  isManualResize: boolean;
  resetHysteresis?: boolean;
  wasVisible: boolean;
}

export function resolveComposerHeightButtonVisibility({
  effectiveEditorHeight,
  isFullHeight,
  isManualResize,
  resetHysteresis = false,
  wasVisible,
}: ResolveComposerHeightButtonVisibilityInput): boolean {
  if (isFullHeight) return true;
  if (isManualResize || resetHysteresis) {
    return effectiveEditorHeight >= COMPOSER_TEXTAREA_HEIGHT_BUTTON_MIN_HEIGHT_PX;
  }
  if (wasVisible) {
    return effectiveEditorHeight > COMPOSER_TEXTAREA_RESIZE_HANDLE_MIN_HEIGHT_PX;
  }
  return effectiveEditorHeight >= COMPOSER_TEXTAREA_HEIGHT_BUTTON_MIN_HEIGHT_PX;
}
