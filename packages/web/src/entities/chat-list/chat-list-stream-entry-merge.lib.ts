/**
 * Merges stream/topic sidebar preview entries while preserving server-provided unread counts.
 */
import type { MessageId } from "~/shared/lib/message-id.lib";
import type { StreamEntryInternal } from "~/shared/types/sidebar-chat";

type StreamTopicEntryInternal =
  StreamEntryInternal["topics"] extends Map<string, infer TopicEntry> ? TopicEntry : never;

interface MergeStreamEntryOptions {
  topicSourceName?: StreamTopicEntryInternal["sourceName"];
  topicSource?: StreamTopicEntryInternal["source"];
}

function findExistingTopic(
  topics: Map<string, StreamTopicEntryInternal> | undefined,
  topicSubject: string,
  topicUuid: string | undefined,
): { key: string; topic: StreamTopicEntryInternal } | undefined {
  const bySubject = topics?.get(topicSubject);
  if (bySubject != null) {
    return { key: topicSubject, topic: bySubject };
  }
  const normalizedTopicUuid = topicUuid?.trim().toLowerCase();
  if (topics == null || normalizedTopicUuid == null || normalizedTopicUuid.length === 0) {
    return undefined;
  }
  for (const [key, topic] of topics) {
    if (topic.topicUuid?.trim().toLowerCase() === normalizedTopicUuid) {
      return { key, topic };
    }
  }
  return undefined;
}

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
  topicUuid?: string,
  options: MergeStreamEntryOptions = {},
): StreamEntryInternal {
  const existingTopicMatch = findExistingTopic(existing?.topics, topicSubject, topicUuid);
  const existingTopic = existingTopicMatch?.topic;
  const resolvedTopicSubject = existingTopic?.subject ?? topicSubject;
  const resolvedTopicUuid = topicUuid ?? existingTopic?.topicUuid;
  const resolvedTopicSourceName = existingTopic?.sourceName ?? options.topicSourceName;
  const resolvedTopicSource = existingTopic?.source ?? options.topicSource;
  const unreadCount = existingTopic?.unreadCount ?? 0;
  const topicColor = existingTopic?.color;
  const topicEntry = {
    ...(resolvedTopicUuid != null ? { topicUuid: resolvedTopicUuid } : {}),
    subject: resolvedTopicSubject,
    lastMessage: topicLastMessage,
    lastMessageSenderName: topicLastMessageSenderName,
    time: topicTime,
    ts: topicTs,
    unreadCount,
    ...(topicColor != null ? { color: topicColor } : {}),
    ...(resolvedTopicSourceName != null ? { sourceName: resolvedTopicSourceName } : {}),
    ...(resolvedTopicSource != null ? { source: resolvedTopicSource } : {}),
    ...(existingTopic?.isDone === true ? { isDone: true } : {}),
    lastMessageId,
  };
  if (!existing) {
    const topics = new Map<string, StreamTopicEntryInternal>([[resolvedTopicSubject, topicEntry]]);
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
  if (existingTopicMatch != null && existingTopicMatch.key !== resolvedTopicSubject) {
    nextTopics.delete(existingTopicMatch.key);
  }
  if (!existingTopic || topicTs >= existingTopic.ts) {
    nextTopics.set(resolvedTopicSubject, topicEntry);
  } else {
    nextTopics.set(resolvedTopicSubject, { ...existingTopic, unreadCount });
  }
  const newerStream = ts >= existing.ts;
  return {
    streamUuid: existing.streamUuid,
    private: existing.private,
    ...(existing.color != null ? { color: existing.color } : {}),
    ...(existing.sourceName != null ? { sourceName: existing.sourceName } : {}),
    ...(existing.source != null ? { source: existing.source } : {}),
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
