/**
 * Pure helpers for chat-list sidebar bootstrap: IndexedDB hydrate, message rebuild,
 * metadata-only DM rows, and bootstrap error state patches.
 */
import type { WorkspaceRawMessage } from "~/shared/api/messenger.types";
import {
  deserializeStreamEntry,
  type ChatListSnapshotSerialized,
} from "~/shared/lib/chat-list-snapshot-serialize.lib";
import { dmConversationKey } from "~/shared/lib/dm-key";
import type { MessageId } from "~/shared/lib/message-id.lib";
import {
  compareUserIds,
  isUserIdentityReady,
  numericUserIdOrNull,
  type UserId,
  userIdStorageKey,
  userIdsEqual,
} from "~/shared/lib/user-id.lib";
import type { DmEntryInternal, StreamEntryInternal } from "~/shared/types/sidebar-chat";
import {
  formatMessageTime,
  SYNTHETIC_DM_ID_OFFSET,
  hashKey,
  slugify,
} from "./chat-list-format.lib";
import { buildSidebarFromMessages, streamTopicIdentityFromMessage } from "./chat-list.lib";
import type { ChatListDmMetadataRow, MessageLocation } from "./chat-list.model.types";

type StreamTopicEntryInternal =
  StreamEntryInternal["topics"] extends Map<string, infer TopicEntry> ? TopicEntry : never;

export interface ChatListDmBootstrapDisplayContext {
  getParticipantDisplayName: (userId: UserId) => string;
  getAvatarUrl: (userId: UserId) => string | undefined;
  dmFallbackLabel: string;
}

/** Patch fragment that clears bootstrap error after a successful sidebar rebuild. */
export function clearBootstrapErrorPatch(): { bootstrapError: null } {
  return { bootstrapError: null };
}

/** Builds message id → sidebar location index from a bootstrap message batch. */
export function buildMessageIdToLocation(
  messages: readonly WorkspaceRawMessage[],
  currentUserId: UserId | null,
): Map<MessageId, MessageLocation> {
  const map = new Map<MessageId, MessageLocation>();
  for (const m of messages) {
    if (m.type === "stream" && m.stream_uuid != null) {
      const topicIdentity = streamTopicIdentityFromMessage(m);
      if (topicIdentity == null) continue;
      map.set(m.id, {
        type: "stream",
        streamUuid: m.stream_uuid,
        topic: topicIdentity.topicUuid ?? topicIdentity.subject,
        ...(topicIdentity.topicUuid != null ? { topicUuid: topicIdentity.topicUuid } : {}),
      });
    } else if (m.type === "private" && Array.isArray(m.display_recipient)) {
      const dmKey = dmConversationKey(m.display_recipient, currentUserId);
      map.set(m.id, { type: "dm", dmKey });
    }
  }
  return map;
}

function findTopicMetadata(
  previousTopics: Map<string, StreamTopicEntryInternal>,
  topic: StreamTopicEntryInternal,
): StreamTopicEntryInternal | undefined {
  const bySubject = previousTopics.get(topic.subject);
  if (bySubject != null) {
    return bySubject;
  }
  const topicUuid = topic.topicUuid?.trim().toLowerCase();
  if (topicUuid == null || topicUuid.length === 0) {
    return undefined;
  }
  for (const previousTopic of previousTopics.values()) {
    if (previousTopic.topicUuid?.trim().toLowerCase() === topicUuid) {
      return previousTopic;
    }
  }
  return undefined;
}

function mergeTopicMetadata(
  topics: Map<string, StreamTopicEntryInternal>,
  previousTopics: Map<string, StreamTopicEntryInternal>,
): Map<string, StreamTopicEntryInternal> {
  let nextTopics = topics;
  for (const [key, topic] of topics) {
    const previousTopic = findTopicMetadata(previousTopics, topic);
    const missingColor = topic.color == null && previousTopic?.color != null;
    const missingDoneState = topic.isDone == null && previousTopic?.isDone === true;
    if (!missingColor && !missingDoneState) continue;
    if (nextTopics === topics) {
      nextTopics = new Map(topics);
    }
    nextTopics.set(key, {
      ...topic,
      ...(missingColor ? { color: previousTopic.color } : {}),
      ...(missingDoneState ? { isDone: true } : {}),
    });
  }
  return nextTopics;
}

function hasTopicMetadata(topics: Map<string, StreamTopicEntryInternal>): boolean {
  for (const topic of topics.values()) {
    if (topic.color != null || topic.isDone === true) return true;
  }
  return false;
}

/** Preserves stream permission metadata when rebuilding sidebar from messages. */
export function mergeStreamAccessMetadata(
  stream: StreamEntryInternal,
  existing: StreamEntryInternal | undefined,
): StreamEntryInternal {
  if (existing == null) return stream;
  const topics = mergeTopicMetadata(stream.topics, existing.topics);
  const hasMetadata =
    existing.unreadCount != null ||
    existing.isArchived != null ||
    existing.creatorId != null ||
    existing.inviteOnly != null ||
    existing.color != null ||
    topics !== stream.topics ||
    existing.canAddSubscribersGroup != null ||
    existing.canRemoveSubscribersGroup != null ||
    existing.canAdministerChannelGroup != null ||
    existing.canResolveTopicsGroup != null ||
    existing.canMoveMessagesOutOfChannelGroup != null ||
    hasTopicMetadata(existing.topics);
  if (!hasMetadata) return stream;
  return {
    ...stream,
    ...(topics !== stream.topics ? { topics } : {}),
    ...(existing.unreadCount != null ? { unreadCount: existing.unreadCount } : {}),
    ...(existing.isArchived != null ? { isArchived: existing.isArchived } : {}),
    ...(existing.creatorId != null ? { creatorId: existing.creatorId } : {}),
    ...(existing.inviteOnly != null ? { inviteOnly: existing.inviteOnly } : {}),
    ...(existing.color != null ? { color: existing.color } : {}),
    ...(existing.canAddSubscribersGroup != null
      ? { canAddSubscribersGroup: existing.canAddSubscribersGroup }
      : {}),
    ...(existing.canRemoveSubscribersGroup != null
      ? { canRemoveSubscribersGroup: existing.canRemoveSubscribersGroup }
      : {}),
    ...(existing.canAdministerChannelGroup != null
      ? { canAdministerChannelGroup: existing.canAdministerChannelGroup }
      : {}),
    ...(existing.canResolveTopicsGroup != null
      ? { canResolveTopicsGroup: existing.canResolveTopicsGroup }
      : {}),
    ...(existing.canMoveMessagesOutOfChannelGroup != null
      ? { canMoveMessagesOutOfChannelGroup: existing.canMoveMessagesOutOfChannelGroup }
      : {}),
  };
}

/** Applies access-metadata merge across a rebuilt streams map. */
export function mergeBootstrapStreamsWithPreviousMetadata(
  streamsMap: Map<string, StreamEntryInternal>,
  previousStreamsMap: Map<string, StreamEntryInternal>,
): Map<string, StreamEntryInternal> {
  if (previousStreamsMap.size === 0 || streamsMap.size === 0) {
    return streamsMap;
  }
  const next = new Map(streamsMap);
  for (const [streamId, stream] of next.entries()) {
    next.set(streamId, mergeStreamAccessMetadata(stream, previousStreamsMap.get(streamId)));
  }
  return next;
}

function findCachedTopicForAuthoritativeTopic(
  cachedTopics: Map<string, StreamTopicEntryInternal>,
  authoritativeTopic: StreamTopicEntryInternal,
): [string, StreamTopicEntryInternal] | null {
  const topicUuid = authoritativeTopic.topicUuid?.trim().toLowerCase();
  if (topicUuid != null && topicUuid.length > 0) {
    for (const [key, cachedTopic] of cachedTopics) {
      if (cachedTopic.topicUuid?.trim().toLowerCase() === topicUuid) {
        return [key, cachedTopic];
      }
    }
  }
  const bySubject = cachedTopics.get(authoritativeTopic.subject);
  if (
    bySubject == null ||
    (topicUuid != null &&
      topicUuid.length > 0 &&
      bySubject.topicUuid != null &&
      bySubject.topicUuid.trim().toLowerCase() !== topicUuid)
  ) {
    return null;
  }
  return [authoritativeTopic.subject, bySubject];
}

function mergeCachedTopicPreviewIntoAuthoritativeTopic(
  cachedTopic: StreamTopicEntryInternal,
  authoritativeTopic: StreamTopicEntryInternal,
): StreamTopicEntryInternal {
  if (cachedTopic.ts < authoritativeTopic.ts) {
    return authoritativeTopic;
  }
  return {
    ...authoritativeTopic,
    lastMessage: cachedTopic.lastMessage,
    lastMessageSenderName: cachedTopic.lastMessageSenderName,
    time: cachedTopic.time,
    ts: cachedTopic.ts,
    ...(cachedTopic.lastMessageId != null ? { lastMessageId: cachedTopic.lastMessageId } : {}),
  };
}

/**
 * Keeps the authoritative stream/topic set when a slower IndexedDB read settles after the
 * gateway bootstrap, while restoring cached message previews for matching entities.
 */
export function mergeCachedStreamPreviewsIntoAuthoritativeMetadata(
  cachedStreamsMap: Map<string, StreamEntryInternal>,
  authoritativeStreamsMap: Map<string, StreamEntryInternal>,
): Map<string, StreamEntryInternal> {
  const nextStreams = new Map<string, StreamEntryInternal>();
  for (const [streamUuid, authoritativeStream] of authoritativeStreamsMap) {
    const cachedStream = cachedStreamsMap.get(streamUuid);
    if (cachedStream == null) {
      nextStreams.set(streamUuid, authoritativeStream);
      continue;
    }

    const nextTopics = new Map(authoritativeStream.topics);
    for (const [authoritativeKey, authoritativeTopic] of authoritativeStream.topics) {
      const cachedMatch = findCachedTopicForAuthoritativeTopic(
        cachedStream.topics,
        authoritativeTopic,
      );
      if (cachedMatch == null) continue;
      const [, cachedTopic] = cachedMatch;
      nextTopics.set(
        authoritativeKey,
        mergeCachedTopicPreviewIntoAuthoritativeTopic(cachedTopic, authoritativeTopic),
      );
    }

    nextStreams.set(streamUuid, {
      ...authoritativeStream,
      ...(cachedStream.ts >= authoritativeStream.ts
        ? {
            lastMessage: cachedStream.lastMessage,
            lastMessageSenderName: cachedStream.lastMessageSenderName,
            time: cachedStream.time,
            ts: cachedStream.ts,
          }
        : {}),
      topics: nextTopics,
    });
  }
  return nextStreams;
}

/** Normalizes DM participant ids; injects current user for metadata-only 1:1 rows. */
export function normalizeDmUserIds(
  userIds: readonly UserId[],
  currentUserId: UserId | null,
): UserId[] {
  const uniqueByKey = new Map<string, UserId>();
  for (const userId of userIds) {
    if (!isUserIdentityReady(userId)) continue;
    uniqueByKey.set(userIdStorageKey(userId), userId);
  }
  const uniqueSorted = Array.from(uniqueByKey.values()).sort(compareUserIds);
  if (
    currentUserId != null &&
    isUserIdentityReady(currentUserId) &&
    uniqueSorted.length === 1 &&
    uniqueSorted[0] != null &&
    !userIdsEqual(uniqueSorted[0], currentUserId)
  ) {
    return [currentUserId, uniqueSorted[0]].sort(compareUserIds);
  }
  return uniqueSorted;
}

function metadataOnlySyntheticDmId(row: ChatListDmMetadataRow): number {
  return SYNTHETIC_DM_ID_OFFSET + hashKey(row.streamUuid ?? row.userUuid ?? row.name ?? "dm");
}

/** Builds or merges a metadata-only DM sidebar row (register / DM index bootstrap). */
export function buildDmMetadataEntry(
  row: ChatListDmMetadataRow,
  currentUserId: UserId | null,
  existing: DmEntryInternal | undefined,
  display: ChatListDmBootstrapDisplayContext,
): { key: string; entry: DmEntryInternal } | null {
  const userIds = normalizeDmUserIds(row.userIds, currentUserId);
  if (userIds.length === 0 && row.streamUuid == null && row.userUuid == null) return null;
  const key =
    row.streamUuid != null ? `stream:${row.streamUuid}` : userIds.map(userIdStorageKey).join(",");
  const participants =
    currentUserId != null
      ? userIds.filter((userId) => !userIdsEqual(userId, currentUserId))
      : userIds;
  const ts = Math.max(existing?.ts ?? 0, row.lastActivityTs ?? 0);
  const time = ts > 0 ? formatMessageTime(ts) : (existing?.time ?? "");
  const lastMessageId = row.lastMessageId ?? existing?.lastMessageId;
  const unreadCount = row.unreadCount ?? existing?.unreadCount ?? 0;
  const hasTooManyKnownPeers =
    currentUserId != null ? participants.length > 1 : participants.length > 2;

  if (userIds.length === 0) {
    const trimmedName = row.name?.trim();
    const name =
      trimmedName != null && trimmedName.length > 0 ? trimmedName : display.dmFallbackLabel;
    return {
      key,
      entry: {
        id: metadataOnlySyntheticDmId(row),
        name,
        slug: row.streamUuid ?? row.userUuid ?? String(metadataOnlySyntheticDmId(row)),
        lastMessage: existing?.lastMessage ?? "",
        time,
        ts,
        ...(row.streamUuid != null ? { streamUuid: row.streamUuid } : {}),
        ...(row.userUuid != null ? { userUuid: row.userUuid } : {}),
        unreadCount,
        avatar_url: existing?.avatar_url,
        lastMessageId,
      },
    };
  }

  if (hasTooManyKnownPeers) {
    return null;
  }

  const partnerId = participants[0] ?? userIds[0];
  if (partnerId == null) return null;
  const trimmedName = row.name?.trim();
  const name =
    trimmedName != null && trimmedName.length > 0
      ? trimmedName
      : display.getParticipantDisplayName(partnerId);
  const numericPartnerId = numericUserIdOrNull(partnerId);
  const entryId = numericPartnerId ?? metadataOnlySyntheticDmId(row);
  return {
    key,
    entry: {
      id: entryId,
      name,
      slug: row.streamUuid ?? `${userIdStorageKey(partnerId)}-${slugify(name)}`,
      lastMessage: existing?.lastMessage ?? "",
      time,
      ts,
      userIds,
      ...(row.streamUuid != null ? { streamUuid: row.streamUuid } : {}),
      ...(row.userUuid != null ? { userUuid: row.userUuid } : {}),
      unreadCount,
      avatar_url: display.getAvatarUrl(partnerId) ?? existing?.avatar_url,
      lastMessageId,
    },
  };
}

export interface ChatListDmMetadataUpsertPatch {
  dmsMap: Map<string, DmEntryInternal>;
  changed: true;
}

/** Pure upsert for metadata-only DM rows; returns null when maps are unchanged. */
export function buildDmMetadataUpsertPatch(
  rows: readonly ChatListDmMetadataRow[],
  currentUserId: UserId | null,
  existingDmsMap: Map<string, DmEntryInternal>,
  display: ChatListDmBootstrapDisplayContext,
): ChatListDmMetadataUpsertPatch | null {
  if (rows.length === 0) return null;

  let changed = false;
  let nextDms = existingDmsMap;

  for (const row of rows) {
    const normalized = buildDmMetadataEntry(row, currentUserId, undefined, display);
    if (normalized == null) continue;
    const existing = nextDms.get(normalized.key);
    const merged = buildDmMetadataEntry(row, currentUserId, existing, display);
    if (merged == null) continue;
    if (!changed) nextDms = new Map(nextDms);
    changed = true;
    nextDms.set(merged.key, merged.entry);
  }

  if (!changed) return null;
  return { dmsMap: nextDms, changed: true };
}

/** Rebuilds metadata rows from in-memory DM map (late currentUserId bootstrap). */
export function buildDmMetadataRowsFromDmsMap(
  dmsMap: Map<string, DmEntryInternal>,
): ChatListDmMetadataRow[] {
  return Array.from(dmsMap.values()).map((entry) => ({
    userIds: entry.userIds ?? [entry.id],
    name: entry.name,
    ...(entry.streamUuid != null ? { streamUuid: entry.streamUuid } : {}),
    ...(entry.userUuid != null ? { userUuid: entry.userUuid } : {}),
    lastActivityTs: entry.ts,
    lastMessageId: entry.lastMessageId ?? null,
    unreadCount: entry.unreadCount,
  }));
}

export interface SetFromMessagesBootstrapState {
  streamsMap: Map<string, StreamEntryInternal>;
  dmsMap: Map<string, DmEntryInternal>;
  sidebarDataHydrated: true;
  currentUserId: UserId | null;
  lastAppliedMessages: WorkspaceRawMessage[];
  messageIdToLocation: Map<MessageId, MessageLocation>;
  bootstrapError: null;
}

/** Builds store fields for full sidebar rebuild from a message history batch. */
export function buildSetFromMessagesBootstrapState(
  messages: WorkspaceRawMessage[],
  currentUserId: UserId | null,
  previousStreamsMap: Map<string, StreamEntryInternal>,
  avatarMap: Map<number, string | undefined>,
): SetFromMessagesBootstrapState {
  const avatarUrlByUserId = new Map<number, string>();
  for (const [userId, url] of avatarMap) {
    if (url != null) {
      avatarUrlByUserId.set(userId, url);
    }
  }
  const { streamsMap: rebuiltStreams, dmsMap } = buildSidebarFromMessages(
    messages,
    currentUserId,
    avatarUrlByUserId,
  );
  const streamsMap = mergeBootstrapStreamsWithPreviousMetadata(rebuiltStreams, previousStreamsMap);
  return {
    streamsMap,
    dmsMap,
    sidebarDataHydrated: true,
    currentUserId,
    lastAppliedMessages: messages,
    messageIdToLocation: buildMessageIdToLocation(messages, currentUserId),
    bootstrapError: null,
  };
}

export interface ChatListHydrateFromSnapshotState {
  streamsMap: Map<string, StreamEntryInternal>;
  dmsMap: Map<string, DmEntryInternal>;
  sidebarDataHydrated: boolean;
  streamMetadataHydrated: false;
  messageIdToLocation: Map<MessageId, MessageLocation>;
  currentUserId: UserId | null;
  lastAppliedMessages: null;
}

/** Deserializes IndexedDB snapshot into chat-list bootstrap state fields. */
export function buildChatListHydrateFromSnapshotState(
  snapshot: ChatListSnapshotSerialized,
  fallbackCurrentUserId: UserId | null,
): ChatListHydrateFromSnapshotState {
  const streamsMap = new Map<string, StreamEntryInternal>();
  for (const [id, s] of snapshot.streamsEntries) {
    streamsMap.set(id, deserializeStreamEntry(s));
  }
  const dmsMap = new Map(snapshot.dmsEntries);
  const messageIdToLocation = new Map<MessageId, MessageLocation>(
    snapshot.messageIdToLocationEntries as [MessageId, MessageLocation][],
  );
  return {
    streamsMap,
    dmsMap,
    sidebarDataHydrated: streamsMap.size > 0 || dmsMap.size > 0,
    streamMetadataHydrated: false,
    messageIdToLocation,
    currentUserId: snapshot.currentUserId ?? fallbackCurrentUserId,
    lastAppliedMessages: null,
  };
}
