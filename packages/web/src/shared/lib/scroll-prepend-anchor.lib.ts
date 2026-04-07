/**
 * Scroll position helpers when content is prepended above the viewport (e.g. chat history, feed).
 *
 * After `scrollHeight` grows at the top, the browser keeps the same `scrollTop`, which shifts the
 * visible messages. Restoring with the delta keeps the prior viewport anchored.
 */

export interface ScrollPrependSnapshot {
  scrollTop: number;
  scrollHeight: number;
}

/**
 * Computes the next `scrollTop` after prepending content above the scroll area.
 * Keeps the previously visible content anchored in the viewport.
 */
export function computeScrollTopAfterPrepend(
  previous: ScrollPrependSnapshot,
  nextScrollHeight: number,
): number {
  const next = nextScrollHeight - previous.scrollHeight + previous.scrollTop;
  return Math.max(0, next);
}
