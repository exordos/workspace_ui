/**
 * Client-side unread badges for Folder Rail icons.
 *
 * Sums `SidebarChat.badge` per folder using the same projection as the sidebar chat list,
 * so rail counts stay in sync with Zulip chat-list updates (not only Workspace folder poll).
 */
import type { FolderItemForClient, WorkspaceFolderForRail } from "~/shared/api/workspace-client";
import type { SidebarChat, StreamEntryInternal } from "~/shared/types/sidebar-chat";
import {
  SYSTEM_ALL_FOLDER_ID,
  SYSTEM_CHANNELS_FOLDER_ID,
  SYSTEM_PERSONAL_FOLDER_ID,
} from "./folder-sync-constants.lib";
import { buildSelectedFolderSidebarChats, toChatIdSet } from "./folder-sync-sidebar-chats.lib";
import type { FolderSyncUserLike } from "./folder-sync-chat-id.lib";

export interface FolderUnreadBadgesInput {
  folderItemsByFolderId: ReadonlyMap<string, FolderItemForClient[]>;
  chatsSortedByLastMessage: readonly SidebarChat[];
  streamsMap: ReadonlyMap<number, StreamEntryInternal>;
  usersMapForChatInfo: ReadonlyMap<number, FolderSyncUserLike>;
  currentUserId: number | null;
  hideUnknownArchivedStreams?: boolean;
  isStreamMuted?: (streamId: number) => boolean;
}

function isSystemFolderWithoutItemMembership(folder: WorkspaceFolderForRail): boolean {
  return (
    folder.id === SYSTEM_ALL_FOLDER_ID ||
    folder.id === SYSTEM_PERSONAL_FOLDER_ID ||
    folder.id === SYSTEM_CHANNELS_FOLDER_ID ||
    folder.systemType === "all" ||
    folder.systemType === "personal" ||
    folder.systemType === "channels"
  );
}

/** Sums unread badge counts from projected sidebar chats. */
export function sumSidebarChatUnreadBadges(chats: readonly SidebarChat[]): number {
  let total = 0;
  for (const chat of chats) {
    total += chat.badge ?? 0;
  }
  return total;
}

/**
 * Folder chat membership for badge projection.
 * - `null` — system all/personal/channels (derive scope from folder id)
 * - `Set` — user folder with cached items (may be empty)
 * - `undefined` — items not loaded yet; keep API `badge` on the folder row
 */
export function resolveFolderChatIdsForBadge(
  folder: WorkspaceFolderForRail,
  folderItemsByFolderId: ReadonlyMap<string, FolderItemForClient[]>,
): Set<string> | null | undefined {
  if (isSystemFolderWithoutItemMembership(folder)) {
    return null;
  }
  const items = folderItemsByFolderId.get(folder.id);
  if (items === undefined) {
    return undefined;
  }
  return toChatIdSet(items);
}

function computeFolderUnreadBadge(
  folder: WorkspaceFolderForRail,
  input: FolderUnreadBadgesInput,
): number | undefined {
  const folderChatIds = resolveFolderChatIdsForBadge(folder, input.folderItemsByFolderId);
  if (folderChatIds === undefined) {
    return folder.badge;
  }

  const chats = buildSelectedFolderSidebarChats({
    selectedFolderId: folder.id,
    folderChatIds,
    folderItemsByFolderId: input.folderItemsByFolderId,
    chatsSortedByLastMessage: input.chatsSortedByLastMessage,
    streamsMap: input.streamsMap,
    usersMapForChatInfo: input.usersMapForChatInfo,
    currentUserId: input.currentUserId,
    hideUnknownArchivedStreams: input.hideUnknownArchivedStreams,
    isStreamMuted: input.isStreamMuted,
  });
  const total = sumSidebarChatUnreadBadges(chats);
  return total > 0 ? total : undefined;
}

/** Applies realtime unread badges to rail folders; returns same array reference if unchanged. */
export function applyFolderUnreadBadges(
  folders: readonly WorkspaceFolderForRail[],
  input: FolderUnreadBadgesInput,
): readonly WorkspaceFolderForRail[] {
  let changed = false;
  const nextFolders = folders.map((folder) => {
    const nextBadge = computeFolderUnreadBadge(folder, input);
    if (nextBadge === folder.badge) {
      return folder;
    }
    changed = true;
    return { ...folder, badge: nextBadge };
  });
  return changed ? nextFolders : folders;
}
