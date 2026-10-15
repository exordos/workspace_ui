import type { RightPanelAccountScreen } from "./right-panel.types";

export interface RightPanelUserMenuProps {
  accountScreen: Extract<RightPanelAccountScreen, "root" | "settings" | "appearance">;
  onAccountScreenChange: (
    screen: Extract<RightPanelAccountScreen, "root" | "settings" | "appearance">,
  ) => void;
  onOpenAboutDrawer?: () => void;
  onOpenPersonalInfo?: () => void;
}
