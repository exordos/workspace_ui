import type { WorkspaceRightPanelInfoView as MessengerWorkspaceRightPanelInfoView } from "~/entities/messenger/messenger-right-panel.lib";
import type { EncryptedChatInfoScreen } from "~/features/encrypted-chat-info/encrypted-chat-info.types";
import type { RightDrawerAccountScreen } from "./right-drawer.model";

export type WorkspaceRightPanelInfoView = MessengerWorkspaceRightPanelInfoView;

export type RightPanelAccountScreen = RightDrawerAccountScreen;

export interface RightPanelProps {
  onClose?: () => void;
  mode?: "info" | "settings" | "user-menu" | "about" | "personal-info";
  /** Serializable active screen for the account drawer flow. */
  accountScreen: RightPanelAccountScreen;
  chatScreen?: EncryptedChatInfoScreen;
  selectedLocalKeyUuid?: string;
  onChatScreenChange?: (screen: EncryptedChatInfoScreen, keyUuid?: string) => void;
  /** Reports account screen navigation to the owner of the drawer stack. */
  onAccountScreenChange: (screen: RightPanelAccountScreen) => void;
  /** For channels: name and counters */
  title: string;
  participantsCount?: number;
  onlineCount?: number;
  /** Backward-compatible callback for legacy settings opener */
  onOpenSettingsDrawer?: () => void;
  /** Optional callback used by authenticated user menu mode */
  onOpenAboutDrawer?: () => void;
  /** Opens personal-info as a dedicated drawer mode (shell title + back). */
  onOpenPersonalInfoDrawer?: () => void;
  /** Workspace-native info data; when present, the info panel avoids legacy Zulip stores. */
  workspaceInfo?: WorkspaceRightPanelInfoView | null;
}
