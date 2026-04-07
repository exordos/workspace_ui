import type { RightDrawerMode } from "~/widgets/right-panel/right-drawer.model";
import type { RightPanelUserInfo } from "~/widgets/right-panel/right-panel.types";

export interface LayoutMainWorkspaceProps {
  shouldShowChatShell: boolean;
  sidebarOpen: boolean;
  rightDrawerOpen: boolean;
  rightDrawerMode: RightDrawerMode;
  onCloseRightDrawer: () => void;
  rightPanelTitle: string;
  participantsCount: number;
  onlineCount: number;
  rightPanelUser: RightPanelUserInfo | undefined;
  onSelectCommonGroup: (slug: string) => void;
  onOpenSettingsDrawer: () => void;
  onOpenAboutDrawer: () => void;
}
