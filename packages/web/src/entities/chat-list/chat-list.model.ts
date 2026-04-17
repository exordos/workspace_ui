// Zustand-store chat-list: формирует и обновляет sidebar-проекцию стримов/DM и unread-счетчики.
/**
 * Chat list store — manages sidebar chat entries (streams, DMs, topics).
 *
 * Built from raw Zulip messages; incrementally updated via real-time events.
 * Tracks unread counts per topic/DM and a message-to-location index for flag/delete handling.
 */
import { create } from "zustand";
import { useUsersStore } from "~/entities/user/user.model";
import { t } from "~/i18n/i18n";
import type { ZulipRawMessage } from "~/shared/api/zulip.types";
import {
  deserializeStreamEntry,
  type ChatListSnapshotSerialized,
} from "~/shared/lib/chat-list-snapshot-serialize.lib";
import { dmConversationKey } from "~/shared/lib/dm-key";
import {
  logChatListFlow,
  summarizeZulipMessagesForFlowDebug,
} from "~/shared/lib/message-flow-debug.lib";
import { saveRecentDmPartners } from "~/shared/lib/recent-dms";
import { areGroupSettingValuesEqual } from "~/shared/lib/zulip-group-setting.lib";
import type {
  SidebarChat,
  StreamWithLast,
  StreamEntryInternal,
  DmEntryInternal,
} from "~/shared/types/sidebar-chat";
import {
  formatMessageTime,
  GROUP_DM_ID_OFFSET,
  getDmPartnerName,
  hashKey,
  resolvePersonalDmSidebarTitle,
  slugify,
} from "./chat-list-format.lib";
import {
  buildSidebarFromMessages,
  messageToStreamEntry,
  messageToDmEntry,
  isUnreadFromOthers,
} from "./chat-list.lib";
import type {
  ChatListDmMetadataRow,
  ChatListState,
  ChatListStreamMetadataRow,
  MessageLocation,
} from "./chat-list.model.types";

function streamsMapToSortedStreams(streamsMap: Map<number, StreamEntryInternal>): StreamWithLast[] {
  return Array.from(streamsMap.values())
    .sort((a, b) => b.ts - a.ts)
    .map((s) => {
      const topics = Array.from(s.topics.values())
        .sort((a, b) => b.ts - a.ts)
        .map((t) => ({
          subject: t.subject,
          lastMessage: t.lastMessage,
          lastMessageSenderName: t.lastMessageSenderName,
          time: t.time,
          badge: t.unreadCount > 0 ? t.unreadCount : undefined,
        }));
      const badge = topics.reduce((sum, t) => sum + (t.badge ?? 0), 0);
      return {
        stream_id: s.stream_id,
        name: s.name,
        lastMessage: s.lastMessage,
        lastMessageSenderName: s.lastMessageSenderName,
        time: s.time,
        topics,
        badge: badge > 0 ? badge : undefined,
      };
    });
}

function dmsMapToSortedDms(
  map: Map<string, DmEntryInternal>,
): Extract<SidebarChat, { type: "dm" }>[] {
  return Array.from(map.values())
    .sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0))
    .map((x) => ({
      type: "dm" as const,
      id: x.id,
      name: x.name,
      slug: x.slug,
      isGroup: x.isGroup,
      lastMessage: x.lastMessage,
      time: x.time,
      userIds: x.userIds,
      badge: x.unreadCount > 0 ? x.unreadCount : undefined,
      avatar_url: x.avatar_url,
      ts: x.ts,
    }));
}

function mergeStreamEntry(
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
  topicUnreadDelta: number,
  lastMessageId?: number,
): StreamEntryInternal {
  const existingTopic = existing?.topics.get(topicSubject);
  const unreadCount = (existingTopic?.unreadCount ?? 0) + topicUnreadDelta;
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
    const topics = new Map<
      string,
      {
        subject: string;
        lastMessage: string;
        lastMessageSenderName?: string;
        time: string;
        ts: number;
        unreadCount: number;
        lastMessageId?: number;
      }
    >();
    topics.set(topicSubject, topicEntry);
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
    // Что делает: сохраняет channel-level metadata из подписок при приходе новых сообщений.
    // Сообщения не должны затирать permission-поля канала.
    creatorId: existing.creatorId,
    inviteOnly: existing.inviteOnly,
    canAddSubscribersGroup: existing.canAddSubscribersGroup,
    canRemoveSubscribersGroup: existing.canRemoveSubscribersGroup,
    canAdministerChannelGroup: existing.canAdministerChannelGroup,
    topics: nextTopics,
  };
}

const emptyStreamsMap = () => new Map<number, StreamEntryInternal>();
const emptyDmsMap = () => new Map<string, DmEntryInternal>();

// Referential-identity caches: recompute only when the underlying Map reference changes.
let _cachedStreams: StreamWithLast[] | null = null;
let _cachedStreamsMapRef: Map<number, StreamEntryInternal> | null = null;

let _cachedDms: Extract<SidebarChat, { type: "dm" }>[] | null = null;
let _cachedDmsMapRef: Map<string, DmEntryInternal> | null = null;

function getAvatarMap() {
  return useUsersStore.getState().getAvatarMap();
}

// Что делает: сохраняет список последних личных DM-партнеров для быстрого доступа в UI.
function persistRecentDmPartnersFromMap(map: Map<string, DmEntryInternal>): void {
  const partnerIds = Array.from(map.values())
    .filter((dm) => !dm.isGroup)
    .sort((left, right) => (right.ts ?? 0) - (left.ts ?? 0))
    .map((dm) => dm.id)
    .slice(0, 50);
  saveRecentDmPartners(partnerIds);
}

// Что делает: нормализует набор участников DM и при необходимости добавляет currentUser для 1:1 ключа.
function normalizeDmUserIds(userIds: readonly number[], currentUserId: number | null): number[] {
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

// Что делает: получает понятное имя участника DM, даже если профиль еще не полностью загружен.
function getDmParticipantDisplayName(userId: number): string {
  const usersStore = useUsersStore.getState();
  const displayName = usersStore.getDisplayName(userId);
  if (displayName !== "Unknown") {
    return displayName;
  }
  const user = usersStore.getUser(userId);
  return getDmPartnerName({
    id: userId,
    full_name: user?.full_name,
    email: user?.email,
  });
}

// Зачем: строит/обновляет DM-строку из metadata, чтобы диалог отображался даже без сообщений в памяти.
function buildDmMetadataEntry(
  row: ChatListDmMetadataRow,
  currentUserId: number | null,
  existing: DmEntryInternal | undefined,
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
    // Что делает: для группового DM создаем стабильный synthetic id и читаемое имя участников.
    const names = participants.map((userId) => getDmParticipantDisplayName(userId));
    const groupName =
      names.filter((name) => name.trim().length > 0).join(", ") || t("dm.groupChat");
    const slug = userIds
      .map((userId) => `${userId}-${slugify(getDmParticipantDisplayName(userId))}`)
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
  const name = getDmParticipantDisplayName(partnerId);
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
      avatar_url: useUsersStore.getState().getAvatarUrl(partnerId) ?? existing?.avatar_url,
      lastMessageId,
    },
  };
}

// Что делает: создает/обновляет строку канала из metadata, не трогая историю сообщений.
function buildStreamMetadataEntry(
  row: ChatListStreamMetadataRow,
  existing: StreamEntryInternal | undefined,
): StreamEntryInternal {
  const name = row.name.trim();
  const creatorId = row.creatorId ?? existing?.creatorId;
  const inviteOnly = row.inviteOnly ?? existing?.inviteOnly;
  const canAddSubscribersGroup = row.canAddSubscribersGroup ?? existing?.canAddSubscribersGroup;
  const canRemoveSubscribersGroup =
    row.canRemoveSubscribersGroup ?? existing?.canRemoveSubscribersGroup;
  const canAdministerChannelGroup =
    row.canAdministerChannelGroup ?? existing?.canAdministerChannelGroup;
  if (existing) {
    return {
      ...existing,
      name: name.length > 0 ? name : existing.name,
      ...(creatorId != null ? { creatorId } : {}),
      ...(inviteOnly != null ? { inviteOnly } : {}),
      ...(canAddSubscribersGroup != null ? { canAddSubscribersGroup } : {}),
      ...(canRemoveSubscribersGroup != null ? { canRemoveSubscribersGroup } : {}),
      ...(canAdministerChannelGroup != null ? { canAdministerChannelGroup } : {}),
    };
  }
  return {
    stream_id: row.streamId,
    name: name.length > 0 ? name : String(row.streamId),
    lastMessage: "",
    lastMessageSenderName: undefined,
    time: "",
    ts: 0,
    ...(creatorId != null ? { creatorId } : {}),
    ...(inviteOnly != null ? { inviteOnly } : {}),
    ...(canAddSubscribersGroup != null ? { canAddSubscribersGroup } : {}),
    ...(canRemoveSubscribersGroup != null ? { canRemoveSubscribersGroup } : {}),
    ...(canAdministerChannelGroup != null ? { canAdministerChannelGroup } : {}),
    topics: new Map(),
  };
}

// Что делает: определяет, изменились ли permission-связанные поля metadata канала.
// Нужно, чтобы не триггерить лишние state-апдейты при неизменных данных.
function hasStreamMetadataAccessChanged(
  existing: StreamEntryInternal,
  nextEntry: StreamEntryInternal,
): boolean {
  if (existing.creatorId !== nextEntry.creatorId) {
    return true;
  }
  if (existing.inviteOnly !== nextEntry.inviteOnly) {
    return true;
  }
  if (
    !areGroupSettingValuesEqual(existing.canAddSubscribersGroup, nextEntry.canAddSubscribersGroup)
  ) {
    return true;
  }
  if (
    !areGroupSettingValuesEqual(
      existing.canRemoveSubscribersGroup,
      nextEntry.canRemoveSubscribersGroup,
    )
  ) {
    return true;
  }
  if (
    !areGroupSettingValuesEqual(
      existing.canAdministerChannelGroup,
      nextEntry.canAdministerChannelGroup,
    )
  ) {
    return true;
  }
  return false;
}

function buildMessageIdToLocation(
  messages: ZulipRawMessage[],
  currentUserId: number | null,
): Map<number, MessageLocation> {
  const map = new Map<number, MessageLocation>();
  for (const m of messages) {
    if (m.type === "stream" && m.stream_id != null) {
      const topic = (m.subject ?? "").trim() || "general";
      map.set(m.id, { type: "stream", stream_id: m.stream_id, topic });
    } else if (m.type === "private" && Array.isArray(m.display_recipient)) {
      const dmKey = dmConversationKey(m.display_recipient, currentUserId);
      map.set(m.id, { type: "dm", dmKey });
    }
  }
  return map;
}

export const useChatListStore = create<ChatListState>((set, get) => ({
  streamsMap: emptyStreamsMap(),
  dmsMap: emptyDmsMap(),
  currentUserId: null,
  lastAppliedMessages: null,
  messageIdToLocation: new Map(),

  setFromMessages(messages, currentUserId) {
    const effectiveUserId = currentUserId ?? get().currentUserId;
    const avatarMap = getAvatarMap();
    const { streamsMap, dmsMap } = buildSidebarFromMessages(messages, effectiveUserId, avatarMap);
    const messageIdToLocation = buildMessageIdToLocation(messages, effectiveUserId);
    logChatListFlow("store: setFromMessages (full rebuild from messages)", {
      ...summarizeZulipMessagesForFlowDebug(messages),
      currentUserId: effectiveUserId,
      streamsMapSize: streamsMap.size,
      dmsMapSize: dmsMap.size,
      messageIdToLocationSize: messageIdToLocation.size,
    });
    set({
      streamsMap,
      dmsMap,
      currentUserId: effectiveUserId,
      lastAppliedMessages: messages,
      messageIdToLocation,
    });
    persistRecentDmPartnersFromMap(dmsMap);
  },

  hydrateFromIndexedDbSnapshot(snapshot: ChatListSnapshotSerialized) {
    const streamsMap = new Map<number, StreamEntryInternal>();
    for (const [id, s] of snapshot.streamsEntries) {
      streamsMap.set(id, deserializeStreamEntry(s));
    }
    const dmsMap = new Map(snapshot.dmsEntries);
    const messageIdToLocation = new Map<number, MessageLocation>(
      snapshot.messageIdToLocationEntries as [number, MessageLocation][],
    );
    _cachedStreams = null;
    _cachedStreamsMapRef = null;
    _cachedDms = null;
    _cachedDmsMapRef = null;
    set({
      streamsMap,
      dmsMap,
      messageIdToLocation,
      currentUserId: snapshot.currentUserId ?? get().currentUserId,
      lastAppliedMessages: null,
    });
    logChatListFlow("store: hydrateFromIndexedDbSnapshot", {
      streamsMapSize: streamsMap.size,
      dmsMapSize: dmsMap.size,
      messageIdToLocationSize: messageIdToLocation.size,
      lastMessageId: snapshot.lastMessageId,
      currentUserId: snapshot.currentUserId ?? get().currentUserId,
    });
    persistRecentDmPartnersFromMap(dmsMap);
  },

  addMessage(message) {
    const { type } = message;
    const currentUserId = get().currentUserId;

    if (type === "stream" && message.stream_id != null) {
      const result = messageToStreamEntry(message);
      if (!result) return;
      const { stream_id, name, lastMessage, lastMessageSenderName, time, ts } = result.stream;
      const topic = result.topic;
      const topicUnreadDelta = isUnreadFromOthers(message, currentUserId) ? 1 : 0;
      set((state) => {
        const existing = state.streamsMap.get(stream_id);
        if (existing && message.timestamp <= existing.ts) {
          const existingTopic = existing.topics.get(topic.subject);
          if (existingTopic && message.timestamp <= existingTopic.ts) {
            const next = new Map(state.streamsMap);
            const nextTopics = new Map(existing.topics);
            nextTopics.set(topic.subject, {
              ...existingTopic,
              unreadCount: existingTopic.unreadCount + topicUnreadDelta,
            });
            next.set(stream_id, { ...existing, topics: nextTopics });
            return { streamsMap: next };
          }
        }
        const next = new Map(state.streamsMap);
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
          topicUnreadDelta,
          message.id,
        );
        next.set(stream_id, merged);
        return {
          streamsMap: next,
          messageIdToLocation: new Map(state.messageIdToLocation).set(message.id, {
            type: "stream",
            stream_id,
            topic: topic.subject,
          }),
        };
      });
      return;
    }

    if (type === "private" && Array.isArray(message.display_recipient)) {
      const dmEntry = messageToDmEntry(message, currentUserId, getAvatarMap());
      if (!dmEntry) return;
      const key = dmConversationKey(message.display_recipient, currentUserId);
      const unreadDelta = isUnreadFromOthers(message, currentUserId) ? 1 : 0;
      set((state) => {
        const existing = state.dmsMap.get(key);
        if (existing && message.timestamp <= existing.ts) {
          if (unreadDelta === 0) return state;
          const next = new Map(state.dmsMap);
          next.set(key, { ...existing, unreadCount: existing.unreadCount + unreadDelta });
          return { dmsMap: next };
        }
        const next = new Map(state.dmsMap);
        const avatar_url = dmEntry.avatar_url ?? existing?.avatar_url;
        next.set(key, {
          ...dmEntry,
          unreadCount: (existing?.unreadCount ?? 0) + unreadDelta,
          avatar_url,
          lastMessageId: message.id,
        });
        const nextLoc = new Map(state.messageIdToLocation);
        nextLoc.set(message.id, { type: "dm", dmKey: key });
        return { dmsMap: next, messageIdToLocation: nextLoc };
      });
      persistRecentDmPartnersFromMap(get().dmsMap);
    }
  },

  addMessages(messages) {
    logChatListFlow("store: addMessages (merge batch)", {
      ...summarizeZulipMessagesForFlowDebug(messages),
      rawCount: messages.length,
      currentUserId: get().currentUserId,
      streamsMapSizeBefore: get().streamsMap.size,
      dmsMapSizeBefore: get().dmsMap.size,
    });
    const currentUserId = get().currentUserId;
    const streamByKey = new Map<number, ZulipRawMessage>();
    const dmByKey = new Map<string, ZulipRawMessage>();

    for (const m of messages) {
      if (m.type === "stream" && m.stream_id != null) {
        const existing = streamByKey.get(m.stream_id);
        if (!existing || m.timestamp >= existing.timestamp) {
          streamByKey.set(m.stream_id, m);
        }
      } else if (m.type === "private" && Array.isArray(m.display_recipient)) {
        const key = dmConversationKey(m.display_recipient, currentUserId);
        const existing = dmByKey.get(key);
        if (!existing || m.timestamp >= existing.timestamp) {
          dmByKey.set(key, m);
        }
      }
    }

    set((state) => {
      let nextStreams = state.streamsMap;
      let nextDms = state.dmsMap;
      const nextLoc = new Map(state.messageIdToLocation);

      for (const m of streamByKey.values()) {
        if (m.stream_id != null) {
          const topic = (m.subject ?? "").trim() || "general";
          nextLoc.set(m.id, { type: "stream", stream_id: m.stream_id, topic });
        }
      }
      for (const m of dmByKey.values()) {
        if (Array.isArray(m.display_recipient)) {
          const key = dmConversationKey(m.display_recipient, currentUserId);
          nextLoc.set(m.id, { type: "dm", dmKey: key });
        }
      }

      for (const m of streamByKey.values()) {
        const result = messageToStreamEntry(m);
        if (!result) continue;
        const { stream_id, name, lastMessage, lastMessageSenderName, time, ts } = result.stream;
        const topic = result.topic;
        const topicUnreadDelta = isUnreadFromOthers(m, currentUserId) ? 1 : 0;
        const existing = nextStreams.get(stream_id);
        if (existing && m.timestamp <= existing.ts) {
          const existingTopic = existing.topics.get(topic.subject);
          if (existingTopic && m.timestamp <= existingTopic.ts) {
            nextStreams = new Map(nextStreams);
            const nextTopics = new Map(existing.topics);
            nextTopics.set(topic.subject, {
              ...existingTopic,
              unreadCount: existingTopic.unreadCount + topicUnreadDelta,
            });
            nextStreams.set(stream_id, { ...existing, topics: nextTopics });
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
          topicUnreadDelta,
          m.id,
        );
        nextStreams.set(stream_id, merged);
      }

      for (const m of dmByKey.values()) {
        const dmEntry = messageToDmEntry(m, currentUserId, getAvatarMap());
        if (!dmEntry) continue;
        if (!Array.isArray(m.display_recipient)) continue;
        const key = dmConversationKey(m.display_recipient, currentUserId);
        const existing = nextDms.get(key);
        const unreadDelta = isUnreadFromOthers(m, currentUserId) ? 1 : 0;
        if (existing && dmEntry.ts <= existing.ts) {
          if (unreadDelta > 0) {
            nextDms = new Map(nextDms);
            nextDms.set(key, { ...existing, unreadCount: existing.unreadCount + unreadDelta });
          }
          continue;
        }
        nextDms = new Map(nextDms);
        const avatar_url = dmEntry.avatar_url ?? existing?.avatar_url;
        nextDms.set(key, {
          ...dmEntry,
          unreadCount: (existing?.unreadCount ?? 0) + unreadDelta,
          avatar_url,
          lastMessageId: m.id,
        });
      }

      return { streamsMap: nextStreams, dmsMap: nextDms, messageIdToLocation: nextLoc };
    });
    persistRecentDmPartnersFromMap(get().dmsMap);
    logChatListFlow("store: addMessages (done)", {
      streamsMapSizeAfter: get().streamsMap.size,
      dmsMapSizeAfter: get().dmsMap.size,
    });
  },

  upsertStreamMetadataRows(rows) {
    if (rows.length === 0) return;
    logChatListFlow("store: upsertStreamMetadataRows", { rowCount: rows.length });
    set((state) => {
      let changed = false;
      let nextStreams = state.streamsMap;
      for (const row of rows) {
        if (!Number.isInteger(row.streamId) || row.streamId <= 0) continue;
        const existing = nextStreams.get(row.streamId);
        const nextEntry = buildStreamMetadataEntry(row, existing);
        if (existing === undefined) {
          // Что делает: добавляем канал даже если в текущем message-window нет сообщений этого канала.
          if (!changed) nextStreams = new Map(nextStreams);
          changed = true;
          nextStreams.set(row.streamId, nextEntry);
          continue;
        }
        if (existing.name !== nextEntry.name) {
          if (!changed) nextStreams = new Map(nextStreams);
          changed = true;
          nextStreams.set(row.streamId, nextEntry);
          continue;
        }
        if (hasStreamMetadataAccessChanged(existing, nextEntry)) {
          if (!changed) nextStreams = new Map(nextStreams);
          changed = true;
          nextStreams.set(row.streamId, nextEntry);
        }
      }
      if (!changed) return state;
      return { streamsMap: nextStreams };
    });
  },

  upsertDmMetadataRows(rows) {
    if (rows.length === 0) return;
    logChatListFlow("store: upsertDmMetadataRows", { rowCount: rows.length });
    const currentUserId = get().currentUserId;
    set((state) => {
      let changed = false;
      let nextDms = state.dmsMap;
      for (const row of rows) {
        const normalized = buildDmMetadataEntry(row, currentUserId, undefined);
        if (normalized == null) continue;
        const existing = nextDms.get(normalized.key);
        // Что делает: повторно собираем строку с existing, чтобы аккуратно слить unread/ts/lastMessageId.
        const merged = buildDmMetadataEntry(row, currentUserId, existing);
        if (merged == null) continue;
        if (!changed) nextDms = new Map(nextDms);
        changed = true;
        nextDms.set(merged.key, merged.entry);
      }
      if (!changed) return state;
      return { dmsMap: nextDms };
    });
    persistRecentDmPartnersFromMap(get().dmsMap);
  },

  setCurrentUserId(id) {
    const prev = get().currentUserId;
    set({ currentUserId: id });
    // Зачем: если user id пришел позже, пересобираем DM-ключи и заголовки, чтобы убрать кривые имена/ключи.
    if (prev === null && id != null) {
      const { lastAppliedMessages, dmsMap } = get();
      if (lastAppliedMessages != null && lastAppliedMessages.length > 0) {
        get().setFromMessages(lastAppliedMessages, id);
        return;
      }
      if (dmsMap.size > 0) {
        // Что делает: когда есть только metadata-DM, мягко пересобираем их с уже известным currentUserId.
        get().upsertDmMetadataRows(
          Array.from(dmsMap.values()).map((entry) => ({
            userIds: entry.userIds ?? [entry.id],
            lastActivityTs: entry.ts,
            lastMessageId: entry.lastMessageId ?? null,
            unreadCount: entry.unreadCount,
          })),
        );
      }
    }
  },

  renameStream(streamId, nextName) {
    const trimmedName = nextName.trim();
    if (trimmedName.length === 0) return;
    set((state) => {
      const existing = state.streamsMap.get(streamId);
      if (!existing) return state;
      const nextStreams = new Map(state.streamsMap);
      nextStreams.set(streamId, { ...existing, name: trimmedName });
      return { streamsMap: nextStreams };
    });
  },

  patchPersonalDmRowLabelsForUser(userId) {
    if (!Number.isFinite(userId) || userId <= 0) return;
    const users = useUsersStore.getState();
    const storeDisplayName = users.getDisplayName(userId);
    if (storeDisplayName === "Unknown") return;
    const userFullName = users.getUser(userId)?.full_name;
    set((state) => {
      let changed = false;
      const next = new Map(state.dmsMap);
      for (const [key, entry] of next) {
        if (entry.isGroup || entry.id !== userId) continue;
        const resolved = resolvePersonalDmSidebarTitle({
          chatName: entry.name,
          userFullName,
          storeDisplayName,
        });
        if (resolved !== entry.name) {
          next.set(key, { ...entry, name: resolved });
          changed = true;
        }
      }
      if (!changed) return state;
      _cachedDms = null;
      _cachedDmsMapRef = null;
      return { dmsMap: next };
    });
  },

  removeStream(streamId) {
    set((state) => {
      if (!state.streamsMap.has(streamId)) return state;
      const nextStreams = new Map(state.streamsMap);
      nextStreams.delete(streamId);

      const nextMessageLocations = new Map(state.messageIdToLocation);
      for (const [messageId, location] of nextMessageLocations.entries()) {
        if (location.type === "stream" && location.stream_id === streamId) {
          nextMessageLocations.delete(messageId);
        }
      }

      const nextLastAppliedMessages =
        state.lastAppliedMessages?.filter((message) => message.stream_id !== streamId) ?? null;

      return {
        streamsMap: nextStreams,
        messageIdToLocation: nextMessageLocations,
        lastAppliedMessages: nextLastAppliedMessages,
      };
    });
  },

  clear() {
    logChatListFlow("store: clear", {});
    _cachedStreams = null;
    _cachedStreamsMapRef = null;
    _cachedDms = null;
    _cachedDmsMapRef = null;
    set({
      streamsMap: emptyStreamsMap(),
      dmsMap: emptyDmsMap(),
      currentUserId: null,
      lastAppliedMessages: null,
      messageIdToLocation: new Map(),
    });
  },

  decrementUnreadForMessages(messageIds) {
    if (messageIds.length === 0) return;
    set((state) => {
      const locMap = state.messageIdToLocation;
      let nextStreams = state.streamsMap;
      let nextDms = state.dmsMap;
      const nextLoc = new Map(locMap);
      for (const mid of messageIds) {
        const loc = locMap.get(mid);
        if (!loc) continue;
        nextLoc.delete(mid);
        if (loc.type === "stream") {
          const stream = nextStreams.get(loc.stream_id);
          if (!stream) continue;
          const topic = stream.topics.get(loc.topic);
          if (!topic || topic.unreadCount <= 0) continue;
          nextStreams = new Map(nextStreams);
          const nextTopics = new Map(stream.topics);
          nextTopics.set(loc.topic, { ...topic, unreadCount: Math.max(0, topic.unreadCount - 1) });
          nextStreams.set(loc.stream_id, { ...stream, topics: nextTopics });
        } else {
          const dm = nextDms.get(loc.dmKey);
          if (!dm || dm.unreadCount <= 0) continue;
          nextDms = new Map(nextDms);
          nextDms.set(loc.dmKey, { ...dm, unreadCount: Math.max(0, dm.unreadCount - 1) });
        }
      }
      return { streamsMap: nextStreams, dmsMap: nextDms, messageIdToLocation: nextLoc };
    });
  },

  decrementUnreadForTopic(streamId, topic, count) {
    if (!Number.isFinite(count) || count <= 0) return;
    const topicKey = topic.trim() || "general";
    set((state) => {
      const stream = state.streamsMap.get(streamId);
      const streamTopic = stream?.topics.get(topicKey);
      if (!stream || !streamTopic || streamTopic.unreadCount <= 0) return state;
      const nextStreams = new Map(state.streamsMap);
      const nextTopics = new Map(stream.topics);
      nextTopics.set(topicKey, {
        ...streamTopic,
        unreadCount: Math.max(0, streamTopic.unreadCount - count),
      });
      nextStreams.set(streamId, { ...stream, topics: nextTopics });
      return { streamsMap: nextStreams };
    });
  },

  decrementUnreadForDmKey(dmKey, count) {
    if (!Number.isFinite(count) || count <= 0) return;
    const key = dmKey.trim();
    if (key.length === 0) return;
    set((state) => {
      const dm = state.dmsMap.get(key);
      if (!dm || dm.unreadCount <= 0) return state;
      const nextDms = new Map(state.dmsMap);
      nextDms.set(key, { ...dm, unreadCount: Math.max(0, dm.unreadCount - count) });
      return { dmsMap: nextDms };
    });
  },

  incrementUnreadForMessages(messageIds) {
    if (messageIds.length === 0) return;
    set((state) => {
      const locMap = state.messageIdToLocation;
      let nextStreams = state.streamsMap;
      let nextDms = state.dmsMap;
      for (const mid of messageIds) {
        const loc = locMap.get(mid);
        if (!loc) continue;
        if (loc.type === "stream") {
          const stream = nextStreams.get(loc.stream_id);
          if (!stream) continue;
          const topic = stream.topics.get(loc.topic);
          if (!topic) continue;
          nextStreams = new Map(nextStreams);
          const nextTopics = new Map(stream.topics);
          nextTopics.set(loc.topic, { ...topic, unreadCount: topic.unreadCount + 1 });
          nextStreams.set(loc.stream_id, { ...stream, topics: nextTopics });
        } else {
          const dm = nextDms.get(loc.dmKey);
          if (!dm) continue;
          nextDms = new Map(nextDms);
          nextDms.set(loc.dmKey, { ...dm, unreadCount: dm.unreadCount + 1 });
        }
      }
      return { streamsMap: nextStreams, dmsMap: nextDms };
    });
  },

  handleDeleteMessages(messageIds) {
    if (messageIds.length === 0) return;
    set((state) => {
      const locMap = state.messageIdToLocation;
      let nextStreams = state.streamsMap;
      let nextDms = state.dmsMap;
      const nextLoc = new Map(locMap);
      for (const mid of messageIds) {
        const loc = locMap.get(mid);
        if (!loc) continue;
        nextLoc.delete(mid);
        if (loc.type === "stream") {
          const stream = nextStreams.get(loc.stream_id);
          if (!stream) continue;
          const topic = stream.topics.get(loc.topic);
          if (topic?.lastMessageId !== mid) continue;
          nextStreams = new Map(nextStreams);
          const nextTopics = new Map(stream.topics);
          nextTopics.delete(loc.topic);
          if (nextTopics.size === 0) {
            nextStreams.delete(loc.stream_id);
          } else {
            const remaining = Array.from(nextTopics.values()).sort((a, b) => b.ts - a.ts);
            const newLast = remaining[0]!;
            nextStreams.set(loc.stream_id, {
              ...stream,
              topics: nextTopics,
              lastMessage: newLast.lastMessage,
              lastMessageSenderName: newLast.lastMessageSenderName,
              time: newLast.time,
              ts: newLast.ts,
            });
          }
        } else {
          const dm = nextDms.get(loc.dmKey);
          if (dm?.lastMessageId !== mid) continue;
          nextDms = new Map(nextDms);
          nextDms.delete(loc.dmKey);
        }
      }
      return { streamsMap: nextStreams, dmsMap: nextDms, messageIdToLocation: nextLoc };
    });
  },

  streams() {
    const map = get().streamsMap;
    if (map === _cachedStreamsMapRef && _cachedStreams != null) return _cachedStreams;
    _cachedStreamsMapRef = map;
    _cachedStreams = streamsMapToSortedStreams(map);
    return _cachedStreams;
  },

  dms() {
    const map = get().dmsMap;
    if (map === _cachedDmsMapRef && _cachedDms != null) return _cachedDms;
    _cachedDmsMapRef = map;
    _cachedDms = dmsMapToSortedDms(map);
    return _cachedDms;
  },
}));
