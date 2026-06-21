/**
 * Pure helpers for chat boundary pagination after a messenger messages page fetch.
 *
 * Used by the current-chat messages store for IndexedDB and in-memory paths
 * so flags stay consistent with `found_oldest` / `found_newest` and local dedup.
 */
import type { MessageId } from "~/shared/lib/message-id.lib";

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

/**
 * Resolves hasOlderMessages for the in-memory chat store after load-older.
 * Stops when the API page adds no new rows (same anchor would repeat forever).
 */
export function resolveHasOlderAfterLoadOlderPage(input: {
  foundOldest: boolean;
  withoutAnchorCount: number;
  pageSize: number;
  toUpsertCount: number;
}): boolean {
  const { foundOldest, withoutAnchorCount, pageSize, toUpsertCount } = input;
  if (foundOldest) return false;
  if (withoutAnchorCount < pageSize) return false;
  if (toUpsertCount > 0) return true;
  return false;
}

/** First message id in the ordered store — safe anchor for UUID ids. */
export function resolveOldestMessageId(messages: readonly { id: MessageId }[]): MessageId | null {
  if (messages.length === 0) return null;
  return messages[0]!.id;
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
  storeOldestId: MessageId | null | undefined,
  idbOldestId: MessageId | null | undefined,
): MessageId | null {
  if (storeOldestId != null) return storeOldestId;
  if (idbOldestId != null) return idbOldestId;
  return null;
}
