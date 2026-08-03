import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { resolveMessengerNavigationPath } from "~/shared/lib/last-messenger-route.lib";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { workspaceActivityRoute } from "~/shared/lib/workspace-messenger-route.lib";

export type GlobalNavigationShortcutKey = "mod+1" | "mod+2" | "mod+3" | "mod+4" | "mod+shift+a";
export type GlobalShortcutKey = GlobalNavigationShortcutKey | "mod+shift+t";
export type GlobalShortcutAction =
  | {
      type: "navigate";
      route: string;
    }
  | {
      type: "toggle-theme";
    };

export function resolveGlobalNavigationRoute(
  key: GlobalNavigationShortcutKey,
  _defaultStream: string,
  instanceId?: string | null,
  projectId?: string | null,
): string {
  if (key === "mod+1") {
    const runtimeContext = useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
    return withCurrentOrgRoute(
      resolveMessengerNavigationPath({
        instanceId: instanceId ?? runtimeContext?.instanceId ?? null,
        projectId: projectId ?? runtimeContext?.projectId ?? null,
      }),
    );
  }
  if (key === "mod+2") {
    return withCurrentOrgRoute("/calendar");
  }
  if (key === "mod+3") {
    return withCurrentOrgRoute("/mail");
  }
  if (key === "mod+shift+a") {
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

export function resolveGlobalShortcutAction(
  key: GlobalShortcutKey,
  defaultStream: string,
): GlobalShortcutAction {
  if (key === "mod+shift+t") {
    return { type: "toggle-theme" };
  }
  return {
    type: "navigate",
    route: resolveGlobalNavigationRoute(key, defaultStream),
  };
}
