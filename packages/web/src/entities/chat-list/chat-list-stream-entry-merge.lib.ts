/**
 * Merges stream/topic sidebar entries when applying messages or unread reconcile patches.
 */
import type { StreamEntryInternal } from "~/shared/types/sidebar-chat";

type StreamTopicEntryInternal =
  StreamEntryInternal["topics"] extends Map<string, infer TopicEntry> ? TopicEntry : never;

export function mergeStreamEntry(
  existing: StreamEntryInternal | undefined,
  streamId: number,
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
  topicUnreadDelta: number,
  lastMessageId?: number,
): StreamEntryInternal {
  const existingTopic = existing?.topics.get(topicSubject);
  const unreadCount = (existingTopic?.unreadCount ?? 0) + topicUnreadDelta;
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
    return { stream_id: streamId, name, lastMessage, lastMessageSenderName, time, ts, topics };
  }
  const nextTopics = new Map(existing.topics);
  if (!existingTopic || topicTs >= existingTopic.ts) {
    nextTopics.set(topicSubject, topicEntry);
  } else {
    nextTopics.set(topicSubject, { ...existingTopic, unreadCount });
  }
  const newerStream = ts >= existing.ts;
  return {
    stream_id: streamId,
    name: existing.name,
    lastMessage: newerStream ? lastMessage : existing.lastMessage,
    lastMessageSenderName: newerStream ? lastMessageSenderName : existing.lastMessageSenderName,
    time: newerStream ? time : existing.time,
    ts: Math.max(existing.ts, ts),
    isArchived: existing.isArchived,
    creatorId: existing.creatorId,
    inviteOnly: existing.inviteOnly,
    canAddSubscribersGroup: existing.canAddSubscribersGroup,
    canRemoveSubscribersGroup: existing.canRemoveSubscribersGroup,
    canAdministerChannelGroup: existing.canAdministerChannelGroup,
    canResolveTopicsGroup: existing.canResolveTopicsGroup,
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
