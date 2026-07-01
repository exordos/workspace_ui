/**
 * Stream sidebar preview merge from fetched messages — preview text only, no unread bumps.
 *
 * Used in metadata-first bootstrap: unread counts come from stream/topic metadata, not from
 * capped GET /messages preview batches.
 */
import {
  messageToStreamEntry,
  streamTopicIdentityFromMessage,
} from "~/entities/chat-list/chat-list.lib";
import type { WorkspaceRawMessage } from "~/shared/api/messenger.types";
import type { MessageId } from "~/shared/lib/message-id.lib";
import type { StreamEntryInternal } from "~/shared/types/sidebar-chat";
import { streamTopicCompositeKey } from "./chat-list-stream-topic-index.lib";

export function filterStreamMessagesForSidebar(
  messages: readonly WorkspaceRawMessage[],
): WorkspaceRawMessage[] {
  return messages.filter((m) => m.type === "stream" && m.stream_uuid != null);
}

/** Metadata shells can have activity ts without preview text — still apply newer fetched bodies. */
export function shouldApplyStreamTopicPreviewFromFetchedMessage(
  existingStream: StreamEntryInternal | undefined,
  existingTopic: { ts: number; lastMessage: string; lastMessageId?: MessageId } | undefined,
  message: WorkspaceRawMessage,
  previewText: string,
): boolean {
  if (message.timestamp > (existingStream?.ts ?? 0)) {
    return true;
  }
  if (existingTopic == null) {
    return true;
  }
  if (message.timestamp > existingTopic.ts) {
    return true;
  }
  if (existingTopic.lastMessage.trim().length === 0 && previewText.trim().length > 0) {
    return true;
  }
  return existingTopic.lastMessageId === message.id;
}

export function resolveStreamSidebarTopicSubject(
  existingStream: StreamEntryInternal | undefined,
  message: WorkspaceRawMessage,
): string | null {
  const fallback = streamTopicIdentityFromMessage(message)?.subject ?? null;
  const topicUuid = message.topic_uuid?.trim().toLowerCase();
  if (existingStream == null || topicUuid == null || topicUuid.length === 0) {
    return fallback;
  }

  for (const topic of existingStream.topics.values()) {
    if (topic.topicUuid?.trim().toLowerCase() === topicUuid) {
      return topic.subject;
    }
  }
  return fallback;
}

function mergeStreamPreviewEntry(
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
): StreamEntryInternal {
  const existingTopic = existing?.topics.get(topicSubject);
  const unreadCount = existingTopic?.unreadCount ?? 0;
  const resolvedTopicUuid = topicUuid ?? existingTopic?.topicUuid;
  const topicColor = existingTopic?.color;
  const topicEntry = {
    ...(resolvedTopicUuid != null ? { topicUuid: resolvedTopicUuid } : {}),
    subject: topicSubject,
    lastMessage: topicLastMessage,
    lastMessageSenderName: topicLastMessageSenderName,
    time: topicTime,
    ts: topicTs,
    unreadCount,
    ...(topicColor != null ? { color: topicColor } : {}),
    lastMessageId,
  };
  if (!existing) {
    const topics = new Map([[topicSubject, topicEntry]]);
    return { streamUuid: streamId, name, lastMessage, lastMessageSenderName, time, ts, topics };
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
    ...(existing.color != null ? { color: existing.color } : {}),
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
    canMoveMessagesOutOfChannelGroup: existing.canMoveMessagesOutOfChannelGroup,
    topics: nextTopics,
  };
}

/**
 * Returns updated `streamsMap` with stream/topic previews from messages — does not change unread counts.
 */
export function mergeStreamSidebarPreviewsFromMessages(
  streamsMap: Map<string, StreamEntryInternal>,
  messages: readonly WorkspaceRawMessage[],
): Map<string, StreamEntryInternal> {
  const streamTopicLatest = new Map<string, WorkspaceRawMessage>();
  for (const m of messages) {
    if (m.type !== "stream" || m.stream_uuid == null) continue;
    const topic = resolveStreamSidebarTopicSubject(streamsMap.get(m.stream_uuid), m);
    if (topic == null) continue;
    const key = streamTopicCompositeKey(m.stream_uuid, topic);
    const existing = streamTopicLatest.get(key);
    if (!existing || m.timestamp >= existing.timestamp) {
      streamTopicLatest.set(key, m);
    }
  }

  let nextStreams = streamsMap;
  for (const m of streamTopicLatest.values()) {
    const existing = nextStreams.get(m.stream_uuid ?? "");
    const subject = resolveStreamSidebarTopicSubject(existing, m);
    if (subject == null) continue;
    const messageForEntry = subject === (m.subject ?? "") ? m : { ...m, subject };
    const result = messageToStreamEntry(messageForEntry);
    if (!result) continue;
    const { streamUuid, name, lastMessage, lastMessageSenderName, time, ts } = result.stream;
    const topic = result.topic;
    const existingTopic = existing?.topics.get(topic.subject);
    if (
      !shouldApplyStreamTopicPreviewFromFetchedMessage(
        existing,
        existingTopic,
        messageForEntry,
        topic.lastMessage,
      )
    ) {
      continue;
    }
    nextStreams = new Map(nextStreams);
    nextStreams.set(
      streamUuid,
      mergeStreamPreviewEntry(
        existing,
        streamUuid,
        name,
        lastMessage,
        lastMessageSenderName,
        time,
        ts,
        topic.subject,
        topic.lastMessage,
        topic.lastMessageSenderName,
        topic.time,
        topic.ts,
        m.id,
        topic.topicUuid,
      ),
    );
  }
  return nextStreams;
}
