import { OPTIMISTIC_FOLDER_ASSIGNMENT_ITEM_UUID } from "./folder-sync-assignment.types";

/** True when folder item UUID exists on the server (not an optimistic assignment placeholder). */
export function isPersistedFolderItemUuid(folderItemUuid: string): boolean {
  const trimmed = folderItemUuid.trim();
  if (trimmed.length === 0) {
    return false;
  }
  return !trimmed.startsWith(OPTIMISTIC_FOLDER_ASSIGNMENT_ITEM_UUID);
}
