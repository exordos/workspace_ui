import type { FolderItemForClient, WorkspaceFolderForRail } from "~/shared/api/workspace-client";
import { resolveSelectedFolderSidebarLoading } from "./folder-sync-sidebar-chats.lib";
import { sidebarFolderItemsMembershipPending } from "./folder-sync.lib";

interface FolderSyncSidebarLoadingState {
  selectedFolderId: string;
  loading: boolean;
  folders: readonly WorkspaceFolderForRail[];
  folderItemsByFolderId: ReadonlyMap<string, FolderItemForClient[]>;
}

export function selectSidebarChatsLoading(state: FolderSyncSidebarLoadingState): boolean {
  // Единая вычисляемая логика loading для списка чатов в выбранной папке.
  if (resolveSelectedFolderSidebarLoading(state.selectedFolderId, state.loading)) {
    return true;
  }
  return sidebarFolderItemsMembershipPending(
    state.folders,
    state.selectedFolderId,
    state.folderItemsByFolderId,
  );
}
