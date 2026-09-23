import type {
  RightDrawerAccountScreen,
  RightDrawerMode,
} from "~/widgets/right-panel/right-drawer.model";
import type { WorkspaceRightPanelInfoView } from "~/widgets/right-panel/right-panel.types";

export interface LayoutMainWorkspaceProps {
  shouldShowChatShell: boolean;
  pathname: string;
  sidebarOpen: boolean;
  rightDrawerOpen: boolean;
  rightDrawerMode: RightDrawerMode;
  rightDrawerAccountScreen: RightDrawerAccountScreen | null;
  rightDrawerCanGoBack: boolean;
  onCloseRightDrawer: () => void;
  /** Shell back control for the active layer's internal screen history. */
  onBackRightDrawer?: () => void;
  /** Shell title shown next to the drawer close button. */
  rightDrawerTitle: string;
  rightPanelTitle: string;
  participantsCount: number;
  onlineCount: number;
  workspaceRightPanelInfo: WorkspaceRightPanelInfoView | null;
  onOpenSettingsDrawer: () => void;
  onOpenAboutDrawer: () => void;
  onOpenPersonalInfoDrawer?: () => void;
  onAccountScreenChange: (screen: RightDrawerAccountScreen) => void;
}
