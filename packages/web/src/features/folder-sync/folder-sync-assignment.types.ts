// Assignment domain contracts for folder-sync (load/toggle chat-to-folder assignment).

/** Placeholder UUID for optimistic checkbox/assignment state before server confirm. */
export const OPTIMISTIC_FOLDER_ASSIGNMENT_ITEM_UUID = "__folder_assignment_pending__";

/** Folder assignment row for folder menu: folder id and optional item UUID. */
export interface FolderAssignmentRow {
  folderUuid: string;
  label: string;
  itemUuid: string | null;
}

/** Input for toggling chat assignment to a folder. */
export interface ToggleAssignmentInput {
  chatId: string;
  folderUuid: string;
  itemUuid: string | null;
}

/** Toggle result: success, final item UUID, and whether optimistic state was rolled back. */
export interface ToggleAssignmentResult {
  ok: boolean;
  folderUuid: string;
  nextItemUuid: string | null;
  removed: boolean;
  rolledBack: boolean;
}
