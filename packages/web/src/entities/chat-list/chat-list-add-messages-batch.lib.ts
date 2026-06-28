/**
 * Batch merge of messenger messages into chat-list maps (locations and previews).
 */
import type { WorkspaceRawMessage } from "~/shared/api/messenger.types";
import { dmConversationKey } from "~/shared/lib/dm-key";
import { compareMessageTimeline } from "~/shared/lib/message-id.lib";
import type { MessageId } from "~/shared/lib/message-id.lib";
import type { UserId } from "~/shared/lib/user-id.lib";
import type { DmEntryInternal, StreamEntryInternal } from "~/shared/types/sidebar-chat";
import { mergeStreamEntry } from "./chat-list-stream-entry-merge.lib";
import {
  patchStreamTopicMessageIndex,
  streamTopicCompositeKey,
} from "./chat-list-stream-topic-index.lib";
import {
  messageToDmEntry,
  messageToStreamEntry,
  streamTopicIdentityFromMessage,
} from "./chat-list.lib";
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

function indexBatchMessageLocations(
  state: ChatListState,
  messages: WorkspaceRawMessage[],
  currentUserId: UserId | null,
): {
  nextLoc: Map<MessageId, MessageLocation>;
} {
  const nextLoc = new Map(state.messageIdToLocation);

  for (const m of messages) {
    if (state.messageIdToLocation.has(m.id)) {
      continue;
    }
    if (m.type === "stream" && m.stream_uuid != null) {
      const topicIdentity = streamTopicIdentityFromMessage(m);
      if (topicIdentity == null) {
        continue;
      }
      nextLoc.set(m.id, {
        type: "stream",
        streamUuid: m.stream_uuid,
        topic: topicIdentity.topicUuid ?? topicIdentity.subject,
        ...(topicIdentity.topicUuid != null ? { topicUuid: topicIdentity.topicUuid } : {}),
      });
    } else if (m.type === "private" && Array.isArray(m.display_recipient)) {
      const key = dmConversationKey(m.display_recipient, currentUserId);
      nextLoc.set(m.id, { type: "dm", dmKey: key });
    }
  }

  return {
    nextLoc,
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
      if (
        existingTopic &&
        m.timestamp <= existingTopic.ts &&
        existingTopic.lastMessageId !== m.id
      ) {
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
      m.id,
      topic.topicUuid,
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

  const indexed = indexBatchMessageLocations(state, messages, currentUserId);
  const nextStreams = mergeStreamTopicPreviewsFromLatest(state.streamsMap, streamTopicLatest);
  const nextDms = mergeDmPreviewsFromLatest(state.dmsMap, dmLatest, currentUserId, avatarMap);

  return {
    streamsMap: nextStreams,
    dmsMap: nextDms,
    messageIdToLocation: indexed.nextLoc,
    sidebarDataHydrated: true,
    sidebarStreamsUnread: state.sidebarStreamsUnread,
    sidebarDmsUnread: state.sidebarDmsUnread,
    streamTopicMessageIds: patchStreamTopicMessageIndex(
      state.streamTopicMessageIds,
      state.messageIdToLocation,
      indexed.nextLoc,
    ),
  };
}

export function buildStreamTopicLatestMap(
  messages: WorkspaceRawMessage[],
): Map<string, WorkspaceRawMessage> {
  const streamTopicLatest = new Map<string, WorkspaceRawMessage>();
  for (const m of messages) {
    if (m.type === "stream" && m.stream_uuid != null) {
      const topicIdentity = streamTopicIdentityFromMessage(m);
      if (topicIdentity == null) {
        continue;
      }
      const key = streamTopicCompositeKey(
        m.stream_uuid,
        topicIdentity.topicUuid ?? topicIdentity.subject,
      );
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
