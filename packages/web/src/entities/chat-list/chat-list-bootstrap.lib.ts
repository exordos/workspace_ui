/**
 * Pure helpers for chat-list sidebar bootstrap: IndexedDB hydrate, message rebuild,
 * metadata-only DM rows, and bootstrap error state patches.
 */
import type { ZulipRawMessage } from "~/shared/api/zulip.types";
import {
  deserializeStreamEntry,
  type ChatListSnapshotSerialized,
} from "~/shared/lib/chat-list-snapshot-serialize.lib";
import { dmConversationKey } from "~/shared/lib/dm-key";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import type { DmEntryInternal, StreamEntryInternal } from "~/shared/types/sidebar-chat";
import { formatMessageTime, GROUP_DM_ID_OFFSET, hashKey, slugify } from "./chat-list-format.lib";
import { buildSidebarFromMessages, isUnreadFromOthers } from "./chat-list.lib";
import type { ChatListDmMetadataRow, MessageLocation } from "./chat-list.model.types";

export interface ChatListDmBootstrapDisplayContext {
  getParticipantDisplayName: (userId: number) => string;
  getAvatarUrl: (userId: number) => string | undefined;
  groupChatFallbackLabel: string;
}

/** Patch fragment that clears bootstrap error after a successful sidebar rebuild. */
export function clearBootstrapErrorPatch(): { bootstrapError: null } {
  return { bootstrapError: null };
}

/** Builds message id → sidebar location index from a bootstrap message batch. */
export function buildMessageIdToLocation(
  messages: readonly ZulipRawMessage[],
  currentUserId: number | null,
): Map<number, MessageLocation> {
  const map = new Map<number, MessageLocation>();
  for (const m of messages) {
    if (m.type === "stream" && m.stream_id != null) {
      const topic = normalizeTopicForIdentity(m.subject ?? "");
      map.set(m.id, { type: "stream", stream_id: m.stream_id, topic });
    } else if (m.type === "private" && Array.isArray(m.display_recipient)) {
      const dmKey = dmConversationKey(m.display_recipient, currentUserId);
      map.set(m.id, { type: "dm", dmKey });
    }
  }
  return map;
}

/** Unread-only location map for bootstrap unread reconcile from message snapshots. */
export function buildUnreadLocationMap(
  messages: readonly ZulipRawMessage[],
  currentUserId: number | null,
): Map<number, MessageLocation> {
  const map = new Map<number, MessageLocation>();
  for (const message of messages) {
    if (!isUnreadFromOthers(message, currentUserId)) continue;
    if (message.type === "stream" && message.stream_id != null) {
      const topic = normalizeTopicForIdentity(message.subject ?? "");
      map.set(message.id, { type: "stream", stream_id: message.stream_id, topic });
      continue;
    }
    if (message.type === "private" && Array.isArray(message.display_recipient)) {
      const dmKey = dmConversationKey(message.display_recipient, currentUserId);
      map.set(message.id, { type: "dm", dmKey });
    }
  }
  return map;
}

/** Preserves stream permission metadata when rebuilding sidebar from messages. */
export function mergeStreamAccessMetadata(
  stream: StreamEntryInternal,
  existing: StreamEntryInternal | undefined,
): StreamEntryInternal {
  if (existing == null) return stream;
  const hasMetadata =
    existing.isArchived != null ||
    existing.creatorId != null ||
    existing.inviteOnly != null ||
    existing.canAddSubscribersGroup != null ||
    existing.canRemoveSubscribersGroup != null ||
    existing.canAdministerChannelGroup != null ||
    existing.canResolveTopicsGroup != null ||
    existing.canMoveMessagesOutOfChannelGroup != null;
  if (!hasMetadata) return stream;
  return {
    ...stream,
    ...(existing.isArchived != null ? { isArchived: existing.isArchived } : {}),
    ...(existing.creatorId != null ? { creatorId: existing.creatorId } : {}),
    ...(existing.inviteOnly != null ? { inviteOnly: existing.inviteOnly } : {}),
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
  streamsMap: Map<number, StreamEntryInternal>,
  previousStreamsMap: Map<number, StreamEntryInternal>,
): Map<number, StreamEntryInternal> {
  if (previousStreamsMap.size === 0 || streamsMap.size === 0) {
    return streamsMap;
  }
  const next = new Map(streamsMap);
  for (const [streamId, stream] of next.entries()) {
    next.set(streamId, mergeStreamAccessMetadata(stream, previousStreamsMap.get(streamId)));
  }
  return next;
}

/** Normalizes DM participant ids; injects current user for metadata-only 1:1 rows. */
export function normalizeDmUserIds(
  userIds: readonly number[],
  currentUserId: number | null,
): number[] {
  const uniqueSorted = Array.from(
    new Set(userIds.filter((id) => Number.isInteger(id) && id > 0)),
  ).sort((left, right) => left - right);
  if (
    currentUserId != null &&
    uniqueSorted.length === 1 &&
    uniqueSorted[0] != null &&
    uniqueSorted[0] !== currentUserId
  ) {
    return [currentUserId, uniqueSorted[0]].sort((left, right) => left - right);
  }
  return uniqueSorted;
}

/** Builds or merges a metadata-only DM sidebar row (register / DM index bootstrap). */
export function buildDmMetadataEntry(
  row: ChatListDmMetadataRow,
  currentUserId: number | null,
  existing: DmEntryInternal | undefined,
  display: ChatListDmBootstrapDisplayContext,
): { key: string; entry: DmEntryInternal } | null {
  const userIds = normalizeDmUserIds(row.userIds, currentUserId);
  if (userIds.length === 0) return null;
  const key = userIds.join(",");
  const participants =
    currentUserId != null ? userIds.filter((userId) => userId !== currentUserId) : userIds;
  const ts = Math.max(existing?.ts ?? 0, row.lastActivityTs ?? 0);
  const time = ts > 0 ? formatMessageTime(ts) : (existing?.time ?? "");
  const lastMessageId = row.lastMessageId ?? existing?.lastMessageId;
  const unreadCount = row.unreadCount ?? existing?.unreadCount ?? 0;
  const isGroup = participants.length > 1;

  if (isGroup) {
    const names = participants.map((userId) => display.getParticipantDisplayName(userId));
    const groupName =
      names.filter((name) => name.trim().length > 0).join(", ") || display.groupChatFallbackLabel;
    const slug = userIds
      .map((userId) => `${userId}-${slugify(display.getParticipantDisplayName(userId))}`)
      .join(",");
    return {
      key,
      entry: {
        id: GROUP_DM_ID_OFFSET + hashKey(key),
        name: groupName,
        slug,
        isGroup: true,
        lastMessage: existing?.lastMessage ?? "",
        time,
        ts,
        userIds,
        unreadCount,
        avatar_url: existing?.avatar_url,
        lastMessageId,
      },
    };
  }

  const partnerId = participants[0] ?? userIds[0];
  if (partnerId == null) return null;
  const name = display.getParticipantDisplayName(partnerId);
  return {
    key,
    entry: {
      id: partnerId,
      name,
      slug: `${partnerId}-${slugify(name)}`,
      isGroup: false,
      lastMessage: existing?.lastMessage ?? "",
      time,
      ts,
      userIds,
      unreadCount,
      avatar_url: display.getAvatarUrl(partnerId) ?? existing?.avatar_url,
      lastMessageId,
    },
  };
}

export interface ChatListDmMetadataUpsertPatch {
  dmsMap: Map<string, DmEntryInternal>;
  sidebarDmsUnreadDelta: number;
  changed: true;
}

function mergeDmEntryForRebuild(
  current: DmEntryInternal | undefined,
  incoming: DmEntryInternal,
): DmEntryInternal {
  if (current == null) return incoming;
  const newer = incoming.ts >= current.ts ? incoming : current;
  const older = newer === incoming ? current : incoming;
  return {
    ...newer,
    lastMessage: newer.lastMessage || older.lastMessage,
    time: newer.time || older.time,
    ts: Math.max(current.ts, incoming.ts),
    unreadCount: Math.max(current.unreadCount, incoming.unreadCount),
    avatar_url: newer.avatar_url ?? older.avatar_url,
    lastMessageId: newer.lastMessageId ?? older.lastMessageId,
  };
}

export function rebuildDmMetadataMapForCurrentUser(
  dmsMap: Map<string, DmEntryInternal>,
  currentUserId: number | null,
  display: ChatListDmBootstrapDisplayContext,
): Map<string, DmEntryInternal> {
  if (currentUserId == null || dmsMap.size === 0) {
    return dmsMap;
  }

  const next = new Map<string, DmEntryInternal>();
  for (const entry of dmsMap.values()) {
    const userIds = entry.userIds ?? [entry.id];
    const normalized = normalizeDmUserIds(userIds, currentUserId);
    if (normalized.length === 0) continue;
    const key = normalized.join(",");
    const base = mergeDmEntryForRebuild(next.get(key), {
      ...entry,
      userIds: normalized,
    });
    const rebuilt = buildDmMetadataEntry(
      {
        userIds: normalized,
        lastActivityTs: base.ts,
        lastMessageId: base.lastMessageId ?? null,
        unreadCount: base.unreadCount,
      },
      currentUserId,
      base,
      display,
    );
    if (rebuilt != null) {
      next.set(rebuilt.key, rebuilt.entry);
    }
  }
  return next;
}

/** Pure upsert for metadata-only DM rows; returns null when maps are unchanged. */
export function buildDmMetadataUpsertPatch(
  rows: readonly ChatListDmMetadataRow[],
  currentUserId: number | null,
  existingDmsMap: Map<string, DmEntryInternal>,
  display: ChatListDmBootstrapDisplayContext,
): ChatListDmMetadataUpsertPatch | null {
  if (rows.length === 0) return null;

  let changed = false;
  let nextDms = existingDmsMap;
  let sidebarDmsUnreadDelta = 0;

  for (const row of rows) {
    const normalized = buildDmMetadataEntry(row, currentUserId, undefined, display);
    if (normalized == null) continue;
    const existing = nextDms.get(normalized.key);
    const merged = buildDmMetadataEntry(row, currentUserId, existing, display);
    if (merged == null) continue;
    sidebarDmsUnreadDelta += merged.entry.unreadCount - (existing?.unreadCount ?? 0);
    if (!changed) nextDms = new Map(nextDms);
    changed = true;
    nextDms.set(merged.key, merged.entry);
  }

  if (!changed) return null;
  return { dmsMap: nextDms, sidebarDmsUnreadDelta, changed: true };
}

/** Rebuilds metadata rows from in-memory DM map (late currentUserId bootstrap). */
export function buildDmMetadataRowsFromDmsMap(
  dmsMap: Map<string, DmEntryInternal>,
): ChatListDmMetadataRow[] {
  return Array.from(dmsMap.values()).map((entry) => ({
    userIds: entry.userIds ?? [entry.id],
    lastActivityTs: entry.ts,
    lastMessageId: entry.lastMessageId ?? null,
    unreadCount: entry.unreadCount,
  }));
}

export interface SetFromMessagesBootstrapState {
  streamsMap: Map<number, StreamEntryInternal>;
  dmsMap: Map<string, DmEntryInternal>;
  sidebarDataHydrated: true;
  currentUserId: number | null;
  lastAppliedMessages: ZulipRawMessage[];
  messageIdToLocation: Map<number, MessageLocation>;
  bootstrapError: null;
}

/** Builds store fields for full sidebar rebuild from a message history batch. */
export function buildSetFromMessagesBootstrapState(
  messages: ZulipRawMessage[],
  currentUserId: number | null,
  previousStreamsMap: Map<number, StreamEntryInternal>,
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
  streamsMap: Map<number, StreamEntryInternal>;
  dmsMap: Map<string, DmEntryInternal>;
  sidebarDataHydrated: boolean;
  streamMetadataHydrated: false;
  messageIdToLocation: Map<number, MessageLocation>;
  currentUserId: number | null;
  lastAppliedMessages: null;
}

/** Deserializes IndexedDB snapshot into chat-list bootstrap state fields. */
export function buildChatListHydrateFromSnapshotState(
  snapshot: ChatListSnapshotSerialized,
  fallbackCurrentUserId: number | null,
  display?: ChatListDmBootstrapDisplayContext,
): ChatListHydrateFromSnapshotState {
  const streamsMap = new Map<number, StreamEntryInternal>();
  for (const [id, s] of snapshot.streamsEntries) {
    streamsMap.set(id, deserializeStreamEntry(s));
  }
  const currentUserId = fallbackCurrentUserId ?? snapshot.currentUserId;
  const rawDmsMap = new Map(snapshot.dmsEntries);
  const dmsMap =
    display != null
      ? rebuildDmMetadataMapForCurrentUser(rawDmsMap, currentUserId, display)
      : rawDmsMap;
  const messageIdToLocation = new Map<number, MessageLocation>(
    snapshot.messageIdToLocationEntries as [number, MessageLocation][],
  );
  return {
    streamsMap,
    dmsMap,
    sidebarDataHydrated: streamsMap.size > 0 || dmsMap.size > 0,
    streamMetadataHydrated: false,
    messageIdToLocation,
    currentUserId,
    lastAppliedMessages: null,
  };
}
