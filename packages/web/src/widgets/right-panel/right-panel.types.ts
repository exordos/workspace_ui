import type { WorkspaceRightPanelInfoView as MessengerWorkspaceRightPanelInfoView } from "~/entities/messenger/messenger-right-panel.lib";

export type WorkspaceRightPanelInfoView = MessengerWorkspaceRightPanelInfoView;

export interface RightPanelProps {
  mode?: "info" | "settings" | "user-menu" | "about" | "builds";
  /** For channels: name and counters */
  title: string;
  participantsCount?: number;
  onlineCount?: number;
  /** Backward-compatible callback for legacy settings opener */
  onOpenSettingsDrawer?: () => void;
  /** Optional callback used by authenticated user menu mode */
  onOpenAboutDrawer?: () => void;
  /** Optional callback used by authenticated user menu mode */
  onOpenBuildsDrawer?: () => void;
  /** Workspace-native info data; when present, the info panel avoids legacy Zulip stores. */
  workspaceInfo?: WorkspaceRightPanelInfoView | null;
}
