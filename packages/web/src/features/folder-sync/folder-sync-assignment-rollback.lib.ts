import type { FolderItemForClient, WorkspaceFolderForRail } from "~/shared/api/workspace-client";
import { toChatIdSet } from "./folder-sync-sidebar-chats.lib";
import { shouldLoadFolderItemsForSelection } from "./folder-sync.lib";

export interface OptimisticFolderAssignmentParams {
  folderUuid: string;
  chatId: string;
  itemUuid: string | null;
  isRemove: boolean;
  removeFolderAssignmentItem: (
    items: FolderItemForClient[],
    chatId: string,
    itemUuid: string,
  ) => FolderItemForClient[];
  upsertOptimisticFolderItem: (
    items: FolderItemForClient[],
    folderUuid: string,
    chatId: string,
  ) => FolderItemForClient[];
  markFolderAsStale: (staleFolderIds: ReadonlySet<string>, folderUuid: string) => Set<string>;
}

export interface FolderAssignmentRollbackContext {
  folderUuid: string;
  hadFolderCache: boolean;
  previousItems: FolderItemForClient[];
  wasStaleBefore: boolean;
}

export interface FolderSyncRollbackSlice {
  folderItemsByFolderId: Map<string, FolderItemForClient[]>;
  staleFolderIds: Set<string>;
  selectedFolderId: string | null;
  folders: WorkspaceFolderForRail[];
}

export function sliceAfterFolderAssignmentRollback(
  state: FolderSyncRollbackSlice,
  context: FolderAssignmentRollbackContext,
  markStaleAfterRollback: boolean,
): Partial<FolderSyncRollbackSlice & { selectedFolderChatIds: Set<string> }> {
  const { folderUuid, hadFolderCache, previousItems, wasStaleBefore } = context;
  const nextMap = new Map(state.folderItemsByFolderId);
  if (hadFolderCache) {
    nextMap.set(folderUuid, previousItems);
  } else {
    nextMap.delete(folderUuid);
  }

  const nextStaleFolderIds = new Set(state.staleFolderIds);
  if (wasStaleBefore || markStaleAfterRollback) {
    nextStaleFolderIds.add(folderUuid);
  } else {
    nextStaleFolderIds.delete(folderUuid);
  }

  const shouldPatchSelection =
    state.selectedFolderId === folderUuid &&
    shouldLoadFolderItemsForSelection(state.folders, folderUuid);

  return {
    folderItemsByFolderId: nextMap,
    staleFolderIds: nextStaleFolderIds,
    ...(shouldPatchSelection
      ? {
          selectedFolderChatIds: hadFolderCache ? toChatIdSet(previousItems) : new Set<string>(),
        }
      : {}),
  };
}

export function sliceAfterOptimisticFolderAssignment(
  state: FolderSyncRollbackSlice,
  params: OptimisticFolderAssignmentParams,
): Partial<FolderSyncRollbackSlice & { selectedFolderChatIds: Set<string> }> {
  const { folderUuid, chatId, itemUuid, isRemove } = params;
  const currentItems = state.folderItemsByFolderId.get(folderUuid) ?? [];
  const nextItems = isRemove
    ? params.removeFolderAssignmentItem(currentItems, chatId, itemUuid ?? "")
    : params.upsertOptimisticFolderItem(currentItems, folderUuid, chatId);
  const nextMap = new Map(state.folderItemsByFolderId);
  nextMap.set(folderUuid, nextItems);
  const nextStaleFolderIds = params.markFolderAsStale(state.staleFolderIds, folderUuid);
  const shouldPatchSelection =
    state.selectedFolderId === folderUuid &&
    shouldLoadFolderItemsForSelection(state.folders, folderUuid);
  return {
    folderItemsByFolderId: nextMap,
    staleFolderIds: nextStaleFolderIds,
    ...(shouldPatchSelection ? { selectedFolderChatIds: toChatIdSet(nextItems) } : {}),
  };
}
