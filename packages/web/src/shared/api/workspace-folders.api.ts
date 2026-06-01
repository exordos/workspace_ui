/**
 * Workspace API — folder rail and folder item assignment.
 *
 * Implementation lives in `workspace-client.ts` (Orval + deduped GET).
 * Import folder operations from this module for new code.
 */
export {
  addChatToFolder,
  clearInFlightWorkspaceFolderRequests,
  getFolders,
  mapWorkspaceFolderItems,
  mapWorkspaceFoldersToRail,
  removeChatFromFolder,
  updateFolderItemOrder,
  type FolderItemForClient,
  type WorkspaceFolder,
  type WorkspaceFolderForRail,
  type WorkspaceFolderRailSystemType,
} from "./workspace-client";
