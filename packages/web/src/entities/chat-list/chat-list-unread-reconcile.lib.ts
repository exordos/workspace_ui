/**
 * Builds unread reconcile maps from Zulip register `unread_msgs` buckets.
 */
import type { ZulipUnreadMessagesSnapshot } from "~/shared/api/zulip-unread.lib";
import { dmConversationKey } from "~/shared/lib/dm-key";
import { streamTopicCompositeKey } from "./chat-list-stream-topic-index.lib";
import type { MessageLocation } from "./chat-list.model.types";

function dmKeyFromUnreadBucketUserIds(userIds: number[], currentUserId: number | null): string {
  return dmConversationKey(
    userIds.map((id) => ({ id })),
    currentUserId,
  );
}

export function buildUnreadReconcileMapsFromRegisterSnapshot(
  snapshot: ZulipUnreadMessagesSnapshot,
  currentUserId: number | null,
): {
  unreadStreamCounts: Map<string, number>;
  unreadDmCounts: Map<string, number>;
  unreadLocationMap: Map<number, MessageLocation>;
} {
  const unreadStreamCounts = new Map<string, number>();
  const unreadDmCounts = new Map<string, number>();
  const unreadLocationMap = new Map<number, MessageLocation>();

  for (const bucket of snapshot.streams) {
    const key = streamTopicCompositeKey(bucket.streamId, bucket.topic);
    unreadStreamCounts.set(key, bucket.unreadMessageIds.length);
    for (const messageId of bucket.unreadMessageIds) {
      unreadLocationMap.set(messageId, {
        type: "stream",
        stream_id: bucket.streamId,
        topic: bucket.topic,
      });
    }
  }

  for (const bucket of snapshot.dms) {
    const dmKey = dmKeyFromUnreadBucketUserIds(bucket.userIds, currentUserId);
    unreadDmCounts.set(dmKey, bucket.unreadMessageIds.length);
    for (const messageId of bucket.unreadMessageIds) {
      unreadLocationMap.set(messageId, { type: "dm", dmKey });
    }
  }

  return { unreadStreamCounts, unreadDmCounts, unreadLocationMap };
}
