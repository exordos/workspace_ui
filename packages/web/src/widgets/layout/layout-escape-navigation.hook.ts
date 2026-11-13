import { useEffect, type RefObject } from "react";
import { isHotkeyBlockedByModal } from "~/shared/lib/hotkeys";
import {
  parseWorkspaceMessengerRoute,
  workspaceInboxRoute,
} from "~/shared/lib/workspace-messenger-route.lib";
import type { SidebarSearchHandle } from "~/widgets/sidebar/sidebar.types";
import {
  isInteractiveElementFocused,
  resolveLayoutEscapeKeyDown,
} from "./layout-escape-navigation.lib";
import type { NavigateFunction } from "react-router-dom";

export function useLayoutEscapeNavigation(options: {
  enabled: boolean;
  pathname: string;
  navigate: NavigateFunction;
  sidebarSearchRef: RefObject<SidebarSearchHandle | null>;
}): void {
  const { enabled, pathname, navigate, sidebarSearchRef } = options;

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing || event.repeat)
        return;
      const modalOpen = isHotkeyBlockedByModal();
      if (!modalOpen && sidebarSearchRef.current?.cancel()) {
        event.preventDefault();
        return;
      }
      const action = resolveLayoutEscapeKeyDown({
        key: event.key,
        defaultPrevented: event.defaultPrevented,
        pathname,
        interactiveElementFocused: isInteractiveElementFocused(),
        modalOpen,
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
  }, [enabled, navigate, pathname, sidebarSearchRef]);
}
