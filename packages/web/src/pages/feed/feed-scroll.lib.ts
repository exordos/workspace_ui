import type { ScrollPrependSnapshot } from "~/shared/lib/scroll-prepend-anchor.lib";
import { computeScrollTopAfterPrepend } from "~/shared/lib/scroll-prepend-anchor.lib";

export interface FeedPaginationScrollState {
  scrollTop: number;
  isLoadingMore: boolean;
  isAllLoaded: boolean;
  lastMessageId: number | null;
}

export type FeedScrollSnapshot = ScrollPrependSnapshot;

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

export function computeFeedScrollTopAfterPrepend(
  previous: ScrollPrependSnapshot,
  nextScrollHeight: number,
): number {
  return computeScrollTopAfterPrepend(previous, nextScrollHeight);
}
