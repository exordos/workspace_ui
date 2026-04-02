/** Stored in `itemUuid` while add-to-folder is in flight so the checkbox can update immediately. */
export const OPTIMISTIC_FOLDER_ASSIGNMENT_ITEM_UUID = "__folder_assignment_pending__";

export interface FolderAssignment {
  folderUuid: string;
  label: string;
  itemUuid: string | null;
}
