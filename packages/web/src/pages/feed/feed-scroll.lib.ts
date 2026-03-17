export interface FeedPaginationScrollState {
  scrollTop: number;
  isLoadingMore: boolean;
  isAllLoaded: boolean;
  lastMessageId: number | null;
}

export interface FeedScrollSnapshot {
  scrollTop: number;
  scrollHeight: number;
}

const DEFAULT_TOP_THRESHOLD_PX = 64;

/** Returns true when feed should request the next older page. */
export function shouldRequestOlderFeedPage(
  state: FeedPaginationScrollState,
  topThresholdPx = DEFAULT_TOP_THRESHOLD_PX,
): boolean {
  if (state.isLoadingMore || state.isAllLoaded || state.lastMessageId == null) {
    return false;
  }

  return state.scrollTop <= topThresholdPx;
}

/**
 * Computes the next scrollTop after prepending older messages.
 * Keeps the currently visible content anchored.
 */
export function computeFeedScrollTopAfterPrepend(
  previous: FeedScrollSnapshot,
  nextScrollHeight: number,
): number {
  const next = nextScrollHeight - previous.scrollHeight + previous.scrollTop;
  return Math.max(0, next);
}
