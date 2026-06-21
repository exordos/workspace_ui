/**
 * Hydrates missing stream/topic sidebar previews from register unread snapshot.
 *
 * Why: register `unread_snapshot` is authoritative for counts, but contains only message ids.
 * For chats whose latest activity is older than the global 5000-message preview window,
 * sidebar rows can show unread badges while lacking preview text and timestamps used for sorting.
 *
 * This module batch-fetches the latest unread message per stream/topic via Workspace 10+ `message_ids`
 * and merges preview metadata without affecting unread totals.
 */
import {
  captureActiveOrgRequestContext,
  isActiveOrgRequestContextCurrent,
} from "~/entities/instance/instance.model";
import { fetchMessagesByIds } from "~/shared/api/messenger-messages";
import type { MessengerUnreadMessagesSnapshot } from "~/shared/api/messenger-unread.lib";
import type { MessageId } from "~/shared/lib/message-id.lib";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import type { StreamEntryInternal } from "~/shared/types/sidebar-chat";
import { filterStreamMessagesForSidebar } from "./chat-list-stream-preview-from-messages.lib";
import { useChatListStore } from "./chat-list.model";

function latestMessageIdFromBucket(values: readonly MessageId[]): MessageId | null {
  return values[values.length - 1] ?? null;
}

function hasNonEmptyPreviewText(value: string | undefined): boolean {
  return (value?.trim() ?? "").length > 0;
}

function shouldHydrateBucketPreview(
  streamsMap: Map<string, StreamEntryInternal>,
  bucket: { streamId: string; topic: string },
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
  snapshot: MessengerUnreadMessagesSnapshot,
  streamsMap: Map<string, StreamEntryInternal>,
): MessageId[] {
  const ids = new Set<MessageId>();
  for (const bucket of snapshot.streams) {
    if (bucket.streamId.trim().length === 0) continue;
    if (!Array.isArray(bucket.unreadMessageIds) || bucket.unreadMessageIds.length === 0) continue;
    if (
      !shouldHydrateBucketPreview(streamsMap, { streamId: bucket.streamId, topic: bucket.topic })
    ) {
      continue;
    }
    const latest = latestMessageIdFromBucket(bucket.unreadMessageIds);
    if (latest != null) {
      ids.add(latest);
    }
  }
  return [...ids];
}

const inFlightByInstanceId = new Map<string, Promise<void>>();

function isCancelledOrStale(
  orgContext: ReturnType<typeof captureActiveOrgRequestContext>,
  cancelled?: () => boolean,
): boolean {
  return cancelled?.() === true || !isActiveOrgRequestContextCurrent(orgContext);
}

/**
 * Best-effort hydrate: if request fails, sidebar still functions (counts are already correct).
 * Dedupes concurrent calls to avoid repeated batch fetches during fast remounts.
 */
export function hydrateStreamSidebarPreviewsFromUnreadSnapshot(
  snapshot: MessengerUnreadMessagesSnapshot | null | undefined,
  cancelled?: () => boolean,
): Promise<void> {
  if (snapshot == null) return Promise.resolve();
  const orgContext = captureActiveOrgRequestContext();
  if (orgContext.instanceId == null || isCancelledOrStale(orgContext, cancelled)) {
    return Promise.resolve();
  }
  const instanceId = orgContext.instanceId;
  const existing = inFlightByInstanceId.get(instanceId);
  if (existing != null) return existing;

  const promise = (async () => {
    try {
      const { streamsMap } = useChatListStore.getState();
      const messageIds = resolveLatestUnreadMessageIdsForMissingPreviews(snapshot, streamsMap);
      if (messageIds.length === 0) return;
      if (isCancelledOrStale(orgContext, cancelled)) return;

      const messages = await fetchMessagesByIds(messageIds);
      if (isCancelledOrStale(orgContext, cancelled)) return;

      const streamOnly = filterStreamMessagesForSidebar(messages);
      if (streamOnly.length === 0) return;

      useChatListStore.getState().applyStreamSidebarPreviewsFromMessages(streamOnly);
    } finally {
      inFlightByInstanceId.delete(instanceId);
    }
  })();

  inFlightByInstanceId.set(instanceId, promise);
  return promise;
}
