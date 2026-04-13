/**
 * Viewport positioning for the @mention user popover (same strategy as composer pickers).
 */
const VIEWPORT_MARGIN = 8;
/** Space between the mention anchor and the popover edge (slightly more than composer pickers for readability). */
const GAP = 14;

export interface MentionPopoverPositionInput {
  anchorRect: Pick<DOMRect, "left" | "top" | "bottom" | "width"> | null;
  popoverWidth: number;
  popoverHeight: number;
  viewportWidth: number;
  viewportHeight: number;
}

export function computeMentionPopoverPosition({
  anchorRect,
  popoverWidth,
  popoverHeight,
  viewportWidth,
  viewportHeight,
}: MentionPopoverPositionInput): { left: number; top: number; width: number } {
  const width = Math.min(popoverWidth, Math.max(160, viewportWidth - VIEWPORT_MARGIN * 2));
  const fallbackTop = Math.max(VIEWPORT_MARGIN, viewportHeight - popoverHeight - VIEWPORT_MARGIN);
  if (anchorRect == null) {
    return { left: VIEWPORT_MARGIN, top: fallbackTop, width };
  }

  const desiredLeft = anchorRect.left + anchorRect.width / 2 - width / 2;
  const maxLeft = Math.max(VIEWPORT_MARGIN, viewportWidth - width - VIEWPORT_MARGIN);
  const left = Math.min(Math.max(VIEWPORT_MARGIN, desiredLeft), maxLeft);

  const topAbove = anchorRect.top - popoverHeight - GAP;
  if (topAbove >= VIEWPORT_MARGIN) {
    return { left, top: topAbove, width };
  }

  const topBelow = anchorRect.bottom + GAP;
  const maxTop = Math.max(VIEWPORT_MARGIN, viewportHeight - popoverHeight - VIEWPORT_MARGIN);
  return {
    left,
    top: Math.min(Math.max(VIEWPORT_MARGIN, topBelow), maxTop),
    width,
  };
}

export const MENTION_POPOVER_WIDTH = 300;
export const MENTION_POPOVER_EST_HEIGHT = 320;
