import type { FolderItemForClient } from "~/shared/api/workspace-client";
import type { SidebarChat, StreamEntryInternal } from "~/shared/types/sidebar-chat";
import { addChatIdAliases } from "./folder-sync-chat-id.lib";
import { SYSTEM_CHANNELS_FOLDER_ID, SYSTEM_PERSONAL_FOLDER_ID } from "./folder-sync-constants.lib";
import { filterHiddenDmChats } from "./folder-sync-sidebar-chats-dm.lib";
import { buildCustomFolderSidebarChats } from "./folder-sync-sidebar-chats-projection.lib";
import type { FolderSyncUserLike } from "./folder-sync-chat-id.lib";

export { hasMatchingChatId } from "./folder-sync-chat-id.lib";

export interface SelectedFolderSidebarProjectionInput {
  selectedFolderId: string;
  folderChatIds: ReadonlySet<string> | null;
  folderItemsByFolderId: ReadonlyMap<string, FolderItemForClient[]>;
  chatsSortedByLastMessage: readonly SidebarChat[];
  streamsMap: ReadonlyMap<number, StreamEntryInternal>;
  usersMapForChatInfo: ReadonlyMap<number, FolderSyncUserLike>;
  currentUserId: number | null;
  hideUnknownArchivedStreams?: boolean;
  isStreamMuted?: (streamId: number) => boolean;
}

// Normalize folder-item chat_ids (multiple formats) into a Set for fast membership checks.
export function toChatIdSet(items: readonly FolderItemForClient[]): Set<string> {
  const chatIdSet = new Set<string>();
  for (const item of items) {
    addChatIdAliases(chatIdSet, item.chatId);
  }
  return chatIdSet;
}

// Single projection for the selected folder keeps search, navigation, and list in sync.
export function buildSelectedFolderSidebarChats(
  input: SelectedFolderSidebarProjectionInput,
): SidebarChat[] {
  const { selectedFolderId, chatsSortedByLastMessage, currentUserId } = input;

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

  return buildCustomFolderSidebarChats(input);
}

// System folders are synthetic — never show an items loader for them.
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
