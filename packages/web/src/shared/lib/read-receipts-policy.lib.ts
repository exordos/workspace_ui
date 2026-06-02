/**
 * Pure predicates for when chat read receipts may advance (Zulip flags API).
 *
 * Used by the message list (viewport) and chat page (bulk narrow). Tab
 * visibility is handled separately via `isTabVisible()` in UI layers.
 */

export interface ReadTailReadyInput {
  isAtBottom: boolean;
  hasNewerMessages: boolean;
  /** True only while load-newer pagination is in flight (not load-older). */
  loadingNewer: boolean;
}

/** True when the scroll position represents the newest loaded edge and no newer fetch is pending. */
export function computeReadTailReady(input: ReadTailReadyInput): boolean {
  return input.isAtBottom && !input.hasNewerMessages && !input.loadingNewer;
}

/** Keeps only ids that appear in the viewport-derived allowlist (IntersectionObserver / takeRecords). */
export function filterMessageIdsToViewportAllowlist(
  messageIds: readonly number[],
  viewportMessageIds: ReadonlySet<number>,
): number[] {
  if (messageIds.length === 0 || viewportMessageIds.size === 0) return [];
  const out: number[] = [];
  for (const id of messageIds) {
    if (Number.isInteger(id) && id > 0 && viewportMessageIds.has(id)) {
      out.push(id);
    }
  }
  return out;
}

/** Narrow bulk (mark topic / mark DM) may run from automatic bottom path only at tail-ready. */
export function canAutoBulkMarkAsRead(tailReady: boolean): boolean {
  return tailReady;
}

export interface DeferAutoMarkUnreadInput {
  firstUnreadId: number | null | undefined;
  unreadCount: number;
  userScrollSeen: boolean;
}

/** Matches IntersectionObserver threshold for viewport read receipts. */
export const VIEWPORT_READ_VISIBLE_RATIO = 0.5;

/**
 * After opening a chat with unreads, defer automatic read receipts until the user scrolls.
 * Blocks intersection-based and tail/at-bottom bulk paths so only messages the user reveals
 * by scrolling are marked (single-unread chats use a dedicated anchor-visible flush).
 */
export function shouldDeferAutoMarkUnreadUntilUserScroll(input: DeferAutoMarkUnreadInput): boolean {
  return input.firstUnreadId != null && input.unreadCount > 0 && !input.userScrollSeen;
}

/** DOM fallback when IntersectionObserver has not fired yet after scroll-to-unread. */
export function collectViewportVisibleUnreadIds(
  root: HTMLElement,
  candidateIds: ReadonlySet<number>,
  minVisibleRatio: number = VIEWPORT_READ_VISIBLE_RATIO,
): number[] {
  if (candidateIds.size === 0) return [];
  const rootRect = root.getBoundingClientRect();
  const visible: number[] = [];
  for (const messageId of candidateIds) {
    const node = root.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
    if (node == null) continue;
    const rect = node.getBoundingClientRect();
    const visibleHeight = Math.min(rect.bottom, rootRect.bottom) - Math.max(rect.top, rootRect.top);
    if (visibleHeight <= 0) continue;
    const elementHeight = Math.max(rect.height, 1);
    if (visibleHeight / elementHeight >= minVisibleRatio) {
      visible.push(messageId);
    }
  }
  return visible;
}
