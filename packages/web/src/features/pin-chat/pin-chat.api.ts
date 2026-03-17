/**
 * Pin/unpin API — calls Workspace API for chat pinning.
 *
 * Pins are folder-scoped: a chat is pinned within a specific folder.
 */

import { workspaceApi } from "~/shared/api/client";
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
    const res = await workspaceApi.post(
      `/folders/${folderUuid}/items/${folderItemUuid}/actions/pin/invoke`,
      {},
    );
    if (res.ok) {
      log.info("Chat pinned", { folderUuid, folderItemUuid });
      return true;
    }
    log.warn("Pin failed", { status: res.status });
    return false;
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
    const res = await workspaceApi.post(
      `/folders/${folderUuid}/items/${folderItemUuid}/actions/unpin/invoke`,
      {},
    );
    if (res.ok) {
      log.info("Chat unpinned", { folderUuid, folderItemUuid });
      return true;
    }
    log.warn("Unpin failed", { status: res.status });
    return false;
  } catch (err) {
    log.error("Unpin error", { error: String(err) });
    return false;
  }
}
