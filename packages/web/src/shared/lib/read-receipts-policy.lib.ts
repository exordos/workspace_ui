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
