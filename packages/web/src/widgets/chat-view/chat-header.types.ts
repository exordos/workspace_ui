/** Direct chat partner data shown in the header. */
export interface ChatHeaderDmPartner {
  avatarUrl?: string | null;
  name: string;
  /** `null` means presence data is unavailable. */
  presenceState: "active" | "idle" | "offline" | null;
  /** Last-seen text shown while the partner is offline. */
  lastSeen?: string;
  /** Custom status with emoji and text. */
  customStatus?: string;
  /** Raw status text or emoji from the active user source. */
  status?: string | null;
  /** Whether the user directory reports a deactivated account. */
  isAccountDeactivated?: boolean;
  /** Shows a temporary typing state instead of presence. */
  isTyping?: boolean;
}

/** Actions shared by channel and direct chat headers. */
export interface ChatHeaderActionsProps {
  /** The call action is hidden when no handler is provided. */
  onCallClick?: () => void;
  onOpenSearch?: () => void;
  onToggleRightPanel?: () => void;
  rightPanelOpen?: boolean;
  /** Label for the right panel action while the panel is closed. */
  infoLabel: string;
}

/** Props shared by channel and direct chat headers. */
export interface ChatHeaderCommonProps {
  onCallClick?: () => void;
  onOpenSearch?: () => void;
  onToggleRightPanel?: () => void;
  rightPanelOpen?: boolean;
  /** Overrides the right panel action label. */
  rightPanelLabel?: string;
}

export interface ChatChannelHeaderProps extends ChatHeaderCommonProps {
  channelName: string;
  topic?: string;
  systemTopic?: boolean;
  participantsCount?: number;
  onlineCount?: number;
  hideTopic?: boolean;
  /** Hides the member and online counts. */
  hideParticipants?: boolean;
  /** Opens channel information from the title. */
  onOpenRightPanel?: () => void;
}

export interface ChatDirectHeaderProps extends ChatHeaderCommonProps {
  partner: ChatHeaderDmPartner;
  /** Opens the partner profile from the header. */
  onOpenPartnerProfile?: () => void;
}
