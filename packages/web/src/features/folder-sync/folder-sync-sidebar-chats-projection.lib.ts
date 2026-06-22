import type { FolderItemForClient } from "~/shared/api/workspace-client";
import { numericUserIdOrNull, type UserId } from "~/shared/lib/user-id.lib";
import type { SidebarChat, StreamEntryInternal } from "~/shared/types/sidebar-chat";
import {
  chatToWorkspaceChatIds,
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
  const numericCurrentUserId = numericUserIdOrNull(currentUserId);
  const peerId =
    numericCurrentUserId != null
      ? (sortedPair.find((id) => id !== numericCurrentUserId) ?? sortedPair[0]!)
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
