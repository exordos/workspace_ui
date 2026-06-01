/**
 * Applies unread reconcile maps to chat-list store state (counts, previews, locations).
 */
import type { ZulipRawMessage } from "~/shared/api/zulip.types";
import { dmConversationKey } from "~/shared/lib/dm-key";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import type { DmEntryInternal, StreamEntryInternal } from "~/shared/types/sidebar-chat";
import { rebuildStreamFromTopics } from "./chat-list-stream-entry-merge.lib";
import {
  patchStreamTopicMessageIndex,
  streamTopicCompositeKey,
} from "./chat-list-stream-topic-index.lib";
import { isUnreadFromOthers, messageToDmEntry, messageToStreamEntry } from "./chat-list.lib";
import type { ChatListState, MessageLocation } from "./chat-list.model.types";

type StreamTopicEntryInternal =
  StreamEntryInternal["topics"] extends Map<string, infer TopicEntry> ? TopicEntry : never;

export function parseStreamTopicCompositeKey(
  key: string,
): { streamId: number; topicKey: string } | null {
  const tab = key.indexOf("\t");
  if (tab <= 0) return null;
  const streamId = Number(key.slice(0, tab));
  if (!Number.isInteger(streamId) || streamId <= 0) return null;
  return { streamId, topicKey: key.slice(tab + 1) };
}

/** Keys that may need unread count updates: server snapshot + locally non-zero (stale reset). */
export function collectStreamTopicKeysForUnreadReconcile(
  streamsMap: Map<number, StreamEntryInternal>,
  unreadStreamCounts: Map<string, number>,
): Set<string> {
  const keys = new Set<string>(unreadStreamCounts.keys());
  for (const [streamId, stream] of streamsMap.entries()) {
    for (const [topicKey, topic] of stream.topics.entries()) {
      if (topic.unreadCount > 0) {
        keys.add(streamTopicCompositeKey(streamId, topicKey));
      }
    }
  }
  return keys;
}

export function collectDmKeysForUnreadReconcile(
  dmsMap: Map<string, DmEntryInternal>,
  unreadDmCounts: Map<string, number>,
): Set<string> {
  const keys = new Set<string>(unreadDmCounts.keys());
  for (const [dmKey, dm] of dmsMap.entries()) {
    if (dm.unreadCount > 0) {
      keys.add(dmKey);
    }
  }
  return keys;
}

export function isMessageNewer(
  message: ZulipRawMessage,
  existingTs: number,
  existingLastMessageId?: number | null,
): boolean {
  if (message.timestamp !== existingTs) {
    return message.timestamp > existingTs;
  }
  if (existingLastMessageId == null) {
    return true;
  }
  return message.id > existingLastMessageId;
}

export function buildLatestUnreadStreamMessageMap(
  messages: readonly ZulipRawMessage[],
  currentUserId: number | null,
): Map<string, ZulipRawMessage> {
  const map = new Map<string, ZulipRawMessage>();
  for (const message of messages) {
    if (!isUnreadFromOthers(message, currentUserId)) continue;
    if (message.type !== "stream" || message.stream_id == null) continue;
    const topic = normalizeTopicForIdentity(message.subject ?? "");
    const key = streamTopicCompositeKey(message.stream_id, topic);
    const existing = map.get(key);
    if (!existing || isMessageNewer(message, existing.timestamp, existing.id)) {
      map.set(key, message);
    }
  }
  return map;
}

export function buildLatestUnreadDmMessageMap(
  messages: readonly ZulipRawMessage[],
  currentUserId: number | null,
): Map<string, ZulipRawMessage> {
  const map = new Map<string, ZulipRawMessage>();
  for (const message of messages) {
    if (!isUnreadFromOthers(message, currentUserId)) continue;
    if (message.type !== "private" || !Array.isArray(message.display_recipient)) continue;
    const dmKey = dmConversationKey(message.display_recipient, currentUserId);
    const existing = map.get(dmKey);
    if (!existing || isMessageNewer(message, existing.timestamp, existing.id)) {
      map.set(dmKey, message);
    }
  }
  return map;
}

interface StreamTopicUnreadPatch {
  topicKey: string;
  unreadCount: number;
}

/** Groups topic unread count changes by stream for a single topics-map clone per stream. */
export function groupStreamTopicUnreadPatches(
  streamsMap: ReadonlyMap<number, StreamEntryInternal>,
  streamTopicKeysToReconcile: Iterable<string>,
  unreadStreamCounts: ReadonlyMap<string, number>,
): Map<number, StreamTopicUnreadPatch[]> {
  const byStream = new Map<number, StreamTopicUnreadPatch[]>();
  for (const compositeKey of streamTopicKeysToReconcile) {
    const parsed = parseStreamTopicCompositeKey(compositeKey);
    if (parsed == null) continue;
    const { streamId, topicKey } = parsed;
    const stream = streamsMap.get(streamId);
    if (stream == null) continue;
    const topic = stream.topics.get(topicKey);
    const nextUnreadCount = unreadStreamCounts.get(compositeKey) ?? 0;
    if (topic == null) {
      if (nextUnreadCount === 0) continue;
    } else if (topic.unreadCount === nextUnreadCount) {
      continue;
    }
    const patch = { topicKey, unreadCount: nextUnreadCount };
    const list = byStream.get(streamId);
    if (list) {
      list.push(patch);
    } else {
      byStream.set(streamId, [patch]);
    }
  }
  return byStream;
}

export function applyStreamTopicUnreadPatches(
  streamsMap: Map<number, StreamEntryInternal>,
  patchesByStream: Map<number, StreamTopicUnreadPatch[]>,
): Map<number, StreamEntryInternal> {
  const nextStreams = new Map(streamsMap);
  for (const [streamId, patches] of patchesByStream) {
    const stream = nextStreams.get(streamId);
    if (stream == null) continue;
    const nextTopics = new Map(stream.topics);
    for (const { topicKey, unreadCount } of patches) {
      const topic = nextTopics.get(topicKey);
      if (topic == null) {
        if (unreadCount === 0) continue;
        nextTopics.set(topicKey, {
          subject: topicKey,
          lastMessage: "",
          time: "",
          ts: 0,
          unreadCount,
        });
        continue;
      }
      nextTopics.set(topicKey, { ...topic, unreadCount });
    }
    nextStreams.set(streamId, { ...stream, topics: nextTopics });
  }
  return nextStreams;
}

export function groupLatestUnreadStreamMessagesByStream(
  latestUnreadStreams: ReadonlyMap<string, ZulipRawMessage>,
): Map<number, ZulipRawMessage[]> {
  const byStream = new Map<number, ZulipRawMessage[]>();
  for (const message of latestUnreadStreams.values()) {
    if (message.stream_id == null) continue;
    const streamId = message.stream_id;
    const list = byStream.get(streamId);
    if (list) {
      list.push(message);
    } else {
      byStream.set(streamId, [message]);
    }
  }
  return byStream;
}

export function applyLatestUnreadStreamMetadata(
  streamsMap: Map<number, StreamEntryInternal>,
  latestByStream: Map<number, ZulipRawMessage[]>,
  unreadStreamCounts: ReadonlyMap<string, number>,
): { streamsMap: Map<number, StreamEntryInternal>; changed: boolean } {
  let nextStreams = streamsMap;
  let changed = false;

  for (const [streamId, messages] of latestByStream) {
    const stream = nextStreams.get(streamId);
    let nextTopics: Map<string, StreamTopicEntryInternal> | null = null;
    let streamShell: StreamEntryInternal | null = null;
    let streamTopicsChanged = false;

    const ensureTopics = (): Map<string, StreamTopicEntryInternal> => {
      nextTopics ??= stream != null ? new Map(stream.topics) : new Map();
      return nextTopics;
    };

    for (const message of messages) {
      const entry = messageToStreamEntry(message);
      if (!entry) continue;
      const topicKey = entry.topic.subject;
      const unreadCount = unreadStreamCounts.get(streamTopicCompositeKey(streamId, topicKey)) ?? 0;
      const unreadTopic = { ...entry.topic, unreadCount };

      if (stream == null) {
        streamShell ??= entry.stream;
        ensureTopics().set(topicKey, unreadTopic);
        streamTopicsChanged = true;
        continue;
      }

      const existingTopic = stream.topics.get(topicKey);
      if (existingTopic == null) {
        ensureTopics().set(topicKey, unreadTopic);
        streamTopicsChanged = true;
        continue;
      }

      if (!isMessageNewer(message, existingTopic.ts, existingTopic.lastMessageId)) {
        continue;
      }
      ensureTopics().set(topicKey, unreadTopic);
      streamTopicsChanged = true;
    }

    if (!streamTopicsChanged || nextTopics == null) continue;

    if (!changed) {
      nextStreams = new Map(nextStreams);
      changed = true;
    }

    const baseStream = stream ?? {
      ...streamShell!,
      topics: new Map(),
    };
    nextStreams.set(streamId, rebuildStreamFromTopics(baseStream, nextTopics));
  }

  return { streamsMap: nextStreams, changed };
}

function reconcileStreamUnreadCounts(
  streamsMap: Map<number, StreamEntryInternal>,
  unreadStreamCounts: Map<string, number>,
): {
  streamsMap: Map<number, StreamEntryInternal>;
  changed: boolean;
  topicUnreadPatchesByStream: Map<number, StreamTopicUnreadPatch[]>;
} {
  const streamTopicKeysToReconcile = collectStreamTopicKeysForUnreadReconcile(
    streamsMap,
    unreadStreamCounts,
  );
  const topicUnreadPatchesByStream = groupStreamTopicUnreadPatches(
    streamsMap,
    streamTopicKeysToReconcile,
    unreadStreamCounts,
  );
  if (topicUnreadPatchesByStream.size === 0) {
    return { streamsMap, changed: false, topicUnreadPatchesByStream };
  }
  return {
    streamsMap: applyStreamTopicUnreadPatches(streamsMap, topicUnreadPatchesByStream),
    changed: true,
    topicUnreadPatchesByStream,
  };
}

function reconcileDmUnreadCounts(
  dmsMap: Map<string, DmEntryInternal>,
  unreadDmCounts: Map<string, number>,
): {
  dmsMap: Map<string, DmEntryInternal>;
  changed: boolean;
  dmKeysToReconcile: Set<string>;
} {
  const dmKeysToReconcile = collectDmKeysForUnreadReconcile(dmsMap, unreadDmCounts);
  let nextDms = dmsMap;
  let changed = false;
  for (const dmKey of dmKeysToReconcile) {
    const dm = nextDms.get(dmKey);
    if (dm == null) continue;
    const nextUnreadCount = unreadDmCounts.get(dmKey) ?? 0;
    if (dm.unreadCount === nextUnreadCount) continue;
    if (!changed) {
      nextDms = new Map(nextDms);
      changed = true;
    }
    nextDms.set(dmKey, { ...dm, unreadCount: nextUnreadCount });
  }
  return { dmsMap: nextDms, changed, dmKeysToReconcile };
}

function reconcileLatestDmUnreadPreviews(
  dmsMap: Map<string, DmEntryInternal>,
  latestUnreadDms: Map<string, ZulipRawMessage>,
  unreadDmCounts: Map<string, number>,
  effectiveUserId: number | null,
  avatarMap: Map<number, string>,
): { dmsMap: Map<string, DmEntryInternal>; changed: boolean } {
  let nextDms = dmsMap;
  let changed = false;
  for (const [dmKey, message] of latestUnreadDms.entries()) {
    const dmEntry = messageToDmEntry(message, effectiveUserId, avatarMap);
    if (dmEntry == null) continue;
    const existing = nextDms.get(dmKey);
    const unreadCount = unreadDmCounts.get(dmKey) ?? 0;

    if (existing == null) {
      if (!changed) {
        nextDms = new Map(nextDms);
        changed = true;
      }
      nextDms.set(dmKey, { ...dmEntry, unreadCount, lastMessageId: message.id });
      continue;
    }

    if (!isMessageNewer(message, existing.ts, existing.lastMessageId)) {
      continue;
    }

    if (!changed) {
      nextDms = new Map(nextDms);
      changed = true;
    }
    nextDms.set(dmKey, {
      ...dmEntry,
      unreadCount,
      avatar_url: dmEntry.avatar_url ?? existing.avatar_url,
      lastMessageId: message.id,
    });
  }
  return { dmsMap: nextDms, changed };
}

function mergeUnreadLocationMap(
  messageIdToLocation: Map<number, MessageLocation>,
  unreadLocationMap: Map<number, MessageLocation>,
): { messageIdToLocation: Map<number, MessageLocation>; changed: boolean } {
  let nextLocations = messageIdToLocation;
  let changed = false;
  for (const [messageId, location] of unreadLocationMap.entries()) {
    const existing = nextLocations.get(messageId);
    const sameLocation =
      existing?.type === location.type &&
      (existing?.type === "stream"
        ? location.type === "stream" &&
          existing.stream_id === location.stream_id &&
          existing.topic === location.topic
        : location.type === "dm" && existing?.dmKey === location.dmKey);
    if (sameLocation) continue;
    if (!changed) {
      nextLocations = new Map(nextLocations);
      changed = true;
    }
    nextLocations.set(messageId, location);
  }
  return { messageIdToLocation: nextLocations, changed };
}

function computeReconcileSidebarUnreadDeltas(
  state: ChatListState,
  topicUnreadPatchesByStream: Map<number, StreamTopicUnreadPatch[]>,
  dmKeysToReconcile: Set<string>,
  unreadDmCounts: Map<string, number>,
): { sidebarStreamsUnreadDelta: number; sidebarDmsUnreadDelta: number } {
  let sidebarStreamsUnreadDelta = 0;
  for (const [streamId, patches] of topicUnreadPatchesByStream) {
    const stream = state.streamsMap.get(streamId);
    for (const { topicKey, unreadCount } of patches) {
      sidebarStreamsUnreadDelta += unreadCount - (stream?.topics.get(topicKey)?.unreadCount ?? 0);
    }
  }
  let sidebarDmsUnreadDelta = 0;
  for (const dmKey of dmKeysToReconcile) {
    sidebarDmsUnreadDelta +=
      (unreadDmCounts.get(dmKey) ?? 0) - (state.dmsMap.get(dmKey)?.unreadCount ?? 0);
  }
  return { sidebarStreamsUnreadDelta, sidebarDmsUnreadDelta };
}

export interface ApplyReconcileUnreadMapsParams {
  unreadStreamCounts: Map<string, number>;
  unreadDmCounts: Map<string, number>;
  unreadLocationMap: Map<number, MessageLocation>;
  latestUnreadStreams: Map<string, ZulipRawMessage>;
  latestUnreadDms: Map<string, ZulipRawMessage>;
  effectiveUserId: number | null;
  avatarMap: Map<number, string>;
}

export function applyReconcileUnreadMapsPatch(
  state: ChatListState,
  params: ApplyReconcileUnreadMapsParams,
): Partial<ChatListState> | typeof state {
  const {
    unreadStreamCounts,
    unreadDmCounts,
    unreadLocationMap,
    latestUnreadStreams,
    latestUnreadDms,
    effectiveUserId,
    avatarMap,
  } = params;

  const streamReconcile = reconcileStreamUnreadCounts(state.streamsMap, unreadStreamCounts);
  let nextStreams = streamReconcile.streamsMap;
  let streamsChanged = streamReconcile.changed;

  const dmCountReconcile = reconcileDmUnreadCounts(state.dmsMap, unreadDmCounts);
  let nextDms = dmCountReconcile.dmsMap;
  let dmsChanged = dmCountReconcile.changed;

  const latestUnreadByStream = groupLatestUnreadStreamMessagesByStream(latestUnreadStreams);
  const metadataResult = applyLatestUnreadStreamMetadata(
    nextStreams,
    latestUnreadByStream,
    unreadStreamCounts,
  );
  if (metadataResult.changed) {
    nextStreams = metadataResult.streamsMap;
    streamsChanged = true;
  }

  const dmPreviewReconcile = reconcileLatestDmUnreadPreviews(
    nextDms,
    latestUnreadDms,
    unreadDmCounts,
    effectiveUserId,
    avatarMap,
  );
  nextDms = dmPreviewReconcile.dmsMap;
  dmsChanged = dmsChanged || dmPreviewReconcile.changed;

  const locationMerge = mergeUnreadLocationMap(state.messageIdToLocation, unreadLocationMap);
  const nextLocations = locationMerge.messageIdToLocation;
  const locationsChanged = locationMerge.changed;

  if (
    !streamsChanged &&
    !dmsChanged &&
    !locationsChanged &&
    effectiveUserId === state.currentUserId
  ) {
    return state;
  }

  const { sidebarStreamsUnreadDelta, sidebarDmsUnreadDelta } = computeReconcileSidebarUnreadDeltas(
    state,
    streamReconcile.topicUnreadPatchesByStream,
    dmCountReconcile.dmKeysToReconcile,
    unreadDmCounts,
  );

  return {
    ...(streamsChanged ? { streamsMap: nextStreams } : {}),
    ...(dmsChanged ? { dmsMap: nextDms } : {}),
    ...(locationsChanged ? { messageIdToLocation: nextLocations } : {}),
    ...(effectiveUserId !== state.currentUserId ? { currentUserId: effectiveUserId } : {}),
    sidebarStreamsUnread: state.sidebarStreamsUnread + sidebarStreamsUnreadDelta,
    sidebarDmsUnread: state.sidebarDmsUnread + sidebarDmsUnreadDelta,
    ...(locationsChanged
      ? {
          streamTopicMessageIds: patchStreamTopicMessageIndex(
            state.streamTopicMessageIds,
            state.messageIdToLocation,
            nextLocations,
          ),
        }
      : {}),
  };
}
