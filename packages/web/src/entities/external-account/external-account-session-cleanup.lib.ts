import { deleteWorkspaceExternalAccountOwnerCache } from "~/shared/lib/workspace-external-account-cache-db";

// Remove an owner's external-account snapshot only while the auth removal is current.
export async function cleanupExternalAccountSession(
  ownerKey: string,
  isWriteCurrent: () => boolean,
): Promise<void> {
  await deleteWorkspaceExternalAccountOwnerCache(ownerKey, isWriteCurrent);
}
