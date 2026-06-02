import { traceLinkPreview } from "~/shared/lib/message-link-preview-trace.lib";
import type {
  LinkPreviewCacheEntry,
  LinkPreviewResolvedItem,
} from "~/shared/lib/message-link-preview.types";

export function removeMessageFromInFlightMap<T>(
  inFlight: Map<number, T>,
  messageId: number,
): Map<number, T> {
  const next = new Map(inFlight);
  next.delete(messageId);
  return next;
}

export function linkPreviewItemHasData(item: LinkPreviewResolvedItem): boolean {
  return item.data != null;
}

export function countLinkPreviewItemsWithData(items: LinkPreviewResolvedItem[]): number {
  return items.filter(linkPreviewItemHasData).length;
}

export function computeEvictedLinkPreviewCacheIds(
  keysBefore: number[],
  keysAfter: number[],
  messageId: number,
): number[] {
  if (keysBefore.includes(messageId) && !keysAfter.includes(messageId)) {
    return [messageId];
  }
  return keysBefore.filter((id) => !keysAfter.includes(id));
}

export interface LinkPreviewInFlightSlice {
  inFlight: Map<number, Promise<LinkPreviewCacheEntry>>;
}

export function sliceAfterPreviewFetchAborted(
  state: LinkPreviewInFlightSlice,
  messageId: number,
): LinkPreviewInFlightSlice {
  return { inFlight: removeMessageFromInFlightMap(state.inFlight, messageId) };
}

export function sliceAfterPreviewDowngradeBlocked(
  state: LinkPreviewInFlightSlice,
  messageId: number,
): LinkPreviewInFlightSlice {
  return sliceAfterPreviewFetchAborted(state, messageId);
}

export interface ApplyResolvedPreviewSliceParams {
  state: LinkPreviewInFlightSlice & {
    byMessageId: Record<number, LinkPreviewCacheEntry>;
    maxEntries: number;
  };
  messageId: number;
  fingerprint: string;
  entry: LinkPreviewCacheEntry;
  touchMessageEntry: (
    entries: Record<number, LinkPreviewCacheEntry>,
    id: number,
    nextEntry: LinkPreviewCacheEntry,
    maxEntries: number,
  ) => Record<number, LinkPreviewCacheEntry>;
  mergeResolvedItems: (
    incoming: LinkPreviewResolvedItem[],
    previous: LinkPreviewResolvedItem[] | undefined,
  ) => LinkPreviewResolvedItem[];
  resolveCacheStatus: (items: LinkPreviewResolvedItem[]) => LinkPreviewCacheEntry["status"];
  entryHasPreviewData: (entry: LinkPreviewCacheEntry) => boolean;
}

export function sliceAfterPreviewResolved(
  params: ApplyResolvedPreviewSliceParams,
): LinkPreviewInFlightSlice & { byMessageId: Record<number, LinkPreviewCacheEntry> } {
  const {
    state,
    messageId,
    fingerprint,
    entry,
    touchMessageEntry,
    mergeResolvedItems,
    resolveCacheStatus,
    entryHasPreviewData,
  } = params;
  const current = state.byMessageId[messageId];
  const keysBefore = Object.keys(state.byMessageId).map(Number);

  if (
    entry.status === "unavailable" &&
    current?.status === "ready" &&
    current.contentFingerprint === fingerprint &&
    entryHasPreviewData(current)
  ) {
    traceLinkPreview("store:downgrade-blocked", {
      messageId,
      fingerprint,
      keptCount: countLinkPreviewItemsWithData(current.items),
    });
    return {
      byMessageId: state.byMessageId,
      ...sliceAfterPreviewDowngradeBlocked(state, messageId),
    };
  }

  const mergedItems = mergeResolvedItems(entry.items, current?.items);
  const mergedEntry: LinkPreviewCacheEntry = {
    ...entry,
    items: mergedItems,
    status: resolveCacheStatus(mergedItems),
    fetchedAt: Date.now(),
  };

  const nextByMessageId = touchMessageEntry(
    state.byMessageId,
    messageId,
    mergedEntry,
    state.maxEntries,
  );
  const keysAfter = Object.keys(nextByMessageId).map(Number);
  const evicted = computeEvictedLinkPreviewCacheIds(keysBefore, keysAfter, messageId);
  traceLinkPreview("store:resolved", {
    messageId,
    status: mergedEntry.status,
    fingerprint,
    itemCount: mergedEntry.items.length,
    withDataCount: countLinkPreviewItemsWithData(mergedEntry.items),
    evictedIds: evicted.length > 0 ? evicted : undefined,
    cacheSize: keysAfter.length,
  });
  return {
    byMessageId: nextByMessageId,
    inFlight: removeMessageFromInFlightMap(state.inFlight, messageId),
  };
}
