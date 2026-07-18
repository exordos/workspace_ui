/**
 * Optimistic unread metadata reconciliation after an authoritative read confirmation.
 *
 * Absolute topic/stream/folder snapshots from realtime remain authoritative. This closes the UI
 * gap before those aggregate events arrive and is idempotent because already-read loaded rows are
 * ignored.
 */
import type { ChatListStreamMetadataRow } from "~/entities/chat-list/chat-list.model.types";
import type { MockMessage } from "~/shared/api/messenger.types";
import type { MessageId } from "~/shared/lib/message-id.lib";
import type { StreamEntryInternal } from "~/shared/types/sidebar-chat";

interface ConfirmedReadChatListActions {
  streamsMap: Map<string, StreamEntryInternal>;
  upsertStreamTopicShells: (
    streamUuid: string,
    topics: readonly {
      topicUuid: string;
      streamUuid: string;
      name: string;
      unreadCount?: number;
    }[],
  ) => void;
  upsertStreamMetadataRows: (rows: ChatListStreamMetadataRow[]) => void;
}

interface StreamTopicReadDelta {
  streamUuid: string;
  topicUuid: string;
  topicName: string;
  count: number;
}

export interface ConfirmedReadStreamUnreadProjection {
  streamUuid: string;
  unreadCount: number;
}

/** Requires a server aggregate refresh when confirmed rows cannot be safely projected locally. */
export function requiresAuthoritativeUnreadRefresh(
  messages: readonly MockMessage[],
  messageIds: readonly MessageId[],
  projections: readonly ConfirmedReadStreamUnreadProjection[],
): boolean {
  const targetIds = new Set(messageIds);
  const projectedStreamUuids = new Set(
    projections.map((projection) => projection.streamUuid.trim().toLowerCase()),
  );
  const locallyProjectedIds = new Set<MessageId>();
  for (const message of messages) {
    if (!targetIds.has(message.id) || message.read !== false) continue;
    const streamUuid = message.stream_uuid?.trim().toLowerCase() ?? "";
    if (streamUuid.length > 0 && projectedStreamUuids.has(streamUuid)) {
      locallyProjectedIds.add(message.id);
    }
  }
  return messageIds.some((messageId) => !locallyProjectedIds.has(messageId));
}

function findTopicByIdentity(
  chatList: ConfirmedReadChatListActions,
  streamUuid: string,
  topicUuid: string,
  topicName: string,
) {
  const stream = chatList.streamsMap.get(streamUuid);
  if (stream == null) return null;
  const normalizedTopicUuid = topicUuid.trim().toLowerCase();
  for (const topic of stream.topics.values()) {
    if (
      (normalizedTopicUuid.length > 0 &&
        topic.topicUuid?.trim().toLowerCase() === normalizedTopicUuid) ||
      topic.subject === topicName
    ) {
      return topic;
    }
  }
  return null;
}

function collectStreamTopicReadDeltas(
  messages: readonly MockMessage[],
  messageIds: readonly MessageId[],
): StreamTopicReadDelta[] {
  const targetIds = new Set(messageIds);
  const byTopic = new Map<string, StreamTopicReadDelta>();
  for (const message of messages) {
    if (!targetIds.has(message.id) || message.read !== false) continue;
    const streamUuid = message.stream_uuid?.trim().toLowerCase() ?? "";
    if (streamUuid.length === 0) continue;
    const topicUuid = message.topic_uuid?.trim().toLowerCase() ?? "";
    const topicName = message.subject?.trim() ?? "";
    const key = `${streamUuid}:${topicUuid || topicName}`;
    const existing = byTopic.get(key);
    if (existing != null) {
      existing.count += 1;
      continue;
    }
    byTopic.set(key, { streamUuid, topicUuid, topicName, count: 1 });
  }
  return Array.from(byTopic.values());
}

export function applyConfirmedReadMetadataDelta(
  chatList: ConfirmedReadChatListActions,
  messages: readonly MockMessage[],
  messageIds: readonly MessageId[],
): ConfirmedReadStreamUnreadProjection[] {
  if (messageIds.length === 0) return [];
  const deltas = collectStreamTopicReadDeltas(messages, messageIds);
  if (deltas.length === 0) return [];

  const streamReadCounts = new Map<string, number>();
  for (const delta of deltas) {
    const topic = findTopicByIdentity(chatList, delta.streamUuid, delta.topicUuid, delta.topicName);
    const topicUuid = delta.topicUuid || topic?.topicUuid;
    const topicName = topic?.subject ?? delta.topicName;
    if (topicUuid != null && topicName.length > 0) {
      chatList.upsertStreamTopicShells(delta.streamUuid, [
        {
          streamUuid: delta.streamUuid,
          topicUuid,
          name: topicName,
          unreadCount: Math.max(0, (topic?.unreadCount ?? 0) - delta.count),
        },
      ]);
    }
    streamReadCounts.set(
      delta.streamUuid,
      (streamReadCounts.get(delta.streamUuid) ?? 0) + delta.count,
    );
  }

  const projections: ConfirmedReadStreamUnreadProjection[] = [];
  for (const [streamUuid, count] of streamReadCounts) {
    const stream = chatList.streamsMap.get(streamUuid);
    if (stream == null) continue;
    const unreadCount = Math.max(0, (stream.unreadCount ?? 0) - count);
    chatList.upsertStreamMetadataRows([
      {
        streamUuid,
        name: stream.name,
        unreadCount,
      },
    ]);
    projections.push({ streamUuid, unreadCount });
  }
  return projections;
}

export function refreshFolderUnreadAggregates(
  refresh: ((reason: "mutation") => Promise<void> | void) | undefined,
): void {
  if (refresh == null) return;
  void Promise.resolve(refresh("mutation")).catch(() => {
    // Folder polling and canonical folder.updated events remain the fallback.
  });
}
