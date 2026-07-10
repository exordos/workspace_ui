import { useEffect } from "react";
import {
  parseWorkspaceMessengerRoute,
  workspaceInboxRoute,
} from "~/shared/lib/workspace-messenger-route.lib";
import {
  isInteractiveElementFocused,
  isModalShortcutContextOpen,
  resolveLayoutEscapeKeyDown,
} from "./layout-escape-navigation.lib";
import type { NavigateFunction } from "react-router-dom";

export function useLayoutEscapeNavigation(options: {
  enabled: boolean;
  pathname: string;
  navigate: NavigateFunction;
}): void {
  const { enabled, pathname, navigate } = options;

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const action = resolveLayoutEscapeKeyDown({
        key: event.key,
        defaultPrevented: event.defaultPrevented,
        pathname,
        interactiveElementFocused: isInteractiveElementFocused(),
        modalOpen: isModalShortcutContextOpen(),
      });
      if (action !== "navigate-inbox") return;

      event.preventDefault();
      const workspaceRoute = parseWorkspaceMessengerRoute(pathname);
      const target =
        workspaceRoute != null
          ? workspaceInboxRoute(workspaceRoute.orgId, workspaceRoute.projectId)
          : "/";
      void navigate(target);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [enabled, navigate, pathname]);
}
