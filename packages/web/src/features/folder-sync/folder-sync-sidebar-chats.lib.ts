import type { FolderItemForClient } from "~/shared/api/workspace-client";
import type { UserId } from "~/shared/lib/user-id.lib";
import type { SidebarChat, StreamEntryInternal } from "~/shared/types/sidebar-chat";
import { addChatIdAliases } from "./folder-sync-chat-id.lib";
import { buildCustomFolderSidebarChats } from "./folder-sync-sidebar-chats-projection.lib";
import type { FolderSyncUsersMap } from "./folder-sync-chat-id.lib";

export { hasMatchingChatId } from "./folder-sync-chat-id.lib";

export interface SelectedFolderSidebarProjectionInput {
  selectedFolderId: string;
  folderChatIds: ReadonlySet<string> | null;
  folderItemsByFolderId: ReadonlyMap<string, FolderItemForClient[]>;
  chatsSortedByLastMessage: readonly SidebarChat[];
  streamsMap: ReadonlyMap<string, StreamEntryInternal>;
  usersMapForChatInfo: FolderSyncUsersMap;
  currentUserId: UserId | null;
  hideUnknownArchivedStreams?: boolean;
  isStreamMuted?: (streamId: string) => boolean;
}

// Normalize folder-item chat identifiers into a Set for fast membership checks.
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
  return buildCustomFolderSidebarChats(input);
}

export function resolveSelectedFolderSidebarLoading(
  _selectedFolderId: string,
  loading: boolean,
): boolean {
  return loading;
}
