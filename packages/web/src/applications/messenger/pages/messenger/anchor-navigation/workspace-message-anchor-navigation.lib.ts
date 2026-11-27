import { workspaceRuntimeOwnerKey } from "~/platform/sessions/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/platform/sessions/workspace-runtime.types";
import type { WorkspaceMessageAnchorNavigationIntent } from "./workspace-message-anchor-navigation.types";

export function isWorkspaceMessageAnchorIntentCurrent({
  intent,
  activeIntent,
  runtimeContext,
  signal,
}: {
  intent: WorkspaceMessageAnchorNavigationIntent;
  activeIntent: WorkspaceMessageAnchorNavigationIntent | null;
  runtimeContext: WorkspaceRuntimeContext | null;
  signal: AbortSignal;
}): boolean {
  return (
    !signal.aborted &&
    activeIntent?.id === intent.id &&
    runtimeContext != null &&
    workspaceRuntimeOwnerKey(runtimeContext) === intent.ownerKey &&
    runtimeContext.runtimeGeneration === intent.runtimeGeneration
  );
}

export function supersedeWorkspaceMessageAnchorIntent(
  intent: WorkspaceMessageAnchorNavigationIntent | null,
): WorkspaceMessageAnchorNavigationIntent | null {
  return intent == null ? null : { ...intent, phase: "superseded" };
}
