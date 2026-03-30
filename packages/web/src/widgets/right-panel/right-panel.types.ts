/** User data for the DM info panel */
export interface RightPanelUserInfo {
  name: string;
  lastSeen?: string;
  status?: string;
  /** Full avatar URL (or relative path — realm will be prepended) */
  avatarUrl?: string | null;
  userId?: number;
  email?: string;
  phone?: string;
  username?: string;
  role?: string;
  timezone?: string;
  dateJoined?: string;
  isBot?: boolean;
  isActive?: boolean;
  profileLink?: string;
  jobTitle?: string;
  manager?: string;
  localTime?: string;
  birthday?: string;
  media?: { photos?: number; videos?: number; files?: number; links?: number };
  commonGroups?: { name: string; lastMessage?: string; unread?: number; slug?: string }[];
}

export interface RightPanelProps {
  mode?: "info" | "settings" | "user-menu" | "about" | "builds";
  /** For channels: name and counters */
  title: string;
  participantsCount?: number;
  onlineCount?: number;
  /** For DMs: user data (when present, shows the user info panel) */
  user?: RightPanelUserInfo;
  /** Navigation callback for common group items */
  onSelectCommonGroup?: (slug: string) => void;
  /** Optional callback to open a direct message with the profile user */
  onOpenDirectMessage?: (userId: number) => void;
  /** Backward-compatible callback for legacy settings opener */
  onOpenSettingsDrawer?: () => void;
  /** Optional callback used by authenticated user menu mode */
  onOpenAboutDrawer?: () => void;
  /** Optional callback used by authenticated user menu mode */
  onOpenBuildsDrawer?: () => void;
}

export type RightPanelInfoProps = Omit<RightPanelProps, "mode">;
