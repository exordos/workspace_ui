import { resolveMessengerNavigationPath } from "~/shared/lib/last-messenger-route.lib";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";

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
  defaultStream: string,
  instanceId?: string | null,
): string {
  if (key === "mod+1") {
    return withCurrentOrgRoute(resolveMessengerNavigationPath(instanceId ?? null, defaultStream));
  }
  if (key === "mod+2") {
    return withCurrentOrgRoute("/calendar");
  }
  if (key === "mod+3") {
    return withCurrentOrgRoute("/mail");
  }
  if (key === "mod+shift+a") {
    return withCurrentOrgRoute("/activity/starred");
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
