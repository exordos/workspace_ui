/**
 * Activity data layer — no-network placeholder for legacy Zulip-backed activity filters.
 */
import type { ActivityFilter, ActivityMessagesPageResult } from "~/shared/api/zulip.types";

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
}

export function loadLegacyActivityEmptyPage(
  _filter: ActivityFilter,
  _currentUserId?: number | null,
  _anchor: number | "newest" = "newest",
  _numBefore = 200,
  options?: { signal?: AbortSignal },
): Promise<ActivityMessagesPageResult> {
  throwIfAborted(options?.signal);
  return Promise.resolve({
    messages: [],
    foundOldest: true,
  });
}
