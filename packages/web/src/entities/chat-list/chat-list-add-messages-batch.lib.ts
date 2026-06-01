/**
 * Batch merge of Zulip messages into chat-list maps (locations, unread bumps, previews).
 */
import type { ZulipRawMessage } from "~/shared/api/zulip.types";
import { dmConversationKey } from "~/shared/lib/dm-key";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import type { DmEntryInternal, StreamEntryInternal } from "~/shared/types/sidebar-chat";
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
  message: ZulipRawMessage,
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
  streamsMap: Map<number, StreamEntryInternal>,
  message: ZulipRawMessage,
  _currentUserId: number | null,
): Map<number, StreamEntryInternal> {
  const result = messageToStreamEntry(message);
  if (!result) return streamsMap;
  const { stream_id, name, lastMessage, lastMessageSenderName, time, ts } = result.stream;
  const topic = result.topic;
  const existing = streamsMap.get(stream_id);
  if (!existing) {
    const next = new Map(streamsMap);
    next.set(
      stream_id,
      mergeStreamEntry(
        undefined,
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
  next.set(stream_id, { ...existing, topics: nextTopics });
  return next;
}

function bumpDmUnreadFromMessage(
  dmsMap: Map<string, DmEntryInternal>,
  message: ZulipRawMessage,
  currentUserId: number | null,
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
  messages: ZulipRawMessage[],
  currentUserId: number | null,
  avatarMap: Map<number, string>,
): {
  nextStreams: Map<number, StreamEntryInternal>;
  nextDms: Map<string, DmEntryInternal>;
  nextLoc: Map<number, MessageLocation>;
  sidebarStreamsUnreadDelta: number;
  sidebarDmsUnreadDelta: number;
} {
  let nextStreams = state.streamsMap;
  let nextDms = state.dmsMap;
  const nextLoc = new Map(state.messageIdToLocation);
  let sidebarStreamsUnreadDelta = 0;
  let sidebarDmsUnreadDelta = 0;

  for (const m of messages) {
    if (m.type === "stream" && m.stream_id != null) {
      const topic = normalizeTopicForIdentity(m.subject ?? "");
      nextLoc.set(m.id, { type: "stream", stream_id: m.stream_id, topic });
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
  streamsMap: Map<number, StreamEntryInternal>,
  streamTopicLatest: Map<string, ZulipRawMessage>,
): Map<number, StreamEntryInternal> {
  let nextStreams = streamsMap;
  for (const m of streamTopicLatest.values()) {
    const result = messageToStreamEntry(m);
    if (!result) continue;
    const { stream_id, name, lastMessage, lastMessageSenderName, time, ts } = result.stream;
    const topic = result.topic;
    const existing = nextStreams.get(stream_id);
    if (existing && m.timestamp <= existing.ts) {
      const existingTopic = existing.topics.get(topic.subject);
      if (existingTopic && m.timestamp <= existingTopic.ts) {
        continue;
      }
    }
    nextStreams = new Map(nextStreams);
    const merged = mergeStreamEntry(
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
      0,
      m.id,
    );
    nextStreams.set(stream_id, merged);
  }
  return nextStreams;
}

function mergeDmPreviewsFromLatest(
  dmsMap: Map<string, DmEntryInternal>,
  dmLatest: Map<string, ZulipRawMessage>,
  currentUserId: number | null,
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
  messages: ZulipRawMessage[];
  currentUserId: number | null;
  avatarMap: Map<number, string>;
  streamTopicLatest: Map<string, ZulipRawMessage>;
  dmLatest: Map<string, ZulipRawMessage>;
}

export function applyAddMessagesBatchPatch(
  state: ChatListState,
  params: ApplyAddMessagesBatchParams,
): Partial<ChatListState> {
  const { messages, currentUserId, avatarMap, streamTopicLatest, dmLatest } = params;

  const indexed = indexBatchMessagesAndUnreadBumps(state, messages, currentUserId, avatarMap);
  const nextStreams = mergeStreamTopicPreviewsFromLatest(indexed.nextStreams, streamTopicLatest);
  const nextDms = mergeDmPreviewsFromLatest(indexed.nextDms, dmLatest, currentUserId, avatarMap);

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
  };
}

export function buildStreamTopicLatestMap(
  messages: ZulipRawMessage[],
): Map<string, ZulipRawMessage> {
  const streamTopicLatest = new Map<string, ZulipRawMessage>();
  for (const m of messages) {
    if (m.type === "stream" && m.stream_id != null) {
      const topic = normalizeTopicForIdentity(m.subject ?? "");
      const key = streamTopicCompositeKey(m.stream_id, topic);
      const existing = streamTopicLatest.get(key);
      if (!existing || m.timestamp >= existing.timestamp) {
        streamTopicLatest.set(key, m);
      }
    }
  }
  return streamTopicLatest;
}

export function buildDmLatestMap(
  messages: ZulipRawMessage[],
  currentUserId: number | null,
): Map<string, ZulipRawMessage> {
  const dmLatest = new Map<string, ZulipRawMessage>();
  for (const m of messages) {
    if (m.type === "private" && Array.isArray(m.display_recipient)) {
      const key = dmConversationKey(m.display_recipient, currentUserId);
      const existing = dmLatest.get(key);
      if (!existing || m.timestamp >= existing.timestamp) {
        dmLatest.set(key, m);
      }
    }
  }
  return dmLatest;
}
