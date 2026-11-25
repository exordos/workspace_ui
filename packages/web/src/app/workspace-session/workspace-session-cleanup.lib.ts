import { cleanupMessengerSession } from "~/applications/messenger/model/messenger-runtime-mutation.lib";
import { registerWorkspaceSessionCleanup } from "~/entities/workspace-auth/workspace-auth.lib";
import { cleanupUsersSession } from "~/modules/users/users-runtime";
import { createLogger } from "~/shared/lib/logger";

const logger = createLogger("app:workspace-session-cleanup");

// Bind application cache cleanup for both the regular shell and WebView.
export function installWorkspaceSessionCleanup(): () => void {
  return registerWorkspaceSessionCleanup(async (ownerKey, isWriteCurrent) => {
    const results = await Promise.allSettled([
      cleanupMessengerSession(ownerKey, isWriteCurrent),
      cleanupUsersSession(ownerKey, isWriteCurrent),
    ]);
    for (const result of results) {
      if (result.status === "rejected") {
        logger.warn("Workspace owner cleanup failed", {
          errorName: result.reason instanceof Error ? result.reason.name : typeof result.reason,
        });
      }
    }
  });
}
