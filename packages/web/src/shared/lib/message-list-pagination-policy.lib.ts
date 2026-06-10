/**
 * Guards for automatic boundary pagination in the message list scroll container.
 *
 * Prevents load-older/load-newer from firing after programmatic scroll-to-unread on chat open.
 */

export interface CanAutoLoadOlderInput {
  userScrollSeen: boolean;
  programmaticScroll: boolean;
  scrollTop: number;
  loadMoreThreshold: number;
  isLoadingMore: boolean;
  hasOnLoadMore: boolean;
  /** When false, top auto-load was already triggered for this top visit (Feed-style debounce). */
  topPaginationArmed: boolean;
}

export function canAutoLoadOlder(input: CanAutoLoadOlderInput): boolean {
  if (!input.hasOnLoadMore || input.isLoadingMore) {
    return false;
  }
  if (!input.userScrollSeen || input.programmaticScroll) {
    return false;
  }
  if (!input.topPaginationArmed) {
    return false;
  }
  return input.scrollTop < input.loadMoreThreshold;
}

export interface CanAutoLoadNewerInput {
  userScrollSeen: boolean;
  programmaticScroll: boolean;
  atBottom: boolean;
  hasNewerMessages: boolean;
  isLoadingMore: boolean;
  hasOnLoadNewer: boolean;
  /** When set, auto load-newer requires this unread row to be at/near the viewport bottom. */
  lastUnreadNearViewportBottom: boolean;
}

export function canAutoLoadNewer(input: CanAutoLoadNewerInput): boolean {
  if (!input.hasOnLoadNewer || input.isLoadingMore) {
    return false;
  }
  if (!input.userScrollSeen || input.programmaticScroll) {
    return false;
  }
  if (!input.atBottom || !input.hasNewerMessages) {
    return false;
  }
  return input.lastUnreadNearViewportBottom;
}

export interface ViewportBottomCheckInput {
  rootTop: number;
  rootBottom: number;
  elementBottom: number;
  bottomThreshold: number;
}

/** True when the element's bottom edge is within the scroll root's bottom band. */
export function isElementNearViewportBottom(input: ViewportBottomCheckInput): boolean {
  return input.elementBottom <= input.rootBottom + input.bottomThreshold;
}
