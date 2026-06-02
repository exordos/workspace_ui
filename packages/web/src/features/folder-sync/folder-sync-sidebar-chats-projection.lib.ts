import type { FolderItemForClient } from "~/shared/api/workspace-client";
import type { SidebarChat, StreamEntryInternal } from "~/shared/types/sidebar-chat";
import {
  chatToWorkspaceChatIds,
  hasMatchingChatId,
  type FolderSyncUserLike,
  parseFolderItemDmUserIds,
  parseFolderItemStreamId,
  resolveFallbackUserName,
  slugifyFallbackName,
} from "./folder-sync-chat-id.lib";
import { filterHiddenDmChats } from "./folder-sync-sidebar-chats-dm.lib";
import type { SelectedFolderSidebarProjectionInput } from "./folder-sync-sidebar-chats.lib";

// (greenfield) Numeric chat_id ambiguity is not supported.

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

function orderMutedStreamsLast(
  chats: readonly SidebarChat[],
  isStreamMuted: ((streamId: number) => boolean) | undefined,
): SidebarChat[] {
  if (isStreamMuted == null) return [...chats];

  const unmutedChats: SidebarChat[] = [];
  const mutedChats: SidebarChat[] = [];
  for (const chat of chats) {
    if (chat.type === "stream" && isStreamMuted(chat.stream_id)) {
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
    return filterHiddenDmChats(chatsSortedByLastMessage, currentUserId);
  }

  const matchedChats = chatsSortedByLastMessage.filter((chat) =>
    hasMatchingSidebarChatId(folderChatIds, chat, currentUserId),
  );
  const selectedFolderItems = folderItemsByFolderId.get(selectedFolderId) ?? [];
  if (selectedFolderItems.length === 0) {
    return orderMutedStreamsLast(filterHiddenDmChats(matchedChats, currentUserId), isStreamMuted);
  }

  const { knownMatchedStreamIds, knownMatchedDmKeys } = collectKnownMatchedChatKeys(
    matchedChats,
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
      [...fallbackDmChats, ...fallbackStreamChats, ...matchedChats],
      currentUserId,
    ),
    isStreamMuted,
  );
}
