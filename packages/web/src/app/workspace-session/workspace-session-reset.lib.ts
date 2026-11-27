import { quiesceMessengerOwnerWorkForColdStart } from "~/applications/messenger/model/messenger-runtime-mutation.lib";
import { suspendWorkspaceRuntimeForColdStart } from "~/entities/workspace-auth/workspace-auth.model";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";

const activeRuntimeStoppers = new Set<() => void>();

// Register the mounted session host so reset can stop its transports before erasing cursors.
export function registerWorkspaceColdStartStopper(stop: () => void): () => void {
  activeRuntimeStoppers.add(stop);
  return () => {
    activeRuntimeStoppers.delete(stop);
  };
}

// Revoke local writers synchronously. A stalled request cannot delay cold start.
export function prepareWorkspaceColdStart(): void {
  try {
    suspendWorkspaceRuntimeForColdStart();
  } catch (error) {
    reportUnexpectedError("workspace-cold-start:suspend", error);
  }
  for (const stop of activeRuntimeStoppers) {
    try {
      stop();
    } catch (error) {
      reportUnexpectedError("workspace-cold-start:stop", error);
    }
  }
  quiesceMessengerOwnerWorkForColdStart();
}
