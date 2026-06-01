/**
 * Sidebar preview repair when messages are deleted (local patch + optional network fetch).
 */
import { parseDmKeyToUserIds } from "~/entities/message/message-chat-context.lib";
import { fetchMessagesWithNarrow } from "~/shared/api/zulip-messages";
import type { MockMessage } from "~/shared/api/zulip.types";
import { dmConversationKey } from "~/shared/lib/dm-key";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import type { DmEntryInternal, StreamEntryInternal } from "~/shared/types/sidebar-chat";
import { formatMessageTime, truncatePreview } from "./chat-list-format.lib";
import { getNewestTopicEntry } from "./chat-list-stream-entry-merge.lib";
import {
  patchStreamTopicMessageIndex,
  streamTopicCompositeKey,
} from "./chat-list-stream-topic-index.lib";
import type {
  ChatListPreviewSourceMessage,
  ChatListState,
  MessageLocation,
} from "./chat-list.model.types";

export type DeletedPreviewContext =
  | {
      kind: "stream";
      streamId: number;
      topicKey: string;
      streamName: string;
      deletedLastMessageId: number;
    }
  | {
      kind: "dm";
      dmKey: string;
      deletedLastMessageId: number;
    };

interface SidebarResolvedPreview {
  lastMessageId: number;
  lastMessage: string;
  lastMessageSenderName?: string;
  time: string;
  ts: number;
}

export function buildResolvedPreviewFromMessage(
  message: ChatListPreviewSourceMessage,
): SidebarResolvedPreview {
  const trimmedSenderName = message.sender_full_name?.trim();
  const lastMessageSenderName =
    trimmedSenderName && trimmedSenderName.length > 0 ? trimmedSenderName : undefined;
  return {
    lastMessageId: message.id,
    lastMessage: truncatePreview(message.content ?? ""),
    lastMessageSenderName,
    time: formatMessageTime(message.timestamp),
    ts: message.timestamp,
  };
}

export function buildResolvedDmPreviewFromMessage(
  message: ChatListPreviewSourceMessage,
): Pick<DmEntryInternal, "lastMessageId" | "lastMessage" | "time" | "ts"> {
  return {
    lastMessageId: message.id,
    lastMessage: truncatePreview(message.content ?? ""),
    time: formatMessageTime(message.timestamp),
    ts: message.timestamp,
  };
}

function pickNewestMessage<T extends ChatListPreviewSourceMessage>(
  messages: readonly T[],
  predicate: (message: T) => boolean,
  excludedMessageIds?: ReadonlySet<number>,
): T | null {
  let newest: T | null = null;
  for (const message of messages) {
    if (excludedMessageIds?.has(message.id)) continue;
    if (!predicate(message)) continue;
    if (
      newest == null ||
      message.timestamp > newest.timestamp ||
      (message.timestamp === newest.timestamp && message.id > newest.id)
    ) {
      newest = message;
    }
  }
  return newest;
}

export function pickReplacementForStreamTopic<T extends ChatListPreviewSourceMessage>(
  messages: readonly T[],
  streamId: number,
  topicKey: string,
  excludedMessageIds?: ReadonlySet<number>,
): T | null {
  return pickNewestMessage(
    messages,
    (message) =>
      message.stream_id === streamId &&
      normalizeTopicForIdentity(message.subject ?? "") === topicKey,
    excludedMessageIds,
  );
}

export function pickReplacementForDm<T extends ChatListPreviewSourceMessage>(
  messages: readonly T[],
  dmKey: string,
  currentUserId: number | null,
  excludedMessageIds?: ReadonlySet<number>,
): T | null {
  return pickNewestMessage(
    messages,
    (message) => {
      if (message.stream_id != null || !Array.isArray(message.display_recipient)) return false;
      return dmConversationKey(message.display_recipient, currentUserId) === dmKey;
    },
    excludedMessageIds,
  );
}

export async function fetchReplacementMessageForDeletedPreview(
  context: DeletedPreviewContext,
  currentUserId: number | null,
  signal?: AbortSignal,
): Promise<MockMessage | null> {
  try {
    if (context.kind === "stream") {
      if (context.streamName.trim().length === 0) return null;
      const messages = await fetchMessagesWithNarrow(
        [
          { operator: "stream", operand: context.streamName },
          { operator: "topic", operand: context.topicKey },
        ],
        "newest",
        1,
        0,
        { applyMarkdown: true, signal },
      );
      const replacement = pickReplacementForStreamTopic(
        messages,
        context.streamId,
        context.topicKey,
      );
      return replacement?.id === context.deletedLastMessageId ? null : replacement;
    }

    const userIds = parseDmKeyToUserIds(context.dmKey, currentUserId);
    if (userIds.length === 0) return null;
    const messages = await fetchMessagesWithNarrow(
      [{ operator: "dm", operand: userIds }],
      "newest",
      1,
      0,
      { applyMarkdown: true, signal },
    );
    const replacement = pickReplacementForDm(messages, context.dmKey, currentUserId);
    return replacement?.id === context.deletedLastMessageId ? null : replacement;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return null;
    }
    return null;
  }
}

type StreamDeleteContext = Extract<DeletedPreviewContext, { kind: "stream" }>;
type DmDeleteContext = Extract<DeletedPreviewContext, { kind: "dm" }>;

function registerStreamDeleteContext(
  streamContextsByKey: Map<string, StreamDeleteContext>,
  streamId: number,
  topicKey: string,
  streamName: string,
  deletedLastMessageId: number,
): void {
  const key = streamTopicCompositeKey(streamId, topicKey);
  const existing = streamContextsByKey.get(key);
  if (!existing || deletedLastMessageId > existing.deletedLastMessageId) {
    streamContextsByKey.set(key, {
      kind: "stream",
      streamId,
      topicKey,
      streamName,
      deletedLastMessageId,
    });
  }
}

function registerDmDeleteContext(
  dmContextsByKey: Map<string, DmDeleteContext>,
  dmKey: string,
  deletedLastMessageId: number,
): void {
  const existing = dmContextsByKey.get(dmKey);
  if (!existing || deletedLastMessageId > existing.deletedLastMessageId) {
    dmContextsByKey.set(dmKey, {
      kind: "dm",
      dmKey,
      deletedLastMessageId,
    });
  }
}

function collectDeleteContextsFromMessageLocations(
  state: ChatListState,
  messageIds: number[],
  streamContextsByKey: Map<string, StreamDeleteContext>,
  dmContextsByKey: Map<string, DmDeleteContext>,
): void {
  const locMap = state.messageIdToLocation;
  for (const mid of messageIds) {
    const loc = locMap.get(mid);
    if (!loc) continue;
    if (loc.type === "stream") {
      const stream = state.streamsMap.get(loc.stream_id);
      const topic = stream?.topics.get(loc.topic);
      if (topic?.lastMessageId === mid && stream != null) {
        registerStreamDeleteContext(
          streamContextsByKey,
          loc.stream_id,
          loc.topic,
          stream.name,
          mid,
        );
      }
      continue;
    }
    const dm = state.dmsMap.get(loc.dmKey);
    if (dm?.lastMessageId === mid) {
      registerDmDeleteContext(dmContextsByKey, loc.dmKey, mid);
    }
  }
}

function collectDeleteContextsFromStoredLastMessageIds(
  state: ChatListState,
  deletedMessageIds: Set<number>,
  streamContextsByKey: Map<string, StreamDeleteContext>,
  dmContextsByKey: Map<string, DmDeleteContext>,
): void {
  for (const [streamId, stream] of state.streamsMap.entries()) {
    for (const [topicKey, topic] of stream.topics.entries()) {
      if (topic.lastMessageId == null) continue;
      if (!deletedMessageIds.has(topic.lastMessageId)) continue;
      registerStreamDeleteContext(
        streamContextsByKey,
        streamId,
        topicKey,
        stream.name,
        topic.lastMessageId,
      );
    }
  }
  for (const [dmKey, dm] of state.dmsMap.entries()) {
    if (dm.lastMessageId == null) continue;
    if (!deletedMessageIds.has(dm.lastMessageId)) continue;
    registerDmDeleteContext(dmContextsByKey, dmKey, dm.lastMessageId);
  }
}

function collectDeletedPreviewContexts(
  state: ChatListState,
  messageIds: number[],
  deletedMessageIds: Set<number>,
): {
  streamContextsByKey: Map<string, StreamDeleteContext>;
  dmContextsByKey: Map<string, DmDeleteContext>;
} {
  const streamContextsByKey = new Map<string, StreamDeleteContext>();
  const dmContextsByKey = new Map<string, DmDeleteContext>();
  collectDeleteContextsFromMessageLocations(
    state,
    messageIds,
    streamContextsByKey,
    dmContextsByKey,
  );
  collectDeleteContextsFromStoredLastMessageIds(
    state,
    deletedMessageIds,
    streamContextsByKey,
    dmContextsByKey,
  );
  return { streamContextsByKey, dmContextsByKey };
}

function removeDeletedMessageIdsFromLocationMap(
  locMap: Map<number, MessageLocation>,
  messageIds: number[],
): { nextLoc: Map<number, MessageLocation>; changed: boolean } {
  let nextLoc = locMap;
  let changed = false;
  for (const mid of messageIds) {
    if (!nextLoc.has(mid)) continue;
    if (!changed) {
      nextLoc = new Map(nextLoc);
      changed = true;
    }
    nextLoc.delete(mid);
  }
  return { nextLoc, changed };
}

function applyStreamDeletedPreviewRepairs(
  nextStreams: Map<number, StreamEntryInternal>,
  streamContextsByKey: Map<string, StreamDeleteContext>,
  replacementMessages: readonly ChatListPreviewSourceMessage[],
  deletedMessageIds: Set<number>,
  resolveMissingPreview: boolean,
  contextsToResolveFromNetwork: DeletedPreviewContext[],
): { streamsMap: Map<number, StreamEntryInternal>; changedStreamIds: Set<number> } {
  let streamsMap = nextStreams;
  let streamsChanged = false;
  const changedStreamIds = new Set<number>();

  const ensureMutableStreams = () => {
    if (!streamsChanged) {
      streamsMap = new Map(streamsMap);
      streamsChanged = true;
    }
  };

  for (const context of streamContextsByKey.values()) {
    const stream = streamsMap.get(context.streamId);
    const topic = stream?.topics.get(context.topicKey);
    if (!stream || !topic) continue;
    const replacement = pickReplacementForStreamTopic(
      replacementMessages,
      context.streamId,
      context.topicKey,
      deletedMessageIds,
    );
    const nextTopic =
      replacement == null
        ? {
            ...topic,
            lastMessage: "",
            lastMessageSenderName: undefined,
            time: "",
            ts: 0,
            lastMessageId: undefined,
          }
        : {
            ...topic,
            ...buildResolvedPreviewFromMessage(replacement),
          };
    ensureMutableStreams();
    const nextTopics = new Map(stream.topics);
    nextTopics.set(context.topicKey, nextTopic);
    streamsMap.set(context.streamId, { ...stream, topics: nextTopics });
    changedStreamIds.add(context.streamId);
    if (replacement == null && resolveMissingPreview) {
      contextsToResolveFromNetwork.push(context);
    }
  }

  if (!streamsChanged) {
    return { streamsMap: nextStreams, changedStreamIds };
  }

  for (const streamId of changedStreamIds) {
    const stream = streamsMap.get(streamId);
    if (!stream) continue;
    const newestTopic = getNewestTopicEntry(stream.topics);
    streamsMap.set(streamId, {
      ...stream,
      ...(newestTopic != null
        ? {
            lastMessage: newestTopic.lastMessage,
            lastMessageSenderName: newestTopic.lastMessageSenderName,
            time: newestTopic.time,
            ts: newestTopic.ts,
          }
        : {
            lastMessage: "",
            lastMessageSenderName: undefined,
            time: "",
            ts: 0,
          }),
    });
  }

  return { streamsMap, changedStreamIds };
}

function applyDmDeletedPreviewRepairs(
  nextDms: Map<string, DmEntryInternal>,
  dmContextsByKey: Map<string, DmDeleteContext>,
  replacementMessages: readonly ChatListPreviewSourceMessage[],
  deletedMessageIds: Set<number>,
  currentUserId: number | null,
  resolveMissingPreview: boolean,
  contextsToResolveFromNetwork: DeletedPreviewContext[],
): Map<string, DmEntryInternal> {
  let dmsMap = nextDms;
  let dmsChanged = false;
  const ensureMutableDms = () => {
    if (!dmsChanged) {
      dmsMap = new Map(dmsMap);
      dmsChanged = true;
    }
  };

  for (const context of dmContextsByKey.values()) {
    const dm = dmsMap.get(context.dmKey);
    if (!dm) continue;
    const replacement = pickReplacementForDm(
      replacementMessages,
      context.dmKey,
      currentUserId,
      deletedMessageIds,
    );
    const nextDm =
      replacement == null
        ? {
            ...dm,
            lastMessage: "",
            time: "",
            ts: 0,
            lastMessageId: undefined,
          }
        : {
            ...dm,
            ...buildResolvedDmPreviewFromMessage(replacement),
          };
    ensureMutableDms();
    dmsMap.set(context.dmKey, nextDm);
    if (replacement == null && resolveMissingPreview) {
      contextsToResolveFromNetwork.push(context);
    }
  }

  return dmsChanged ? dmsMap : nextDms;
}

export interface ApplyHandleDeleteMessagesStateParams {
  messageIds: number[];
  deletedMessageIds: Set<number>;
  replacementMessages: readonly ChatListPreviewSourceMessage[];
  resolveMissingPreview: boolean;
  currentUserId: number | null;
}

export function applyHandleDeleteMessagesStatePatch(
  state: ChatListState,
  params: ApplyHandleDeleteMessagesStateParams,
): {
  patch: Partial<ChatListState> | ChatListState;
  contextsToResolveFromNetwork: DeletedPreviewContext[];
} {
  const {
    messageIds,
    deletedMessageIds,
    replacementMessages,
    resolveMissingPreview,
    currentUserId,
  } = params;

  const contextsToResolveFromNetwork: DeletedPreviewContext[] = [];
  const locationRemoval = removeDeletedMessageIdsFromLocationMap(
    state.messageIdToLocation,
    messageIds,
  );
  const { streamContextsByKey, dmContextsByKey } = collectDeletedPreviewContexts(
    state,
    messageIds,
    deletedMessageIds,
  );

  const streamRepair = applyStreamDeletedPreviewRepairs(
    state.streamsMap,
    streamContextsByKey,
    replacementMessages,
    deletedMessageIds,
    resolveMissingPreview,
    contextsToResolveFromNetwork,
  );
  const nextStreams = streamRepair.streamsMap;
  const streamsChanged = nextStreams !== state.streamsMap;

  const nextDms = applyDmDeletedPreviewRepairs(
    state.dmsMap,
    dmContextsByKey,
    replacementMessages,
    deletedMessageIds,
    currentUserId,
    resolveMissingPreview,
    contextsToResolveFromNetwork,
  );
  const dmsChanged = nextDms !== state.dmsMap;

  const nextLoc = locationRemoval.nextLoc;
  const locationsChanged = locationRemoval.changed;

  if (!locationsChanged && !streamsChanged && !dmsChanged) {
    return { patch: state, contextsToResolveFromNetwork };
  }

  return {
    patch: {
      ...(streamsChanged ? { streamsMap: nextStreams } : {}),
      ...(dmsChanged ? { dmsMap: nextDms } : {}),
      ...(locationsChanged ? { messageIdToLocation: nextLoc } : {}),
      ...(locationsChanged
        ? {
            streamTopicMessageIds: patchStreamTopicMessageIndex(
              state.streamTopicMessageIds,
              state.messageIdToLocation,
              nextLoc,
            ),
          }
        : {}),
    },
    contextsToResolveFromNetwork,
  };
}
