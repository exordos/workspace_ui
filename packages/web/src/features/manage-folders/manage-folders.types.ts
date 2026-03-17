/**
 * Folder management type definitions.
 *
 * Covers CRUD operations on workspace folders — create, rename, recolor, delete.
 * The Workspace API uses UUIDs for folder identity and numeric color values.
 */

export interface CreateFolderInput {
  title: string;
  backgroundColor?: number;
}

export interface UpdateFolderInput {
  title?: string;
  backgroundColor?: number;
}

export interface FolderItem {
  id: string;
  title: string;
  backgroundColor: number;
  createdAt: string;
  updatedAt: string;
}

/** A chat assigned to a workspace folder (returned by GET /folders/:uuid/items/). */
export interface FolderChatAssignment {
  uuid: string;
  chatId: string;
  folderUuid: string;
  createdAt: string;
}
