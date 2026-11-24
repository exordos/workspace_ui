import { cleanupMessengerSession } from "~/applications/messenger/model/messenger-runtime-mutation.lib";
import { registerWorkspaceSessionCleanup } from "~/entities/workspace-auth/workspace-auth.lib";

// Bind application cache cleanup for both the regular shell and WebView.
export function installWorkspaceSessionCleanup(): () => void {
  return registerWorkspaceSessionCleanup(cleanupMessengerSession);
}
