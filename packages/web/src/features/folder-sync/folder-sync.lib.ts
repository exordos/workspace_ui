import type { FolderItemForClient, WorkspaceFolderForRail } from "~/shared/api/workspace-client";
import type { SidebarChat, StreamEntryInternal } from "~/shared/types/sidebar-chat";

export interface FolderSyncSystemLabels {
  allChats: string;
  personal: string;
  channels: string;
}

// Внутренние идентификаторы виртуальных системных папок.
export const SYSTEM_ALL_FOLDER_ID = "system:all";
export const SYSTEM_PERSONAL_FOLDER_ID = "system:personal";
export const SYSTEM_CHANNELS_FOLDER_ID = "system:channels";

interface FolderLike {
  id: string;
  systemType?: "created" | "all" | "personal" | "channels";
}

interface FolderItemsLoadResult {
  ok: boolean;
  items: FolderItemForClient[];
}

interface FolderSnapshotLike {
  folders: readonly { uuid: string }[];
  itemsByFolderId: ReadonlyMap<string, FolderItemsLoadResult>;
}

interface UserLike {
  full_name?: string;
  email?: string;
}

export interface SelectedFolderSidebarProjectionInput {
  selectedFolderId: string;
  folderChatIds: ReadonlySet<string> | null;
  folderItemsByFolderId: ReadonlyMap<string, FolderItemForClient[]>;
  chatsSortedByLastMessage: readonly SidebarChat[];
  streamsMap: ReadonlyMap<number, StreamEntryInternal>;
  usersMapForChatInfo: ReadonlyMap<number, UserLike>;
  currentUserId: number | null;
}

function parseNumericChatId(chatId: string): number | null {
  // Числовой chat_id (legacy backend-вариант).
  const trimmed = chatId.trim();
  if (!/^[0-9]+$/.test(trimmed)) {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function parseStreamChatId(chatId: string): { streamId: number; topic: string | null } | null {
  // Канонический stream-id: stream:<id>[:topic].
  const [kind, streamIdRaw, ...topicParts] = chatId.split(":");
  if (kind !== "stream" || streamIdRaw == null || streamIdRaw.length === 0) {
    return null;
  }
  const streamId = Number(streamIdRaw);
  if (!Number.isSafeInteger(streamId) || streamId <= 0) {
    return null;
  }
  const topic = topicParts.length > 0 ? topicParts.join(":") : null;
  return { streamId, topic };
}

function normalizeStreamTopic(topic: string | null): string {
  // Для совместимости считаем пустые и "general" одинаковыми.
  if (topic == null) return "general";
  const trimmedTopic = topic.trim();
  if (trimmedTopic.length === 0) return "general";
  if (trimmedTopic.toLowerCase() === "general") return "general";
  return trimmedTopic;
}

function parseDmChatUserIds(chatId: string): number[] | null {
  // DM формат: dm:<id>[,<id>...], нормализуем в отсортированный массив.
  const dmMatch = /^dm:([0-9]+(?:,[0-9]+)*)$/.exec(chatId.trim());
  const rawUserIds = dmMatch?.[1];
  if (!rawUserIds) {
    return null;
  }
  const parsed = rawUserIds
    .split(",")
    .map((rawUserId) => Number(rawUserId))
    .filter((userId) => Number.isSafeInteger(userId) && userId > 0);
  if (parsed.length === 0) {
    return null;
  }
  return [...parsed].sort((left, right) => left - right);
}

function parseDmSlugToUserIds(dmSlug: string): number[] {
  return dmSlug
    .split(",")
    .map((part) => part.split("-")[0]?.trim() ?? "")
    .map((rawUserId) => {
      if (!/^[0-9]+$/.test(rawUserId)) return null;
      const parsed = Number(rawUserId);
      if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;
      return parsed;
    })
    .filter((userId): userId is number => userId !== null);
}

function chatToWorkspaceChatId(chat: SidebarChat): string {
  if (chat.type === "stream") {
    return `stream:${chat.stream_id}:general`;
  }
  const userIds =
    Array.isArray(chat.userIds) && chat.userIds.length > 0
      ? chat.userIds
      : parseDmSlugToUserIds(chat.slug);
  return `dm:${userIds.join(",")}`;
}

function parseFolderItemStreamId(chatId: string): number | null {
  const trimmed = chatId.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const streamColonMatch = /^stream:([0-9]+)/.exec(trimmed);
  if (streamColonMatch?.[1]) {
    const parsed = Number(streamColonMatch[1]);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }

  const streamDashMatch = /^stream-([0-9]+)$/.exec(trimmed);
  if (streamDashMatch?.[1]) {
    const parsed = Number(streamDashMatch[1]);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }

  if (/^(dm|pm):/i.test(trimmed)) {
    return null;
  }

  if (/^[0-9]+$/.test(trimmed)) {
    const parsed = Number(trimmed);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }

  return null;
}

function parseFolderItemDmUserIds(chatId: string): number[] | null {
  const trimmed = chatId.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const dmMatch = /^(dm|pm):([0-9]+(?:,[0-9]+)*)$/i.exec(trimmed);
  const rawUserIds = dmMatch?.[2];
  if (!rawUserIds) {
    return null;
  }

  const parsed = rawUserIds
    .split(",")
    .map((rawUserId) => Number(rawUserId))
    .filter((userId) => Number.isSafeInteger(userId) && userId > 0);
  if (parsed.length === 0) {
    return null;
  }

  return [...parsed].sort((left, right) => left - right);
}

function slugifyFallbackName(value: string): string {
  const normalized = value.trim().toLowerCase();
  const safe = normalized.replace(/[^a-z0-9а-яё-]+/gi, "-").replace(/-+/g, "-");
  return safe.replace(/^-|-$/g, "") || "user";
}

function resolveFallbackUserName(user: UserLike | undefined, fallbackName: string): string {
  const fullName = user?.full_name?.trim();
  if (fullName != null && fullName.length > 0) {
    return fullName;
  }
  const email = user?.email?.trim();
  if (email != null && email.length > 0) {
    return email;
  }
  return fallbackName;
}

function addChatIdAliases(target: Set<string>, chatId: string): void {
  // Добавляем эквивалентные формы chat_id, чтобы сравнение работало для mixed-форматов.
  const trimmedChatId = chatId.trim();
  if (trimmedChatId.length === 0) {
    return;
  }
  target.add(trimmedChatId);

  const numericChatId = parseNumericChatId(trimmedChatId);
  if (numericChatId != null) {
    target.add(String(numericChatId));
    target.add(`stream:${numericChatId}:general`);
    target.add(`dm:${numericChatId}`);
    return;
  }

  const streamChat = parseStreamChatId(trimmedChatId);
  if (streamChat != null) {
    target.add(`stream:${streamChat.streamId}:general`);
    target.add(`stream:${streamChat.streamId}:${normalizeStreamTopic(streamChat.topic)}`);
    target.add(String(streamChat.streamId));
    return;
  }

  const dmUserIds = parseDmChatUserIds(trimmedChatId);
  if (dmUserIds == null) {
    return;
  }
  target.add(`dm:${dmUserIds.join(",")}`);
  if (dmUserIds.length === 1) {
    const singleDmUserId = dmUserIds[0];
    if (singleDmUserId != null) {
      target.add(String(singleDmUserId));
    }
  }
}

function isPersonalOrChannelsSystemFolder(folder: WorkspaceFolderForRail): boolean {
  // Эти папки могут синтетически добавляться в UI и не должны дублироваться.
  return (
    folder.id === SYSTEM_PERSONAL_FOLDER_ID ||
    folder.id === SYSTEM_CHANNELS_FOLDER_ID ||
    folder.systemType === "personal" ||
    folder.systemType === "channels"
  );
}

function createSyntheticAllFolder(labels: FolderSyncSystemLabels): WorkspaceFolderForRail {
  return {
    id: SYSTEM_ALL_FOLDER_ID,
    label: labels.allChats,
    backgroundColor: 0,
    systemType: "all",
  };
}

function createPersonalFolder(labels: FolderSyncSystemLabels): WorkspaceFolderForRail {
  return {
    id: SYSTEM_PERSONAL_FOLDER_ID,
    label: labels.personal,
    backgroundColor: 0,
    systemType: "personal",
  };
}

function createChannelsFolder(labels: FolderSyncSystemLabels): WorkspaceFolderForRail {
  return {
    id: SYSTEM_CHANNELS_FOLDER_ID,
    label: labels.channels,
    backgroundColor: 0,
    systemType: "channels",
  };
}

function hasFolderId(folders: readonly FolderLike[], folderId: string): boolean {
  return folders.some((folder) => folder.id === folderId);
}

function resolveFolderSystemType(
  folders: readonly FolderLike[],
  folder: FolderLike,
): NonNullable<FolderLike["systemType"]> {
  if (folder.systemType != null) {
    return folder.systemType;
  }
  return folders[0]?.id === folder.id ? "all" : "created";
}

function resolveSelectedFolderSystemType(
  folders: readonly FolderLike[],
  selectedFolderId: string,
): NonNullable<FolderLike["systemType"]> | null {
  // Тип важен, чтобы понять нужен ли сетевой load items для выбранной папки.
  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId);
  if (!selectedFolder) {
    return null;
  }
  return resolveFolderSystemType(folders, selectedFolder);
}

export function withDefaultSystemFolders(
  folders: readonly WorkspaceFolderForRail[],
  labels: FolderSyncSystemLabels,
  showSystemFolders = false,
): WorkspaceFolderForRail[] {
  // Нормализуем "all" и при необходимости вставляем personal/channels сразу после all.
  // Виртуальный id `system:all` всегда — папка «Все чаты» из API не подменяет rail (badge переносим).
  const baseFolders = folders.filter((folder) => !isPersonalOrChannelsSystemFolder(folder));
  const preferredAllFolder =
    baseFolders.find(
      (folder) => folder.systemType === "all" && folder.id !== SYSTEM_ALL_FOLDER_ID,
    ) ?? baseFolders.find((folder) => folder.systemType === "all");

  const syntheticAll = createSyntheticAllFolder(labels);
  const normalizedAllFolder: WorkspaceFolderForRail =
    preferredAllFolder != null && preferredAllFolder.badge !== undefined
      ? { ...syntheticAll, badge: preferredAllFolder.badge }
      : syntheticAll;

  const foldersWithoutApiAll = baseFolders.filter((folder) => folder.systemType !== "all");
  const normalizedBaseFolders = [normalizedAllFolder, ...foldersWithoutApiAll];

  const includePersonalAndChannels =
    showSystemFolders && baseFolders.some((folder) => folder.id !== SYSTEM_ALL_FOLDER_ID);
  if (!includePersonalAndChannels) {
    return normalizedBaseFolders;
  }

  const allFolderIndex = normalizedBaseFolders.findIndex((folder) => folder.systemType === "all");
  const insertIndex = allFolderIndex + 1;
  return [
    ...normalizedBaseFolders.slice(0, insertIndex),
    createPersonalFolder(labels),
    createChannelsFolder(labels),
    ...normalizedBaseFolders.slice(insertIndex),
  ];
}

export function resolveSelectedFolderId(
  folders: readonly FolderLike[],
  selectedFolderId: string,
): string | null {
  // Если выбранная папка исчезла — безопасно откатываемся на первую доступную.
  if (folders.length === 0) {
    return null;
  }
  if (hasFolderId(folders, selectedFolderId)) {
    return selectedFolderId;
  }
  return folders[0]?.id ?? null;
}

export function shouldLoadFolderItemsForSelection(
  folders: readonly FolderLike[],
  selectedFolderId: string,
): boolean {
  // items загружаем только для created-папок; системные строятся без folder items.
  if (folders.length === 0) return false;
  if (!hasFolderId(folders, selectedFolderId)) return false;
  const selectedFolderType = resolveSelectedFolderSystemType(folders, selectedFolderId);
  return selectedFolderType === "created";
}

export function toChatIdSet(items: readonly FolderItemForClient[]): Set<string> {
  // Сохраняем не только исходный chat_id, но и эквивалентные алиасы.
  const chatIdSet = new Set<string>();
  for (const item of items) {
    addChatIdAliases(chatIdSet, item.chatId);
  }
  return chatIdSet;
}

export function hasMatchingChatId(chatIdSet: ReadonlySet<string>, chatId: string): boolean {
  // Симметричное сравнение форматов chat_id между sidebar и folder items.
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

  // Основной путь: берем чаты, совпавшие с chat_id выбранной папки.
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
    // Fallback для DM/PM: достраиваем чат, если его нет в message-based списке.
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

    // Fallback для stream: отображаем поток по stream_id даже без локального last message.
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

export function mergeFolderItemsSnapshot(
  previous: ReadonlyMap<string, FolderItemForClient[]>,
  snapshot: FolderSnapshotLike,
): Map<string, FolderItemForClient[]> {
  // Оставляем только живые папки; при ошибке конкретной папки сохраняем stale-данные.
  const next = new Map<string, FolderItemForClient[]>();
  const liveFolderIds = new Set(snapshot.folders.map((folder) => folder.uuid));

  for (const folderId of liveFolderIds) {
    const result = snapshot.itemsByFolderId.get(folderId);
    if (result?.ok) {
      next.set(folderId, result.items);
      continue;
    }
    const stale = previous.get(folderId);
    if (stale) {
      next.set(folderId, stale);
    }
  }

  return next;
}
