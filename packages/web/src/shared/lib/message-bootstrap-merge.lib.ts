/**
 * Merge IndexedDB-cached messages with a REST delta (e.g. newer-than-anchor page).
 *
 * Used when reopening a chat: show cache immediately, append only new ids from API.
 */
import type { MockMessage } from "~/shared/api/zulip.types";

/** Merges ascending cached list with delta; same id prefers delta (server wins). */
export function mergeCachedMessagesWithDelta(
  cachedAscending: readonly MockMessage[],
  delta: readonly MockMessage[],
): MockMessage[] {
  const byId = new Map<number, MockMessage>();
  for (const m of cachedAscending) {
    byId.set(m.id, m);
  }
  for (const m of delta) {
    byId.set(m.id, m);
  }
  return Array.from(byId.values()).sort((a, b) => a.id - b.id);
}

/** Messages in `delta` that are not already in `cachedIds` (for upsert-only writes). */
export function filterDeltaMessagesNotInCache(
  cachedIds: ReadonlySet<number>,
  delta: readonly MockMessage[],
): MockMessage[] {
  return delta.filter((m) => !cachedIds.has(m.id));
}

/**
 * After incremental "newer than anchor" fetch: true if client should offer "load newer"
 * (server may have more newer than we requested).
 */
export function computeHasMoreNewerAfterIdbDeltaFetch(input: {
  foundNewest: boolean;
  deltaReturnedCount: number;
  numAfterRequested: number;
}): boolean {
  if (input.foundNewest) return false;
  return input.deltaReturnedCount >= input.numAfterRequested;
}
