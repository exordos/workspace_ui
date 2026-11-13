import { useCallback, type RefObject } from "react";
import { flushSync } from "react-dom";
import { useAppHotkey } from "~/shared/lib/hotkeys";
import type { SidebarSearchHandle } from "~/widgets/sidebar/sidebar.types";
import type { TopBarSection } from "~/widgets/top-bar/top-bar.types";
import { resolveShortcutPanelToggle } from "./layout-shortcuts.lib";

export function useLayoutShortcuts(options: {
  enabled: boolean;
  activeSection: TopBarSection;
  rightDrawerOpen: boolean;
  setRightDrawerOpen: (open: boolean) => void;
  setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  sidebarOpen: boolean;
  sidebarSearchRef: RefObject<SidebarSearchHandle | null>;
}): void {
  const {
    enabled,
    activeSection,
    rightDrawerOpen,
    setRightDrawerOpen,
    setSidebarOpen,
    sidebarOpen,
    sidebarSearchRef,
  } = options;

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((currentOpen) => resolveShortcutPanelToggle(currentOpen, activeSection));
  }, [activeSection, setSidebarOpen]);

  const toggleInfoPanel = useCallback(() => {
    setRightDrawerOpen(resolveShortcutPanelToggle(rightDrawerOpen, activeSection));
  }, [activeSection, rightDrawerOpen, setRightDrawerOpen]);

  useAppHotkey("interface.sidebar", toggleSidebar, { enabled });
  useAppHotkey("interface.infoPanel", toggleInfoPanel, { enabled });
  useAppHotkey(
    "navigation.chatSearch",
    () => {
      // Mount the sidebar before using its search controls.
      if (!sidebarOpen) flushSync(() => setSidebarOpen(true));
      sidebarSearchRef.current?.toggle({ openOnly: !sidebarOpen });
    },
    {
      enabled,
      allowInputTarget: (element) =>
        sidebarSearchRef.current?.isSearchInput(element) === true ||
        element.closest('[data-focus-zone="composer"]') != null,
    },
  );
}
