import type { UserStatus } from "~/entities/user/user.model";
import type { PresenceVisual } from "~/shared/ui/presence-indicator";

/** DM partner data for the chat header: avatar, name, online status */
export interface ChatHeaderDmPartner {
  avatarUrl?: string | null;
  name: string;
  /** active = online, idle = away, do_not_disturb = DND, offline = offline, null = no data */
  presenceState: PresenceVisual;
  /** "last seen N ago" text when offline */
  lastSeen?: string;
  /** Custom Workspace status (emoji + text). */
  customStatus?: string;
  /** Raw custom Workspace status for rich custom emoji rendering. */
  status?: UserStatus | null;
  /** When true, Workspace directory reports the partner account as deactivated (`is_active === false`). */
  isAccountDeactivated?: boolean;
  /** Shows transient typing status in DM header when true. */
  isTyping?: boolean;
}

export interface ChatHeaderProps {
  channelName: string;
  topic?: string;
  systemTopic?: boolean;
  participantsCount?: number;
  onlineCount?: number;
  onOpenSearch?: () => void;
  onToggleRightPanel?: () => void;
  /** Opens right info panel from header content clicks (channel/group title area). */
  onOpenRightPanel?: () => void;
  rightPanelOpen?: boolean;
  /** Button label for the panel (e.g. "Contact info" in a DM) */
  rightPanelLabel?: string;
  hideTopic?: boolean;
  /** Hide the "N members, M online" line (for DMs) */
  hideParticipants?: boolean;
  /** "Call" button (DM only). On click, a Jitsi link is created and sent as a message. */
  onCallClick?: () => void;
  /** For DMs: show avatar, name and presence status instead of channelName */
  dmPartner?: ChatHeaderDmPartner;
  /** Opens DM partner profile in the right info panel when avatar is clicked. */
  onDmPartnerClick?: () => void;
}
