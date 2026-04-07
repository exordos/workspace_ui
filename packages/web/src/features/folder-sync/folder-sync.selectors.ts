import { resolveSelectedFolderSidebarLoading } from "./folder-sync-sidebar-chats.lib";

interface FolderSyncSidebarLoadingState {
  selectedFolderId: string;
  loading: boolean;
}

export function selectSidebarChatsLoading(state: FolderSyncSidebarLoadingState): boolean {
  // Единая вычисляемая логика loading для списка чатов в выбранной папке.
  return resolveSelectedFolderSidebarLoading(state.selectedFolderId, state.loading);
}
