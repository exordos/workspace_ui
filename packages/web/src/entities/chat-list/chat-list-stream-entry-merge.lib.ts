/**
 * Merges stream/topic sidebar preview entries while preserving server-provided unread counts.
 */
import type { MessageId } from "~/shared/lib/message-id.lib";
import type { StreamEntryInternal } from "~/shared/types/sidebar-chat";

type StreamTopicEntryInternal =
  StreamEntryInternal["topics"] extends Map<string, infer TopicEntry> ? TopicEntry : never;

export function mergeStreamEntry(
  existing: StreamEntryInternal | undefined,
  streamId: string,
  name: string,
  lastMessage: string,
  lastMessageSenderName: string | undefined,
  time: string,
  ts: number,
  topicSubject: string,
  topicLastMessage: string,
  topicLastMessageSenderName: string | undefined,
  topicTime: string,
  topicTs: number,
  lastMessageId?: MessageId,
): StreamEntryInternal {
  const existingTopic = existing?.topics.get(topicSubject);
  const unreadCount = existingTopic?.unreadCount ?? 0;
  const topicEntry = {
    subject: topicSubject,
    lastMessage: topicLastMessage,
    lastMessageSenderName: topicLastMessageSenderName,
    time: topicTime,
    ts: topicTs,
    unreadCount,
    lastMessageId,
  };
  if (!existing) {
    const topics = new Map<string, StreamTopicEntryInternal>([[topicSubject, topicEntry]]);
    return {
      streamUuid: streamId,
      name,
      lastMessage,
      lastMessageSenderName,
      time,
      ts,
      unreadCount: 0,
      topics,
    };
  }
  const nextTopics = new Map(existing.topics);
  if (!existingTopic || topicTs >= existingTopic.ts) {
    nextTopics.set(topicSubject, topicEntry);
  } else {
    nextTopics.set(topicSubject, { ...existingTopic, unreadCount });
  }
  const newerStream = ts >= existing.ts;
  return {
    streamUuid: existing.streamUuid,
    private: existing.private,
    name: existing.name,
    lastMessage: newerStream ? lastMessage : existing.lastMessage,
    lastMessageSenderName: newerStream ? lastMessageSenderName : existing.lastMessageSenderName,
    time: newerStream ? time : existing.time,
    ts: Math.max(existing.ts, ts),
    unreadCount: existing.unreadCount,
    isArchived: existing.isArchived,
    creatorId: existing.creatorId,
    inviteOnly: existing.inviteOnly,
    canAddSubscribersGroup: existing.canAddSubscribersGroup,
    canRemoveSubscribersGroup: existing.canRemoveSubscribersGroup,
    canAdministerChannelGroup: existing.canAdministerChannelGroup,
    canResolveTopicsGroup: existing.canResolveTopicsGroup,
    canMoveMessagesOutOfChannelGroup: existing.canMoveMessagesOutOfChannelGroup,
    topics: nextTopics,
  };
}

export function getNewestTopicEntry(
  topics: Map<string, StreamTopicEntryInternal>,
): StreamTopicEntryInternal | null {
  let newest: StreamTopicEntryInternal | null = null;
  for (const topic of topics.values()) {
    if (newest == null || topic.ts > newest.ts) {
      newest = topic;
    }
  }
  return newest;
}

export function rebuildStreamFromTopics(
  stream: StreamEntryInternal,
  topics: Map<string, StreamTopicEntryInternal>,
): StreamEntryInternal {
  const newestTopic = getNewestTopicEntry(topics);
  return {
    ...stream,
    topics,
    ...(newestTopic != null
      ? {
          lastMessage: newestTopic.lastMessage,
          lastMessageSenderName: newestTopic.lastMessageSenderName,
          time: newestTopic.time,
          ts: newestTopic.ts,
        }
      : {}),
  };
}
