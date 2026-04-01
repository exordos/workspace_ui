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
  const { foundOldest, withoutAnchorCount, pageSize, toUpsertCount } = input;
  if (foundOldest) return false;
  if (withoutAnchorCount < pageSize) return false;
  if (toUpsertCount === 0 && withoutAnchorCount > 0) return false;
  return true;
}

/** After loading newer messages (anchor = newest in cache, num_after = pageSize). */
export function computeHasNewerAfterLoadNewerIdbPage(input: {
  foundNewest: boolean;
  withoutAnchorCount: number;
  pageSize: number;
  toUpsertCount: number;
}): boolean {
  const { foundNewest, withoutAnchorCount, pageSize, toUpsertCount } = input;
  if (foundNewest) return false;
  if (withoutAnchorCount < pageSize) return false;
  if (toUpsertCount === 0 && withoutAnchorCount > 0) return false;
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
