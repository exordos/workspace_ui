import { useCallback } from "react";
import { useShortcut } from "~/shared/lib/shortcuts";
import type { SidebarChat } from "~/shared/types/sidebar-chat";
import type { TopBarSection } from "~/widgets/top-bar/top-bar.types";
import { resolveChatShortcutRoute } from "./layout-chat-shortcuts.lib";
import { resolveShortcutPanelToggle } from "./layout-shortcuts.lib";
import type { NavigateFunction } from "react-router-dom";

export function useLayoutShortcuts(options: {
  enabled: boolean;
  activeSection: TopBarSection;
  rightDrawerOpen: boolean;
  setRightDrawerOpen: (open: boolean) => void;
  setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  sidebarChats: SidebarChat[];
  activeStreamSlug: string | null;
  activeDmIdParam: string | null;
  navigate: NavigateFunction;
}): void {
  const {
    enabled,
    activeSection,
    rightDrawerOpen,
    setRightDrawerOpen,
    setSidebarOpen,
    sidebarChats,
    activeStreamSlug,
    activeDmIdParam,
    navigate,
  } = options;

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((currentOpen) => resolveShortcutPanelToggle(currentOpen, activeSection));
  }, [activeSection, setSidebarOpen]);

  const toggleInfoPanel = useCallback(() => {
    setRightDrawerOpen(resolveShortcutPanelToggle(rightDrawerOpen, activeSection));
  }, [activeSection, rightDrawerOpen, setRightDrawerOpen]);

  const navigateToAdjacent = useCallback(
    (direction: "next" | "prev") => {
      const route = resolveChatShortcutRoute({
        sidebarChats,
        direction,
        activeStreamSlug,
        activeDmIdParam,
      });
      if (!route) return;
      void navigate(route);
    },
    [activeDmIdParam, activeStreamSlug, navigate, sidebarChats],
  );

  const prevChat = useCallback(() => navigateToAdjacent("prev"), [navigateToAdjacent]);
  const nextChat = useCallback(() => navigateToAdjacent("next"), [navigateToAdjacent]);

  useShortcut("mod+\\", toggleSidebar, { context: "global", enabled });
  useShortcut("mod+.", toggleInfoPanel, { context: "global", enabled });
  useShortcut("alt+arrowup", prevChat, {
    context: "sidebar",
    enabled: enabled && sidebarChats.length > 1,
  });
  useShortcut("alt+arrowdown", nextChat, {
    context: "sidebar",
    enabled: enabled && sidebarChats.length > 1,
  });
}
