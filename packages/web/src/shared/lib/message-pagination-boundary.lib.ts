/**
 * Pure helpers for chat boundary pagination after a Zulip messages page fetch.
 *
 * Used by the current-chat messages store for IndexedDB and in-memory paths
 * so flags stay consistent with `found_oldest` / `found_newest` and local dedup.
 */

/** After loading older messages (anchor = oldest in cache, num_before = pageSize). */
export function computeHasOlderAfterLoadOlderIdbPage(input: {
  foundOldest: boolean;
  withoutAnchorCount: number;
  pageSize: number;
  toUpsertCount: number;
}): boolean {
  const { foundOldest, withoutAnchorCount, pageSize } = input;
  if (foundOldest) return false;
  if (withoutAnchorCount < pageSize) return false;
  // Full page from API implies more older history may exist, even when every row was
  // already in IndexedDB (overlap). Stopping here cleared hasOlder and blocked further loads.
  return true;
}

/** After loading newer messages (anchor = newest in cache, num_after = pageSize). */
export function computeHasNewerAfterLoadNewerIdbPage(input: {
  foundNewest: boolean;
  withoutAnchorCount: number;
  pageSize: number;
  toUpsertCount: number;
}): boolean {
  const { foundNewest, withoutAnchorCount, pageSize } = input;
  if (foundNewest) return false;
  if (withoutAnchorCount < pageSize) return false;
  return true;
}

/** In-memory store: no IndexedDB dedup overlap. */
export function computeHasOlderAfterLoadOlderMemoryPage(input: {
  foundOldest: boolean;
  withoutAnchorCount: number;
  pageSize: number;
}): boolean {
  return !input.foundOldest && input.withoutAnchorCount >= input.pageSize;
}

export function computeHasNewerAfterLoadNewerMemoryPage(input: {
  foundNewest: boolean;
  withoutAnchorCount: number;
  pageSize: number;
}): boolean {
  return !input.foundNewest && input.withoutAnchorCount >= input.pageSize;
}

/**
 * Oldest message id for the next "load older" request when the Zustand list can
 * run ahead of IndexedDB (store prepends before IDB read catches up). Uses the
 * minimum id so the API anchor matches the true oldest row in memory or cache.
 */
export function mergeOlderLoadAnchor(
  storeOldestId: number | null | undefined,
  idbOldestId: number | null | undefined,
): number | null {
  if (storeOldestId != null && idbOldestId != null) return Math.min(storeOldestId, idbOldestId);
  if (storeOldestId != null) return storeOldestId;
  if (idbOldestId != null) return idbOldestId;
  return null;
}
