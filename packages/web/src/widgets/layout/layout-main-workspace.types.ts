import type { RightDrawerMode } from "~/widgets/right-panel/right-drawer.model";
import type { WorkspaceRightPanelInfoView } from "~/widgets/right-panel/right-panel.types";

export interface LayoutMainWorkspaceProps {
  shouldShowChatShell: boolean;
  pathname: string;
  sidebarOpen: boolean;
  rightDrawerOpen: boolean;
  rightDrawerMode: RightDrawerMode;
  onCloseRightDrawer: () => void;
  /** Shell title shown next to the drawer close button. */
  rightDrawerTitle: string;
  rightPanelTitle: string;
  participantsCount: number;
  onlineCount: number;
  workspaceRightPanelInfo: WorkspaceRightPanelInfoView | null;
  onOpenSettingsDrawer: () => void;
  onOpenAboutDrawer: () => void;
  onOpenBuildsDrawer: () => void;
}
