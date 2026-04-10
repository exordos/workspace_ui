import type { FolderItemForClient } from "~/shared/api/workspace-client";
import type { SidebarChat, StreamEntryInternal } from "~/shared/types/sidebar-chat";
import {
  addChatIdAliases,
  chatToWorkspaceChatId,
  type FolderSyncUserLike,
  parseNumericChatId,
  parseFolderItemDmUserIds,
  parseFolderItemStreamId,
  resolveFallbackUserName,
  slugifyFallbackName,
} from "./folder-sync-chat-id.lib";
import { SYSTEM_CHANNELS_FOLDER_ID, SYSTEM_PERSONAL_FOLDER_ID } from "./folder-sync-constants.lib";

export interface SelectedFolderSidebarProjectionInput {
  selectedFolderId: string;
  folderChatIds: ReadonlySet<string> | null;
  folderItemsByFolderId: ReadonlyMap<string, FolderItemForClient[]>;
  chatsSortedByLastMessage: readonly SidebarChat[];
  streamsMap: ReadonlyMap<number, StreamEntryInternal>;
  usersMapForChatInfo: ReadonlyMap<number, FolderSyncUserLike>;
  currentUserId: number | null;
}

// Зачем: из folder items приходит набор chat_id в разных форматах, который нужен для быстрого membership-check.
// Что делает: нормализует все chat_id через alias-правила и складывает их в Set.
export function toChatIdSet(items: readonly FolderItemForClient[]): Set<string> {
  const chatIdSet = new Set<string>();
  for (const item of items) {
    addChatIdAliases(chatIdSet, item.chatId);
  }
  return chatIdSet;
}

// Зачем: один и тот же чат может иметь несколько представлений chat_id (legacy/numeric/stream/dm).
// Что делает: проверяет совпадение chat_id с учетом всех его alias-вариантов.
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

// Зачем: self-DM должен быть доступен только из «Моя активность», а не в обычном списке чатов.
// Что делает: определяет, является ли конкретный DM персональным чатом пользователя с самим собой.
function isSelfDmChat(chat: SidebarChat, currentUserId: number | null): boolean {
  if (chat.type !== "dm") return false;
  if (chat.isGroup === true) return false;
  if (currentUserId == null) return false;
  return chat.id === currentUserId;
}

// Зачем: групповые DM и self-DM не должны попадать в sidebar-проекцию чатов.
// Что делает: возвращает true для DM-чатов, которые нужно скрыть из сайдбара.
function shouldHideDmChat(chat: SidebarChat, currentUserId: number | null): boolean {
  if (chat.type !== "dm") return false;
  if (chat.isGroup === true) return true;
  return isSelfDmChat(chat, currentUserId);
}

// Зачем: правило скрытия должно применяться единообразно для всех путей построения списка чатов.
// Что делает: удаляет из входного массива все DM, отмеченные как скрываемые.
function filterHiddenDmChats(
  chats: readonly SidebarChat[],
  currentUserId: number | null,
): SidebarChat[] {
  return chats.filter((chat) => !shouldHideDmChat(chat, currentUserId));
}

// Зачем: sidebar рендерится из единой проекции выбранной папки, чтобы поиск/навигация/список были согласованы.
// Что делает: строит итоговый список чатов для выбранной папки с учетом folder items, fallback и фильтрации DM.
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
    return filterHiddenDmChats(
      chatsSortedByLastMessage.filter((chat) => chat.type === "dm"),
      currentUserId,
    );
  }
  if (selectedFolderId === SYSTEM_CHANNELS_FOLDER_ID) {
    return filterHiddenDmChats(
      chatsSortedByLastMessage.filter((chat) => chat.type === "stream"),
      currentUserId,
    );
  }

  if (folderChatIds == null) {
    return filterHiddenDmChats(chatsSortedByLastMessage, currentUserId);
  }

  const matchedChats = chatsSortedByLastMessage.filter((chat) =>
    hasMatchingChatId(folderChatIds, chatToWorkspaceChatId(chat)),
  );
  const selectedFolderItems = folderItemsByFolderId.get(selectedFolderId) ?? [];
  if (selectedFolderItems.length === 0) {
    return filterHiddenDmChats(matchedChats, currentUserId);
  }

  // Зачем: legacy numeric chat_id могут конфликтовать между stream и dm, нужен явный приоритет.
  // Что делает: извлекает числового DM-кандидата для дедупликации неоднозначных numeric id.
  const resolveDmNumericCandidate = (dmUserIds: readonly number[]): number | null => {
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
  };

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
    const dmNumericCandidate = resolveDmNumericCandidate(dmUserIds);
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
  const matchedChatsWithoutAmbiguousNumericStreams = matchedChats.filter((chat) => {
    if (chat.type !== "stream") {
      return true;
    }
    return !(numericFolderItemIds.has(chat.stream_id) && preferredDmNumericIds.has(chat.stream_id));
  });

  const knownMatchedStreamIds = new Set(
    matchedChatsWithoutAmbiguousNumericStreams
      .filter((chat) => chat.type === "stream")
      .map((chat) => chat.stream_id),
  );
  const knownMatchedDmKeys = new Set(
    matchedChatsWithoutAmbiguousNumericStreams
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
              ? (sortedPair.find((id) => id !== currentUserId) ?? sortedPair[0]!)
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
    const numericChatId = parseNumericChatId(item.chatId);
    if (numericChatId != null && preferredDmNumericIds.has(numericChatId)) {
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

  return filterHiddenDmChats(
    [...fallbackDmChats, ...fallbackStreamChats, ...matchedChatsWithoutAmbiguousNumericStreams],
    currentUserId,
  );
}

// Зачем: системные папки рендерятся синтетически и не должны показывать loader при выборке items.
// Что делает: возвращает флаг loading для sidebar в зависимости от типа выбранной папки.
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
