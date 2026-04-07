/**
 * Public types for the Workspace API client.
 *
 * Implementation lives in `workspace-client.ts`; import types from there or this file
 * so call sites stay stable when the client is split further.
 */

export type WorkspaceFolderSystemType = "created" | "all";

export type WorkspaceFolderRailSystemType = WorkspaceFolderSystemType | "personal" | "channels";

export interface WorkspaceServiceForClient {
  id: string;
  name: string;
  description: string;
  url: string;
  iconUrl: string | null;
}

/** Folder shape for the FolderRail component. */
export interface WorkspaceFolderForRail {
  id: string;
  label: string;
  backgroundColor: number;
  badge?: number;
  systemType?: WorkspaceFolderRailSystemType;
}

export interface FolderItemForClient {
  uuid: string;
  chatId: string;
  folderUuid: string;
  orderIndex: number;
  pinnedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
