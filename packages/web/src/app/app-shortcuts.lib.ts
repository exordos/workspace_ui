import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { resolveMessengerNavigationPath } from "~/shared/lib/last-messenger-route.lib";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { workspaceActivityRoute } from "~/shared/lib/workspace-messenger-route.lib";

export type GlobalNavigationActionId =
  | "navigation.messenger"
  | "navigation.calendar"
  | "navigation.mail"
  | "navigation.calls"
  | "navigation.activity";
export function resolveGlobalNavigationRoute(
  key: GlobalNavigationActionId,
  instanceId?: string | null,
  projectId?: string | null,
): string {
  if (key === "navigation.messenger") {
    const runtimeContext = useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
    return withCurrentOrgRoute(
      resolveMessengerNavigationPath({
        instanceId: instanceId ?? runtimeContext?.instanceId ?? null,
        projectId: projectId ?? runtimeContext?.projectId ?? null,
      }),
    );
  }
  if (key === "navigation.calendar") {
    return withCurrentOrgRoute("/calendar");
  }
  if (key === "navigation.mail") {
    return withCurrentOrgRoute("/mail");
  }
  if (key === "navigation.activity") {
    const runtimeContext = useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
    if (runtimeContext != null) {
      return workspaceActivityRoute({
        orgId: runtimeContext.organizationId,
        projectId: runtimeContext.projectId,
        filter: "favorites",
      });
    }
    return withCurrentOrgRoute("/");
  }
  return withCurrentOrgRoute("/calls");
}
