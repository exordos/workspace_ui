import type { FolderItemForClient } from "~/shared/api/workspace-client";
import { userIdsEqual, type UserId } from "~/shared/lib/user-id.lib";
import type { SidebarChat, StreamEntryInternal } from "~/shared/types/sidebar-chat";
import {
  chatToWorkspaceChatIds,
  folderItemLookupKeysForChatId,
  getFolderSyncUser,
  hasMatchingChatId,
  type FolderSyncUsersMap,
  parseFolderItemDmUserIds,
  parseFolderItemStreamId,
  resolveFallbackUserName,
  slugifyFallbackName,
} from "./folder-sync-chat-id.lib";
import { filterHiddenDmChats } from "./folder-sync-sidebar-chats-dm.lib";
import type { SelectedFolderSidebarProjectionInput } from "./folder-sync-sidebar-chats.lib";

// (greenfield) Numeric-only stream identifiers are ambiguous and not supported.

export interface KnownMatchedChatKeys {
  knownMatchedStreamIds: Set<string>;
  knownMatchedDmKeys: Set<string>;
}

export function collectKnownMatchedChatKeys(
  matchedChats: readonly SidebarChat[],
  currentUserId: UserId | null,
): KnownMatchedChatKeys {
  const knownMatchedStreamIds = new Set<string>();
  const knownMatchedDmKeys = new Set<string>();
  for (const chat of matchedChats) {
    if (chat.type === "stream") {
      knownMatchedStreamIds.add(chat.streamUuid);
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
  currentUserId: UserId | null,
): boolean {
  return chatToWorkspaceChatIds(chat, currentUserId).some((chatId) =>
    hasMatchingChatId(folderChatIds, chatId),
  );
}

function toBadge(unreadCount: number | undefined): number | undefined {
  return unreadCount != null && unreadCount > 0 ? unreadCount : undefined;
}

function buildSingleUserDmFallback(
  dmUserId: number,
  usersMapForChatInfo: FolderSyncUsersMap,
): SidebarChat | null {
  const dmUser = getFolderSyncUser(usersMapForChatInfo, dmUserId);
  const dmName = resolveFallbackUserName(dmUser, `User ${dmUserId}`);
  return {
    type: "dm",
    id: dmUserId,
    name: dmName,
    slug: `${dmUserId}-${slugifyFallbackName(dmName)}`,
    userIds: [dmUserId],
    lastMessage: "",
    time: "",
  };
}

function buildPairDmFallback(
  dmUserIds: readonly number[],
  currentUserId: UserId | null,
  usersMapForChatInfo: FolderSyncUsersMap,
): SidebarChat {
  const sortedPair = [...dmUserIds].sort((left, right) => left - right);
  const peerId =
    currentUserId != null
      ? (sortedPair.find((id) => !userIdsEqual(id, currentUserId)) ?? sortedPair[0]!)
      : sortedPair[0]!;
  const dmUser = getFolderSyncUser(usersMapForChatInfo, peerId);
  const dmName = resolveFallbackUserName(dmUser, `User ${peerId}`);
  return {
    type: "dm",
    id: peerId,
    name: dmName,
    slug: `${peerId}-${slugifyFallbackName(dmName)}`,
    userIds: [...sortedPair],
    lastMessage: "",
    time: "",
  };
}

function buildDmFallbackFromFolderItem(
  dmUserIds: readonly number[],
  currentUserId: UserId | null,
  usersMapForChatInfo: FolderSyncUsersMap,
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
  return null;
}

// Folder item may reference a DM missing from matchedChats — build fallbacks in orderIndex order.
export function buildFallbackDmChatsFromFolderItems(
  orderedItems: readonly FolderItemForClient[],
  knownMatchedDmKeys: ReadonlySet<string>,
  currentUserId: UserId | null,
  usersMapForChatInfo: FolderSyncUsersMap,
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

// Folder item may reference a stream missing from matchedChats — build fallbacks in orderIndex order.
export function buildFallbackStreamChatsFromFolderItems(
  orderedItems: readonly FolderItemForClient[],
  knownMatchedStreamIds: ReadonlySet<string>,
  streamsMap: ReadonlyMap<string, StreamEntryInternal>,
  hideUnknownArchivedStreams: boolean,
): SidebarChat[] {
  const fallbackStreamChats: SidebarChat[] = [];
  const seenFallbackStreamIds = new Set<string>();

  for (const item of orderedItems) {
    const dmUserIds = parseFolderItemDmUserIds(item.chatId);
    if (dmUserIds != null) {
      continue;
    }

    const streamId = parseFolderItemStreamId(item.chatId);
    if (streamId == null) {
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
      streamUuid: streamId,
      name: streamName,
      ...(streamRecord?.color != null ? { color: streamRecord.color } : {}),
      lastMessage: "",
      time: "",
      topics: [],
      badge: toBadge(item.unreadCount ?? streamRecord?.unreadCount),
    });
  }

  return fallbackStreamChats;
}

function buildFolderItemUnreadCountByKey(
  items: readonly FolderItemForClient[],
): Map<string, number> {
  const result = new Map<string, number>();
  for (const item of items) {
    if (item.unreadCount == null) continue;
    for (const key of folderItemLookupKeysForChatId(item.chatId)) {
      result.set(key, item.unreadCount);
    }
  }
  return result;
}

function getFolderItemUnreadCountForChat(
  folderItemUnreadCountByKey: ReadonlyMap<string, number>,
  chat: SidebarChat,
  currentUserId: UserId | null,
): number | undefined {
  for (const chatId of chatToWorkspaceChatIds(chat, currentUserId)) {
    for (const key of folderItemLookupKeysForChatId(chatId)) {
      const unreadCount = folderItemUnreadCountByKey.get(key);
      if (unreadCount != null) {
        return unreadCount;
      }
    }
  }
  return undefined;
}

function applyFolderItemBadge(chat: SidebarChat, unreadCount: number | undefined): SidebarChat {
  if (unreadCount == null) return chat;
  return { ...chat, badge: toBadge(unreadCount) };
}

function applyFolderItemBadges(
  chats: readonly SidebarChat[],
  folderItemUnreadCountByKey: ReadonlyMap<string, number>,
  currentUserId: UserId | null,
): SidebarChat[] {
  return chats.map((chat) =>
    applyFolderItemBadge(
      chat,
      getFolderItemUnreadCountForChat(folderItemUnreadCountByKey, chat, currentUserId),
    ),
  );
}

function sortFolderItemsByOrderIndex(items: readonly FolderItemForClient[]): FolderItemForClient[] {
  return [...items].sort((leftItem, rightItem) => leftItem.orderIndex - rightItem.orderIndex);
}

function orderMutedStreamsLast(
  chats: readonly SidebarChat[],
  isStreamMuted: ((streamId: string) => boolean) | undefined,
): SidebarChat[] {
  if (isStreamMuted == null) return [...chats];

  const unmutedChats: SidebarChat[] = [];
  const mutedChats: SidebarChat[] = [];
  for (const chat of chats) {
    if (chat.type === "stream" && isStreamMuted(chat.streamUuid)) {
      mutedChats.push(chat);
    } else {
      unmutedChats.push(chat);
    }
  }
  return [...unmutedChats, ...mutedChats];
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
    isStreamMuted,
  } = input;

  if (folderChatIds == null) {
    return [];
  }

  const matchedChats = chatsSortedByLastMessage.filter((chat) =>
    hasMatchingSidebarChatId(folderChatIds, chat, currentUserId),
  );
  const selectedFolderItems = folderItemsByFolderId.get(selectedFolderId) ?? [];
  if (selectedFolderItems.length === 0) {
    return orderMutedStreamsLast(filterHiddenDmChats(matchedChats, currentUserId), isStreamMuted);
  }

  const folderItemUnreadCountByKey = buildFolderItemUnreadCountByKey(selectedFolderItems);
  const matchedChatsWithFolderBadges = applyFolderItemBadges(
    matchedChats,
    folderItemUnreadCountByKey,
    currentUserId,
  );
  const { knownMatchedStreamIds, knownMatchedDmKeys } = collectKnownMatchedChatKeys(
    matchedChatsWithFolderBadges,
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
    streamsMap,
    hideUnknownArchivedStreams,
  );

  return orderMutedStreamsLast(
    filterHiddenDmChats(
      [...fallbackDmChats, ...fallbackStreamChats, ...matchedChatsWithFolderBadges],
      currentUserId,
    ),
    isStreamMuted,
  );
}
