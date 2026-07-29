import type {
  WorkspaceRightPanelDirectPrivateDetailView,
  WorkspaceRightPanelDirectPrivateInfoView,
  WorkspaceRightPanelUserProfileInfoView,
} from "~/entities/messenger/messenger-right-panel.lib";
import type { MessengerUuid } from "~/entities/messenger/messenger.types";
import type { User } from "~/entities/user/user.types";
import type { IconName } from "~/shared/ui/icon";

export type RightPanelUserProfileInfo =
  | WorkspaceRightPanelDirectPrivateInfoView
  | WorkspaceRightPanelUserProfileInfoView;

export interface RightPanelUserProfileProps {
  info: RightPanelUserProfileInfo;
  /** When set, shows a back control (account-menu personal-info subview). */
  onBack?: () => void;
  /** Override the in-panel title; defaults to "Personal info" for own, user name otherwise. */
  headerTitle?: string;
}

export interface RightPanelUserProfileDetailsProps {
  details: WorkspaceRightPanelDirectPrivateDetailView[];
}

export type RightPanelUserProfileActionVariant = "self" | "other";

export interface RightPanelUserProfileActionsProps {
  variant: RightPanelUserProfileActionVariant;
  onFavorites?: () => void;
  onEdit?: () => void;
  onShare?: () => void;
  onMessage?: () => void;
  /** Start a 1:1 call with the profile user (other variant only). */
  onCall?: () => void;
  shareDisabled?: boolean;
  /** True while share-link copy feedback is shown (icon → check). */
  shareCopied?: boolean;
  messagePending?: boolean;
  /** True while opening/creating DM before starting a call. */
  callPending?: boolean;
}

export type RightPanelUserProfileActionGrow = "fill" | "hug";

export interface RightPanelUserProfileActionButtonProps {
  label: string;
  icon: IconName;
  /** Visual glyph size inside the shared 40×40 Figma icon box. */
  iconSize?: number;
  /**
   * `fill` — equal share of remaining row width (Favorites / Share).
   * `hug` — width follows label so longer copy like "Редактировать" fits (Figma middle button).
   */
  grow?: RightPanelUserProfileActionGrow;
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
  /** Mirrors Copyable `data-copy-state` for share success feedback. */
  dataCopyState?: "idle" | "success";
}

export interface RightPanelUserProfileResolvedUser {
  userUuid: MessengerUuid;
  title: string;
  avatarUrl: string | null;
  status: User["status"] | null;
  isOwnProfile: boolean;
  details: WorkspaceRightPanelDirectPrivateDetailView[];
}
