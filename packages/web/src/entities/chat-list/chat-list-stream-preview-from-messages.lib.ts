/**
 * Stream sidebar preview merge from fetched messages — preview text only, no unread bumps.
 *
 * Used in metadata-first bootstrap: unread counts come from register `unread_msgs`, not from
 * capped GET /messages batches (~5k messages vs 100k+ unread on server).
 */
import { messageToStreamEntry } from "~/entities/chat-list/chat-list.lib";
import type { ZulipRawMessage } from "~/shared/api/zulip.types";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import type { StreamEntryInternal } from "~/shared/types/sidebar-chat";
import { streamTopicCompositeKey } from "./chat-list-stream-topic-index.lib";

export function filterStreamMessagesForSidebar(
  messages: readonly ZulipRawMessage[],
): ZulipRawMessage[] {
  return messages.filter((m) => m.type === "stream" && m.stream_id != null);
}

/** Metadata shells can have activity ts without preview text — still apply newer fetched bodies. */
export function shouldApplyStreamTopicPreviewFromFetchedMessage(
  existingStream: StreamEntryInternal | undefined,
  existingTopic: { ts: number; lastMessage: string; lastMessageId?: number } | undefined,
  message: ZulipRawMessage,
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

function mergeStreamPreviewEntry(
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
  lastMessageId?: number,
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
    const topics = new Map([[topicSubject, topicEntry]]);
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
    topics: nextTopics,
  };
}

/**
 * Returns updated `streamsMap` with stream/topic previews from messages — does not change unread counts.
 */
export function mergeStreamSidebarPreviewsFromMessages(
  streamsMap: Map<number, StreamEntryInternal>,
  messages: readonly ZulipRawMessage[],
): Map<number, StreamEntryInternal> {
  const streamTopicLatest = new Map<string, ZulipRawMessage>();
  for (const m of messages) {
    if (m.type !== "stream" || m.stream_id == null) continue;
    const topic = normalizeTopicForIdentity(m.subject ?? "");
    const key = streamTopicCompositeKey(m.stream_id, topic);
    const existing = streamTopicLatest.get(key);
    if (!existing || m.timestamp >= existing.timestamp) {
      streamTopicLatest.set(key, m);
    }
  }

  let nextStreams = streamsMap;
  for (const m of streamTopicLatest.values()) {
    const result = messageToStreamEntry(m);
    if (!result) continue;
    const { stream_id, name, lastMessage, lastMessageSenderName, time, ts } = result.stream;
    const topic = result.topic;
    const existing = nextStreams.get(stream_id);
    const existingTopic = existing?.topics.get(topic.subject);
    if (
      !shouldApplyStreamTopicPreviewFromFetchedMessage(
        existing,
        existingTopic,
        m,
        topic.lastMessage,
      )
    ) {
      continue;
    }
    nextStreams = new Map(nextStreams);
    nextStreams.set(
      stream_id,
      mergeStreamPreviewEntry(
        existing,
        stream_id,
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
      ),
    );
  }
  return nextStreams;
}
