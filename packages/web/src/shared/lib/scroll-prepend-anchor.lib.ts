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

export interface ScrollPrependAnchor {
  messageId: number;
  offsetTop: number;
}

function findMessageNode(root: HTMLElement, messageId: number): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
}

export function resolveVisibleMessageAnchor(root: HTMLElement): ScrollPrependAnchor | null {
  const rootRect = root.getBoundingClientRect();
  for (const node of root.querySelectorAll<HTMLElement>("[data-message-id]")) {
    const rawId = node.getAttribute("data-message-id");
    if (rawId == null) continue;
    const messageId = Number(rawId);
    if (!Number.isInteger(messageId)) continue;

    const rect = node.getBoundingClientRect();
    if (rect.bottom <= rootRect.top || rect.top >= rootRect.bottom) continue;

    return {
      messageId,
      offsetTop: rect.top - rootRect.top,
    };
  }
  return null;
}

export function computeScrollTopFromAnchor(
  root: HTMLElement,
  anchor: ScrollPrependAnchor,
): number | null {
  const node = findMessageNode(root, anchor.messageId);
  if (node == null) return null;

  const rootRect = root.getBoundingClientRect();
  const nodeRect = node.getBoundingClientRect();
  const next = root.scrollTop + (nodeRect.top - rootRect.top - anchor.offsetTop);
  return Math.max(0, next);
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
