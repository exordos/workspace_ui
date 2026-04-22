/**
 * Decides when Layout should run folder-sync bootstrap for the active Zulip instance.
 *
 * Folders use Workspace REST credentials from the instance store and do not depend on the
 * chat-list bootstrap finishing; gating only on `currentUserStatus === "ready"` delays rail
 * updates after org switch while chats reload, so the sidebar can show the previous org's folders.
 */

export function shouldBootstrapFolderSyncForLayout(params: {
  folderSyncInstanceId: string | null;
  currentInstanceId: string;
  currentUserStatus: "idle" | "loading" | "ready" | "error";
}): boolean {
  const { folderSyncInstanceId, currentInstanceId, currentUserStatus } = params;
  if (currentInstanceId.trim().length === 0) {
    return false;
  }
  const switchedInstance = folderSyncInstanceId !== currentInstanceId;
  if (switchedInstance) {
    return true;
  }
  return currentUserStatus === "ready";
}
