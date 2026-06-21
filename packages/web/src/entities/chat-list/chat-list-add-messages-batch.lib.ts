/**
 * Batch merge of messenger messages into chat-list maps (locations, unread bumps, previews).
 */
import type { WorkspaceRawMessage } from "~/shared/api/messenger.types";
import { dmConversationKey } from "~/shared/lib/dm-key";
import { compareMessageTimeline } from "~/shared/lib/message-id.lib";
import type { MessageId } from "~/shared/lib/message-id.lib";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import type { UserId } from "~/shared/lib/user-id.lib";
import type { DmEntryInternal, StreamEntryInternal } from "~/shared/types/sidebar-chat";
import { incrementMentionUnreadFromBatch } from "./chat-list-mentions.lib";
import { mergeStreamEntry } from "./chat-list-stream-entry-merge.lib";
import {
  patchStreamTopicMessageIndex,
  streamTopicCompositeKey,
} from "./chat-list-stream-topic-index.lib";
import { isUnreadFromOthers, messageToDmEntry, messageToStreamEntry } from "./chat-list.lib";
import type { ChatListState, MessageLocation } from "./chat-list.model.types";

/** Metadata/IDB rows can carry lastActivityTs + lastMessageId without preview text — still merge fetched bodies. */
export function shouldApplyDmPreviewFromFetchedMessage(
  existing: DmEntryInternal,
  message: WorkspaceRawMessage,
  previewText: string,
): boolean {
  if (message.timestamp > existing.ts) {
    return true;
  }
  if (existing.lastMessage.trim().length === 0 && previewText.trim().length > 0) {
    return true;
  }
  return existing.lastMessageId === message.id;
}

function bumpStreamTopicUnreadFromMessage(
  streamsMap: Map<string, StreamEntryInternal>,
  message: WorkspaceRawMessage,
  _currentUserId: UserId | null,
): Map<string, StreamEntryInternal> {
  const result = messageToStreamEntry(message);
  if (!result) return streamsMap;
  const { streamUuid, name, lastMessage, lastMessageSenderName, time, ts } = result.stream;
  const topic = result.topic;
  const existing = streamsMap.get(streamUuid);
  if (!existing) {
    const next = new Map(streamsMap);
    next.set(
      streamUuid,
      mergeStreamEntry(
        undefined,
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
        1,
        message.id,
      ),
    );
    return next;
  }
  const existingTopic = existing.topics.get(topic.subject);
  const next = new Map(streamsMap);
  const nextTopics = new Map(existing.topics);
  nextTopics.set(topic.subject, {
    subject: topic.subject,
    lastMessage: existingTopic?.lastMessage ?? topic.lastMessage,
    lastMessageSenderName: existingTopic?.lastMessageSenderName ?? topic.lastMessageSenderName,
    time: existingTopic?.time ?? topic.time,
    ts: existingTopic?.ts ?? topic.ts,
    unreadCount: (existingTopic?.unreadCount ?? 0) + 1,
    lastMessageId: existingTopic?.lastMessageId,
  });
  next.set(streamUuid, { ...existing, topics: nextTopics });
  return next;
}

function bumpDmUnreadFromMessage(
  dmsMap: Map<string, DmEntryInternal>,
  message: WorkspaceRawMessage,
  currentUserId: UserId | null,
  avatarMap: Map<number, string>,
): Map<string, DmEntryInternal> {
  if (!Array.isArray(message.display_recipient)) return dmsMap;
  const key = dmConversationKey(message.display_recipient, currentUserId);
  const existing = dmsMap.get(key);
  const next = new Map(dmsMap);
  if (existing) {
    next.set(key, { ...existing, unreadCount: existing.unreadCount + 1 });
    return next;
  }
  const dmEntry = messageToDmEntry(message, currentUserId, avatarMap);
  if (!dmEntry) return dmsMap;
  next.set(key, {
    ...dmEntry,
    unreadCount: 1,
    avatar_url: dmEntry.avatar_url,
    lastMessageId: message.id,
  });
  return next;
}

function indexBatchMessagesAndUnreadBumps(
  state: ChatListState,
  messages: WorkspaceRawMessage[],
  currentUserId: UserId | null,
  avatarMap: Map<number, string>,
): {
  nextStreams: Map<string, StreamEntryInternal>;
  nextDms: Map<string, DmEntryInternal>;
  nextLoc: Map<MessageId, MessageLocation>;
  sidebarStreamsUnreadDelta: number;
  sidebarDmsUnreadDelta: number;
} {
  let nextStreams = state.streamsMap;
  let nextDms = state.dmsMap;
  const nextLoc = new Map(state.messageIdToLocation);
  let sidebarStreamsUnreadDelta = 0;
  let sidebarDmsUnreadDelta = 0;

  for (const m of messages) {
    if (state.messageIdToLocation.has(m.id)) {
      continue;
    }
    if (m.type === "stream" && m.stream_uuid != null) {
      const topic = normalizeTopicForIdentity(m.subject ?? "");
      nextLoc.set(m.id, { type: "stream", streamUuid: m.stream_uuid, topic });
      if (isUnreadFromOthers(m, currentUserId)) {
        nextStreams = bumpStreamTopicUnreadFromMessage(nextStreams, m, currentUserId);
        sidebarStreamsUnreadDelta += 1;
      }
    } else if (m.type === "private" && Array.isArray(m.display_recipient)) {
      const key = dmConversationKey(m.display_recipient, currentUserId);
      nextLoc.set(m.id, { type: "dm", dmKey: key });
      if (isUnreadFromOthers(m, currentUserId)) {
        nextDms = bumpDmUnreadFromMessage(nextDms, m, currentUserId, avatarMap);
        sidebarDmsUnreadDelta += 1;
      }
    }
  }

  return {
    nextStreams,
    nextDms,
    nextLoc,
    sidebarStreamsUnreadDelta,
    sidebarDmsUnreadDelta,
  };
}

function mergeStreamTopicPreviewsFromLatest(
  streamsMap: Map<string, StreamEntryInternal>,
  streamTopicLatest: Map<string, WorkspaceRawMessage>,
): Map<string, StreamEntryInternal> {
  let nextStreams = streamsMap;
  for (const m of streamTopicLatest.values()) {
    const result = messageToStreamEntry(m);
    if (!result) continue;
    const { streamUuid, name, lastMessage, lastMessageSenderName, time, ts } = result.stream;
    const topic = result.topic;
    const existing = nextStreams.get(streamUuid);
    if (existing && m.timestamp <= existing.ts) {
      const existingTopic = existing.topics.get(topic.subject);
      if (existingTopic && m.timestamp <= existingTopic.ts) {
        continue;
      }
    }
    nextStreams = new Map(nextStreams);
    const merged = mergeStreamEntry(
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
      0,
      m.id,
    );
    nextStreams.set(streamUuid, merged);
  }
  return nextStreams;
}

function mergeDmPreviewsFromLatest(
  dmsMap: Map<string, DmEntryInternal>,
  dmLatest: Map<string, WorkspaceRawMessage>,
  currentUserId: UserId | null,
  avatarMap: Map<number, string>,
): Map<string, DmEntryInternal> {
  let nextDms = dmsMap;
  for (const m of dmLatest.values()) {
    const dmEntry = messageToDmEntry(m, currentUserId, avatarMap);
    if (!dmEntry) continue;
    if (!Array.isArray(m.display_recipient)) continue;
    const key = dmConversationKey(m.display_recipient, currentUserId);
    const existing = nextDms.get(key);
    if (
      existing != null &&
      !shouldApplyDmPreviewFromFetchedMessage(existing, m, dmEntry.lastMessage)
    ) {
      continue;
    }
    nextDms = new Map(nextDms);
    const avatar_url = dmEntry.avatar_url ?? existing?.avatar_url;
    const preserveActivityTs =
      existing != null && dmEntry.ts <= existing.ts ? existing.ts : dmEntry.ts;
    const preserveTime =
      existing != null && dmEntry.ts <= existing.ts ? existing.time : dmEntry.time;
    nextDms.set(key, {
      ...dmEntry,
      unreadCount: existing?.unreadCount ?? 0,
      avatar_url,
      lastMessageId: m.id,
      ts: preserveActivityTs,
      time: preserveTime,
    });
  }
  return nextDms;
}

export interface ApplyAddMessagesBatchParams {
  messages: WorkspaceRawMessage[];
  currentUserId: UserId | null;
  avatarMap: Map<number, string>;
  streamTopicLatest: Map<string, WorkspaceRawMessage>;
  dmLatest: Map<string, WorkspaceRawMessage>;
}

export function applyAddMessagesBatchPatch(
  state: ChatListState,
  params: ApplyAddMessagesBatchParams,
): Partial<ChatListState> {
  const { messages, currentUserId, avatarMap, streamTopicLatest, dmLatest } = params;

  const indexed = indexBatchMessagesAndUnreadBumps(state, messages, currentUserId, avatarMap);
  const nextStreams = mergeStreamTopicPreviewsFromLatest(indexed.nextStreams, streamTopicLatest);
  const nextDms = mergeDmPreviewsFromLatest(indexed.nextDms, dmLatest, currentUserId, avatarMap);
  const mentionPatch = incrementMentionUnreadFromBatch(
    state.mentionedUnreadMessageIds,
    messages,
    currentUserId,
  );

  return {
    streamsMap: nextStreams,
    dmsMap: nextDms,
    messageIdToLocation: indexed.nextLoc,
    sidebarDataHydrated: true,
    sidebarStreamsUnread: state.sidebarStreamsUnread + indexed.sidebarStreamsUnreadDelta,
    sidebarDmsUnread: state.sidebarDmsUnread + indexed.sidebarDmsUnreadDelta,
    streamTopicMessageIds: patchStreamTopicMessageIndex(
      state.streamTopicMessageIds,
      state.messageIdToLocation,
      indexed.nextLoc,
    ),
    ...mentionPatch,
  };
}

export function buildStreamTopicLatestMap(
  messages: WorkspaceRawMessage[],
): Map<string, WorkspaceRawMessage> {
  const streamTopicLatest = new Map<string, WorkspaceRawMessage>();
  for (const m of messages) {
    if (m.type === "stream" && m.stream_uuid != null) {
      const topic = normalizeTopicForIdentity(m.subject ?? "");
      const key = streamTopicCompositeKey(m.stream_uuid, topic);
      const existing = streamTopicLatest.get(key);
      if (!existing || compareMessageTimeline(m, existing) >= 0) {
        streamTopicLatest.set(key, m);
      }
    }
  }
  return streamTopicLatest;
}

export function buildDmLatestMap(
  messages: WorkspaceRawMessage[],
  currentUserId: UserId | null,
): Map<string, WorkspaceRawMessage> {
  const dmLatest = new Map<string, WorkspaceRawMessage>();
  for (const m of messages) {
    if (m.type === "private" && Array.isArray(m.display_recipient)) {
      const key = dmConversationKey(m.display_recipient, currentUserId);
      const existing = dmLatest.get(key);
      if (!existing || compareMessageTimeline(m, existing) >= 0) {
        dmLatest.set(key, m);
      }
    }
  }
  return dmLatest;
}
