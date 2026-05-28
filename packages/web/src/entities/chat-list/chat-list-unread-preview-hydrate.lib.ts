/**
 * Hydrates missing stream/topic sidebar previews from register unread snapshot.
 *
 * Why: register `unread_snapshot` is authoritative for counts, but contains only message ids.
 * For chats whose latest activity is older than the global 5000-message preview window,
 * sidebar rows can show unread badges while lacking preview text and timestamps used for sorting.
 *
 * This module batch-fetches the latest unread message per stream/topic via Zulip 10+ `message_ids`
 * and merges preview metadata without affecting unread totals.
 */
import { fetchMessagesByIds } from "~/shared/api/zulip-messages";
import type { ZulipUnreadMessagesSnapshot } from "~/shared/api/zulip-unread.lib";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import type { StreamEntryInternal } from "~/shared/types/sidebar-chat";
import { filterStreamMessagesForSidebar } from "./chat-list-stream-preview-from-messages.lib";
import { useChatListStore } from "./chat-list.model";

function maxPositiveInt(values: readonly number[]): number | null {
  let max: number | null = null;
  for (const v of values) {
    if (!Number.isInteger(v) || v <= 0) continue;
    if (max == null || v > max) max = v;
  }
  return max;
}

function hasNonEmptyPreviewText(value: string | undefined): boolean {
  return (value?.trim() ?? "").length > 0;
}

function shouldHydrateBucketPreview(
  streamsMap: Map<number, StreamEntryInternal>,
  bucket: { streamId: number; topic: string },
): boolean {
  const stream = streamsMap.get(bucket.streamId);
  const topicKey = normalizeTopicForIdentity(bucket.topic);
  const topic = stream?.topics.get(topicKey);

  // If the topic row is missing or has empty preview text — hydrate.
  if (!hasNonEmptyPreviewText(topic?.lastMessage)) return true;

  // If topic has preview but stream-level preview text is empty — hydrate.
  // (Stream preview should reflect latest topic activity.)
  if (!hasNonEmptyPreviewText(stream?.lastMessage)) return true;

  return false;
}

export function resolveLatestUnreadMessageIdsForMissingPreviews(
  snapshot: ZulipUnreadMessagesSnapshot,
  streamsMap: Map<number, StreamEntryInternal>,
): number[] {
  const ids = new Set<number>();
  for (const bucket of snapshot.streams) {
    if (!Number.isInteger(bucket.streamId) || bucket.streamId <= 0) continue;
    if (!Array.isArray(bucket.unreadMessageIds) || bucket.unreadMessageIds.length === 0) continue;
    if (
      !shouldHydrateBucketPreview(streamsMap, { streamId: bucket.streamId, topic: bucket.topic })
    ) {
      continue;
    }
    const latest = maxPositiveInt(bucket.unreadMessageIds);
    if (latest != null) {
      ids.add(latest);
    }
  }
  return [...ids];
}

let inFlight: Promise<void> | null = null;

/**
 * Best-effort hydrate: if request fails, sidebar still functions (counts are already correct).
 * Dedupes concurrent calls to avoid repeated batch fetches during fast remounts.
 */
export function hydrateStreamSidebarPreviewsFromUnreadSnapshot(
  snapshot: ZulipUnreadMessagesSnapshot | null | undefined,
  cancelled?: () => boolean,
): Promise<void> {
  if (snapshot == null) return Promise.resolve();
  if (cancelled?.() === true) return Promise.resolve();
  if (inFlight != null) return inFlight;

  inFlight = (async () => {
    try {
      const { streamsMap } = useChatListStore.getState();
      const messageIds = resolveLatestUnreadMessageIdsForMissingPreviews(snapshot, streamsMap);
      if (messageIds.length === 0) return;
      if (cancelled?.() === true) return;

      const messages = await fetchMessagesByIds(messageIds);
      if (cancelled?.() === true) return;

      const streamOnly = filterStreamMessagesForSidebar(messages);
      if (streamOnly.length === 0) return;

      useChatListStore.getState().applyStreamSidebarPreviewsFromMessages(streamOnly);
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
