import type { FolderItemForClient } from "~/shared/api/workspace-client";
import type { SidebarChat, StreamEntryInternal } from "~/shared/types/sidebar-chat";
import {
  addChatIdAliases,
  chatToWorkspaceChatId,
  type FolderSyncUserLike,
  parseFolderItemDmUserIds,
  parseFolderItemStreamId,
  resolveFallbackUserName,
  slugifyFallbackName,
} from "./folder-sync-chat-id.lib";
import {
  SYSTEM_CHANNELS_FOLDER_ID,
  SYSTEM_PERSONAL_FOLDER_ID,
} from "./folder-sync-constants.lib";

export interface SelectedFolderSidebarProjectionInput {
  selectedFolderId: string;
  folderChatIds: ReadonlySet<string> | null;
  folderItemsByFolderId: ReadonlyMap<string, FolderItemForClient[]>;
  chatsSortedByLastMessage: readonly SidebarChat[];
  streamsMap: ReadonlyMap<number, StreamEntryInternal>;
  usersMapForChatInfo: ReadonlyMap<number, FolderSyncUserLike>;
  currentUserId: number | null;
}

export function toChatIdSet(items: readonly FolderItemForClient[]): Set<string> {
  const chatIdSet = new Set<string>();
  for (const item of items) {
    addChatIdAliases(chatIdSet, item.chatId);
  }
  return chatIdSet;
}

export function hasMatchingChatId(chatIdSet: ReadonlySet<string>, chatId: string): boolean {
  const aliases = new Set<string>();
  addChatIdAliases(aliases, chatId);
  for (const alias of aliases) {
    if (chatIdSet.has(alias)) {
      return true;
    }
  }
  return false;
}

export function buildSelectedFolderSidebarChats(
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
  } = input;

  if (selectedFolderId === SYSTEM_PERSONAL_FOLDER_ID) {
    return chatsSortedByLastMessage.filter((chat) => chat.type === "dm");
  }
  if (selectedFolderId === SYSTEM_CHANNELS_FOLDER_ID) {
    return chatsSortedByLastMessage.filter((chat) => chat.type === "stream");
  }

  if (folderChatIds == null) {
    return [...chatsSortedByLastMessage];
  }

  const matchedChats = chatsSortedByLastMessage.filter((chat) =>
    hasMatchingChatId(folderChatIds, chatToWorkspaceChatId(chat)),
  );
  const selectedFolderItems = folderItemsByFolderId.get(selectedFolderId) ?? [];
  if (selectedFolderItems.length === 0) {
    return matchedChats;
  }

  const knownMatchedStreamIds = new Set(
    matchedChats.filter((chat) => chat.type === "stream").map((chat) => chat.stream_id),
  );
  const knownMatchedDmKeys = new Set(
    matchedChats
      .filter((chat): chat is Extract<SidebarChat, { type: "dm" }> => chat.type === "dm")
      .map((chat) => chatToWorkspaceChatId(chat)),
  );
  const fallbackStreamChats: SidebarChat[] = [];
  const fallbackDmChats: SidebarChat[] = [];
  const seenFallbackStreamIds = new Set<number>();
  const seenFallbackDmKeys = new Set<string>();
  const orderedItems = [...selectedFolderItems].sort(
    (leftItem, rightItem) => leftItem.orderIndex - rightItem.orderIndex,
  );

  for (const item of orderedItems) {
    const dmUserIds = parseFolderItemDmUserIds(item.chatId);
    if (dmUserIds != null) {
      const dmKey = `dm:${dmUserIds.join(",")}`;
      if (!knownMatchedDmKeys.has(dmKey) && !seenFallbackDmKeys.has(dmKey)) {
        seenFallbackDmKeys.add(dmKey);

        if (dmUserIds.length === 1) {
          const dmUserId = dmUserIds[0];
          if (dmUserId != null) {
            const dmUser = usersMapForChatInfo.get(dmUserId);
            const dmName = resolveFallbackUserName(dmUser, `User ${dmUserId}`);
            fallbackDmChats.push({
              type: "dm",
              id: dmUserId,
              name: dmName,
              slug: `${dmUserId}-${slugifyFallbackName(dmName)}`,
              isGroup: false,
              userIds: [dmUserId],
              lastMessage: "",
              time: "",
            });
          }
        } else if (dmUserIds.length === 2) {
          // Workspace / Zulip store 1:1 as dm:userA,userB (two ids). Not a huddle.
          const sortedPair = [...dmUserIds].sort((left, right) => left - right);
          const peerId =
            currentUserId != null
              ? sortedPair.find((id) => id !== currentUserId) ?? sortedPair[0]!
              : sortedPair[0]!;
          const dmUser = usersMapForChatInfo.get(peerId);
          const dmName = resolveFallbackUserName(dmUser, `User ${peerId}`);
          fallbackDmChats.push({
            type: "dm",
            id: peerId,
            name: dmName,
            slug: `${peerId}-${slugifyFallbackName(dmName)}`,
            isGroup: false,
            userIds: sortedPair,
            lastMessage: "",
            time: "",
          });
        } else {
          const groupUsers =
            currentUserId != null && !dmUserIds.includes(currentUserId)
              ? [...dmUserIds, currentUserId]
              : dmUserIds;
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
          fallbackDmChats.push({
            type: "dm",
            id: groupUsers[0] ?? dmUserIds[0] ?? 0,
            name: groupName,
            slug,
            isGroup: true,
            userIds: groupUsers,
            lastMessage: "",
            time: "",
          });
        }
      }
      continue;
    }

    const streamId = parseFolderItemStreamId(item.chatId);
    if (streamId == null) {
      continue;
    }
    if (knownMatchedStreamIds.has(streamId) || seenFallbackStreamIds.has(streamId)) {
      continue;
    }

    seenFallbackStreamIds.add(streamId);
    const streamName = streamsMap.get(streamId)?.name ?? `stream-${streamId}`;
    fallbackStreamChats.push({
      type: "stream",
      stream_id: streamId,
      name: streamName,
      lastMessage: "",
      time: "",
      topics: [],
    });
  }

  return [...fallbackDmChats, ...fallbackStreamChats, ...matchedChats];
}

export function resolveSelectedFolderSidebarLoading(
  selectedFolderId: string,
  loading: boolean,
): boolean {
  if (
    selectedFolderId === SYSTEM_PERSONAL_FOLDER_ID ||
    selectedFolderId === SYSTEM_CHANNELS_FOLDER_ID
  ) {
    return false;
  }
  return loading;
}
