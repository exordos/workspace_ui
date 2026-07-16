/** Clears the current account cache after the server explicitly expires its event cursor. */
import { deleteChatListSnapshotRow } from "~/shared/lib/chat-list-snapshot-db";
import { deleteFoldersSnapshotRow } from "~/shared/lib/folders-snapshot-db";
import { deleteMessageCacheForInstance } from "~/shared/lib/message-cache-db";
import { resolveCurrentMessengerCacheAccountScope } from "~/shared/lib/messenger-cache-scope.lib";
import { deleteMessengerEntitiesSnapshotsByAccount } from "~/shared/lib/messenger-entities-snapshot-db";
import { deleteMuteSnapshotRow } from "~/shared/lib/mute-snapshot-db";
import { deleteUsersDirectoryRow } from "~/shared/lib/users-directory-snapshot-db";
import {
  clearWorkspaceFileCachePartition,
  resolveCurrentWorkspaceFileCacheScope,
} from "~/shared/lib/workspace-file-blob-cache";

export async function clearMessengerCachesForExpiredCursor(instanceId: string): Promise<void> {
  const accountScope = resolveCurrentMessengerCacheAccountScope()?.accountScope;
  const fileCacheScope = resolveCurrentWorkspaceFileCacheScope();
  await Promise.all([
    deleteChatListSnapshotRow(instanceId),
    deleteFoldersSnapshotRow(instanceId),
    deleteMessageCacheForInstance(instanceId),
    deleteMuteSnapshotRow(instanceId),
    deleteUsersDirectoryRow(instanceId),
    ...(accountScope == null ? [] : [deleteMessengerEntitiesSnapshotsByAccount(accountScope)]),
    ...(fileCacheScope == null ? [] : [clearWorkspaceFileCachePartition(fileCacheScope)]),
  ]);
}
