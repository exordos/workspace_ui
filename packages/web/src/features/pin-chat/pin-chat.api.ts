/**
 * Pin/unpin API — calls Workspace API for chat pinning.
 *
 * Pins are folder-scoped: a chat is pinned within a specific folder.
 */

import {
  pinV1FoldersFolderUuidItemsFolderItemUuidActionsPinInvoke,
  unpinV1FoldersFolderUuidItemsFolderItemUuidActionsUnpinInvoke,
} from "workspace-api/workspace-api.generated";
import { guard } from "~/shared/lib/guards";
import { createLogger } from "~/shared/lib/logger";

const log = createLogger("pin:api");

export async function pinChatInFolder(
  folderUuid: string,
  folderItemUuid: string,
): Promise<boolean> {
  guard.nonEmpty(folderUuid, "folderUuid");
  guard.nonEmpty(folderItemUuid, "folderItemUuid");

  try {
    await pinV1FoldersFolderUuidItemsFolderItemUuidActionsPinInvoke(folderUuid, folderItemUuid);
    log.info("Chat pinned", { folderUuid, folderItemUuid });
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

  try {
    await unpinV1FoldersFolderUuidItemsFolderItemUuidActionsUnpinInvoke(folderUuid, folderItemUuid);
    log.info("Chat unpinned", { folderUuid, folderItemUuid });
    return true;
  } catch (err) {
    log.error("Unpin error", { error: String(err) });
    return false;
  }
}
