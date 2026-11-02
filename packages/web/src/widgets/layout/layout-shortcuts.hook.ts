import { useCallback } from "react";
import { useAppHotkey } from "~/shared/lib/hotkeys";
import type { TopBarSection } from "~/widgets/top-bar/top-bar.types";
import { resolveShortcutPanelToggle } from "./layout-shortcuts.lib";

export function useLayoutShortcuts(options: {
  enabled: boolean;
  activeSection: TopBarSection;
  rightDrawerOpen: boolean;
  setRightDrawerOpen: (open: boolean) => void;
  setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
}): void {
  const { enabled, activeSection, rightDrawerOpen, setRightDrawerOpen, setSidebarOpen } = options;

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((currentOpen) => resolveShortcutPanelToggle(currentOpen, activeSection));
  }, [activeSection, setSidebarOpen]);

  const toggleInfoPanel = useCallback(() => {
    setRightDrawerOpen(resolveShortcutPanelToggle(rightDrawerOpen, activeSection));
  }, [activeSection, rightDrawerOpen, setRightDrawerOpen]);

  useAppHotkey("interface.sidebar", toggleSidebar, { enabled });
  useAppHotkey("interface.infoPanel", toggleInfoPanel, { enabled });
}
