import type { FolderItemForClient } from "~/shared/api/workspace-client";
import type { SidebarChat, StreamEntryInternal } from "~/shared/types/sidebar-chat";
import {
  chatToWorkspaceChatIds,
  hasMatchingChatId,
  type FolderSyncUserLike,
  parseNumericChatId,
  parseFolderItemDmUserIds,
  parseFolderItemStreamId,
  resolveFallbackUserName,
  slugifyFallbackName,
} from "./folder-sync-chat-id.lib";
import { filterHiddenDmChats } from "./folder-sync-sidebar-chats-dm.lib";
import type { SelectedFolderSidebarProjectionInput } from "./folder-sync-sidebar-chats.lib";

// Зачем: legacy numeric chat_id могут конфликтовать между stream и dm, нужен явный приоритет.
// Что делает: извлекает числового DM-кандидата для дедупликации неоднозначных numeric id.
export function resolveDmNumericCandidate(
  dmUserIds: readonly number[],
  currentUserId: number | null,
): number | null {
  if (dmUserIds.length === 1) {
    return dmUserIds[0] ?? null;
  }
  if (dmUserIds.length !== 2) {
    return null;
  }
  const sortedPair = [...dmUserIds].sort((left, right) => left - right);
  if (currentUserId == null) {
    return sortedPair[0] ?? null;
  }
  return sortedPair.find((id) => id !== currentUserId) ?? sortedPair[0] ?? null;
}

export interface NumericFolderItemIdSets {
  numericFolderItemIds: Set<number>;
  preferredDmNumericIds: Set<number>;
}

// Зачем: numeric id из folder items нужно отделить от DM-приоритетов для разрешения конфликтов stream/dm.
// Что делает: собирает numericFolderItemIds и preferredDmNumericIds из items и matched DM-чатов.
export function collectNumericFolderItemIdsAndPreferredDmNumericIds(
  selectedFolderItems: readonly FolderItemForClient[],
  matchedChats: readonly SidebarChat[],
  currentUserId: number | null,
): NumericFolderItemIdSets {
  const numericFolderItemIds = new Set<number>();
  const preferredDmNumericIds = new Set<number>();
  for (const item of selectedFolderItems) {
    const numericChatId = parseNumericChatId(item.chatId);
    if (numericChatId != null) {
      numericFolderItemIds.add(numericChatId);
      continue;
    }
    const dmUserIds = parseFolderItemDmUserIds(item.chatId);
    if (dmUserIds == null) {
      continue;
    }
    const dmNumericCandidate = resolveDmNumericCandidate(dmUserIds, currentUserId);
    if (dmNumericCandidate != null) {
      preferredDmNumericIds.add(dmNumericCandidate);
    }
  }
  for (const chat of matchedChats) {
    if (chat.type !== "dm" || chat.isGroup) {
      continue;
    }
    preferredDmNumericIds.add(chat.id);
  }
  return { numericFolderItemIds, preferredDmNumericIds };
}

// Зачем: при совпадении numeric id stream и dm должен остаться только DM.
// Что делает: убирает stream-чаты, чей stream_id одновременно в numeric items и DM-приоритетах.
export function filterAmbiguousNumericStreamMatches(
  matchedChats: readonly SidebarChat[],
  numericFolderItemIds: ReadonlySet<number>,
  preferredDmNumericIds: ReadonlySet<number>,
): SidebarChat[] {
  return matchedChats.filter((chat) => {
    if (chat.type !== "stream") {
      return true;
    }
    return !(numericFolderItemIds.has(chat.stream_id) && preferredDmNumericIds.has(chat.stream_id));
  });
}

export interface KnownMatchedChatKeys {
  knownMatchedStreamIds: Set<number>;
  knownMatchedDmKeys: Set<string>;
}

export function collectKnownMatchedChatKeys(
  matchedChats: readonly SidebarChat[],
  currentUserId: number | null,
): KnownMatchedChatKeys {
  const knownMatchedStreamIds = new Set<number>();
  const knownMatchedDmKeys = new Set<string>();
  for (const chat of matchedChats) {
    if (chat.type === "stream") {
      knownMatchedStreamIds.add(chat.stream_id);
      continue;
    }
    for (const chatId of chatToWorkspaceChatIds(chat, currentUserId)) {
      knownMatchedDmKeys.add(chatId);
    }
  }

  return {
    knownMatchedStreamIds,
    knownMatchedDmKeys,
  };
}

function hasMatchingSidebarChatId(
  folderChatIds: ReadonlySet<string>,
  chat: SidebarChat,
  currentUserId: number | null,
): boolean {
  return chatToWorkspaceChatIds(chat, currentUserId).some((chatId) =>
    hasMatchingChatId(folderChatIds, chatId),
  );
}

function buildSingleUserDmFallback(
  dmUserId: number,
  usersMapForChatInfo: ReadonlyMap<number, FolderSyncUserLike>,
): SidebarChat | null {
  const dmUser = usersMapForChatInfo.get(dmUserId);
  const dmName = resolveFallbackUserName(dmUser, `User ${dmUserId}`);
  return {
    type: "dm",
    id: dmUserId,
    name: dmName,
    slug: `${dmUserId}-${slugifyFallbackName(dmName)}`,
    isGroup: false,
    userIds: [dmUserId],
    lastMessage: "",
    time: "",
  };
}

function buildPairDmFallback(
  dmUserIds: readonly number[],
  currentUserId: number | null,
  usersMapForChatInfo: ReadonlyMap<number, FolderSyncUserLike>,
): SidebarChat {
  const sortedPair = [...dmUserIds].sort((left, right) => left - right);
  const peerId =
    currentUserId != null
      ? (sortedPair.find((id) => id !== currentUserId) ?? sortedPair[0]!)
      : sortedPair[0]!;
  const dmUser = usersMapForChatInfo.get(peerId);
  const dmName = resolveFallbackUserName(dmUser, `User ${peerId}`);
  return {
    type: "dm",
    id: peerId,
    name: dmName,
    slug: `${peerId}-${slugifyFallbackName(dmName)}`,
    isGroup: false,
    userIds: [...sortedPair],
    lastMessage: "",
    time: "",
  };
}

function buildGroupDmFallback(
  dmUserIds: readonly number[],
  currentUserId: number | null,
  usersMapForChatInfo: ReadonlyMap<number, FolderSyncUserLike>,
): SidebarChat {
  const groupUsers: number[] =
    currentUserId != null && !dmUserIds.includes(currentUserId)
      ? [...dmUserIds, currentUserId]
      : [...dmUserIds];
  const groupNames = groupUsers.map((userId) => {
    const user = usersMapForChatInfo.get(userId);
    return resolveFallbackUserName(user, `User ${userId}`);
  });
  const groupName = groupNames.join(", ");
  const slug = groupUsers
    .map((userId) => {
      const user = usersMapForChatInfo.get(userId);
      const userName = resolveFallbackUserName(user, `user-${userId}`);
      return `${userId}-${slugifyFallbackName(userName)}`;
    })
    .join(",");
  return {
    type: "dm",
    id: groupUsers[0] ?? dmUserIds[0] ?? 0,
    name: groupName,
    slug,
    isGroup: true,
    userIds: [...groupUsers],
    lastMessage: "",
    time: "",
  };
}

function buildDmFallbackFromFolderItem(
  dmUserIds: readonly number[],
  currentUserId: number | null,
  usersMapForChatInfo: ReadonlyMap<number, FolderSyncUserLike>,
): SidebarChat | null {
  if (dmUserIds.length === 1) {
    const dmUserId = dmUserIds[0];
    if (dmUserId == null) {
      return null;
    }
    return buildSingleUserDmFallback(dmUserId, usersMapForChatInfo);
  }
  if (dmUserIds.length === 2) {
    return buildPairDmFallback(dmUserIds, currentUserId, usersMapForChatInfo);
  }
  return buildGroupDmFallback(dmUserIds, currentUserId, usersMapForChatInfo);
}

// Зачем: folder item может ссылаться на DM, которого ещё нет в matchedChats.
// Что делает: строит fallback DM-чаты из folder items в порядке orderIndex.
export function buildFallbackDmChatsFromFolderItems(
  orderedItems: readonly FolderItemForClient[],
  knownMatchedDmKeys: ReadonlySet<string>,
  currentUserId: number | null,
  usersMapForChatInfo: ReadonlyMap<number, FolderSyncUserLike>,
): SidebarChat[] {
  const fallbackDmChats: SidebarChat[] = [];
  const seenFallbackDmKeys = new Set<string>();

  for (const item of orderedItems) {
    const dmUserIds = parseFolderItemDmUserIds(item.chatId);
    if (dmUserIds == null) {
      continue;
    }
    const dmKey = `dm:${dmUserIds.join(",")}`;
    if (knownMatchedDmKeys.has(dmKey) || seenFallbackDmKeys.has(dmKey)) {
      continue;
    }
    seenFallbackDmKeys.add(dmKey);
    const fallbackChat = buildDmFallbackFromFolderItem(
      dmUserIds,
      currentUserId,
      usersMapForChatInfo,
    );
    if (fallbackChat != null) {
      fallbackDmChats.push(fallbackChat);
    }
  }

  return fallbackDmChats;
}

// Зачем: folder item может ссылаться на stream, которого ещё нет в matchedChats.
// Что делает: строит fallback stream-чаты из folder items в порядке orderIndex.
export function buildFallbackStreamChatsFromFolderItems(
  orderedItems: readonly FolderItemForClient[],
  knownMatchedStreamIds: ReadonlySet<number>,
  preferredDmNumericIds: ReadonlySet<number>,
  streamsMap: ReadonlyMap<number, StreamEntryInternal>,
  hideUnknownArchivedStreams: boolean,
): SidebarChat[] {
  const fallbackStreamChats: SidebarChat[] = [];
  const seenFallbackStreamIds = new Set<number>();

  for (const item of orderedItems) {
    const dmUserIds = parseFolderItemDmUserIds(item.chatId);
    if (dmUserIds != null) {
      continue;
    }

    const streamId = parseFolderItemStreamId(item.chatId);
    if (streamId == null) {
      continue;
    }
    const numericChatId = parseNumericChatId(item.chatId);
    if (numericChatId != null && preferredDmNumericIds.has(numericChatId)) {
      continue;
    }
    if (knownMatchedStreamIds.has(streamId) || seenFallbackStreamIds.has(streamId)) {
      continue;
    }

    const streamRecord = streamsMap.get(streamId);
    if (streamRecord?.isArchived === true) {
      continue;
    }
    if (hideUnknownArchivedStreams && streamRecord?.isArchived == null) {
      continue;
    }
    seenFallbackStreamIds.add(streamId);
    const streamName = streamRecord?.name ?? `stream-${streamId}`;
    fallbackStreamChats.push({
      type: "stream",
      stream_id: streamId,
      name: streamName,
      lastMessage: "",
      time: "",
      topics: [],
    });
  }

  return fallbackStreamChats;
}

function sortFolderItemsByOrderIndex(items: readonly FolderItemForClient[]): FolderItemForClient[] {
  return [...items].sort((leftItem, rightItem) => leftItem.orderIndex - rightItem.orderIndex);
}

export function buildCustomFolderSidebarChats(
  input: SelectedFolderSidebarProjectionInput,
): SidebarChat[] {
  const {
    selectedFolderId,
    folderChatIds,
    folderItemsByFolderId,
    chatsSortedByLastMessage,
    streamsMap,
    usersMapForChatInfo,
    currentUserId,
    hideUnknownArchivedStreams = false,
  } = input;

  if (folderChatIds == null) {
    return filterHiddenDmChats(chatsSortedByLastMessage, currentUserId);
  }

  const matchedChats = chatsSortedByLastMessage.filter((chat) =>
    hasMatchingSidebarChatId(folderChatIds, chat, currentUserId),
  );
  const selectedFolderItems = folderItemsByFolderId.get(selectedFolderId) ?? [];
  if (selectedFolderItems.length === 0) {
    return filterHiddenDmChats(matchedChats, currentUserId);
  }

  const { numericFolderItemIds, preferredDmNumericIds } =
    collectNumericFolderItemIdsAndPreferredDmNumericIds(
      selectedFolderItems,
      matchedChats,
      currentUserId,
    );
  const matchedChatsWithoutAmbiguousNumericStreams = filterAmbiguousNumericStreamMatches(
    matchedChats,
    numericFolderItemIds,
    preferredDmNumericIds,
  );
  const { knownMatchedStreamIds, knownMatchedDmKeys } = collectKnownMatchedChatKeys(
    matchedChatsWithoutAmbiguousNumericStreams,
    currentUserId,
  );
  const orderedItems = sortFolderItemsByOrderIndex(selectedFolderItems);
  const fallbackDmChats = buildFallbackDmChatsFromFolderItems(
    orderedItems,
    knownMatchedDmKeys,
    currentUserId,
    usersMapForChatInfo,
  );
  const fallbackStreamChats = buildFallbackStreamChatsFromFolderItems(
    orderedItems,
    knownMatchedStreamIds,
    preferredDmNumericIds,
    streamsMap,
    hideUnknownArchivedStreams,
  );

  return filterHiddenDmChats(
    [...fallbackDmChats, ...fallbackStreamChats, ...matchedChatsWithoutAmbiguousNumericStreams],
    currentUserId,
  );
}
