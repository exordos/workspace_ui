/**
 * Pin/unpin API — calls messenger gateway folder endpoints for chat pinning.
 *
 * Pins are folder-scoped: a chat is pinned within a specific folder.
 */

import { isPersistedFolderItemUuid } from "~/features/folder-sync/folder-sync-assignment.lib";
import {
  messengerFolderItemPinPath,
  messengerFolderItemUnpinPath,
  messengerFoldersPostInvoke,
} from "~/shared/api/messenger-folders.internal";
import { guard } from "~/shared/lib/guards";
import { createLogger } from "~/shared/lib/logger";

const log = createLogger("pin:api");

export async function pinChatInFolder(
  folderUuid: string,
  folderItemUuid: string,
): Promise<boolean> {
  guard.nonEmpty(folderUuid, "folderUuid");
  guard.nonEmpty(folderItemUuid, "folderItemUuid");
  if (!isPersistedFolderItemUuid(folderItemUuid)) {
    log.warn("pinChatInFolder:skipped — optimistic or empty item uuid", {
      folderUuid,
      folderItemUuidPrefix: folderItemUuid.slice(0, 40),
    });
    return false;
  }

  try {
    await messengerFoldersPostInvoke(messengerFolderItemPinPath(folderUuid, folderItemUuid));
    return true;
  } catch (err) {
    log.error("Pin error", { error: String(err) });
    return false;
  }
}

export async function unpinChatInFolder(
  folderUuid: string,
  folderItemUuid: string,
): Promise<boolean> {
  guard.nonEmpty(folderUuid, "folderUuid");
  guard.nonEmpty(folderItemUuid, "folderItemUuid");
  if (!isPersistedFolderItemUuid(folderItemUuid)) {
    log.warn("unpinChatInFolder:skipped — optimistic or empty item uuid", {
      folderUuid,
      folderItemUuidPrefix: folderItemUuid.slice(0, 40),
    });
    return false;
  }

  try {
    await messengerFoldersPostInvoke(messengerFolderItemUnpinPath(folderUuid, folderItemUuid));
    return true;
  } catch (err) {
    log.error("Unpin error", { error: String(err) });
    return false;
  }
}
