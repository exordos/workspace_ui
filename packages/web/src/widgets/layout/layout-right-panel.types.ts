import type { WorkspaceUserPresenceStatus } from "~/shared/api/messenger.types";
import type { UserId } from "~/shared/lib/user-id.lib";
import type { RightPanelUserInfo } from "~/widgets/right-panel/right-panel.types";

export interface RightPanelPresenceLike {
  status?: WorkspaceUserPresenceStatus;
  timestamp: number;
}

export interface RightPanelUserFromStoreLike {
  user_id?: UserId;
  full_name?: string;
  email?: string;
  avatar_url?: string | null;
  presence?: RightPanelPresenceLike;
  role?: number;
  is_active?: boolean;
}

export interface RightPanelDetailedProfileLike {
  userId: UserId;
  fullName?: string;
  email?: string;
  avatarUrl?: string | null;
  role?: number;
  timezone?: string;
  dateJoined?: string;
  isBot?: boolean;
  isActive?: boolean;
  phone?: string;
  jobTitle?: string;
  manager?: string;
  birthday?: string;
}

export interface RightPanelDmChatLike {
  name: string;
  slug?: string;
}

export interface BuildRightPanelUserInfoOptions {
  userFromStore: RightPanelUserFromStoreLike | undefined;
  detailedProfile: RightPanelDetailedProfileLike | null | undefined;
  dmChat: RightPanelDmChatLike | undefined;
  rightDrawerTargetUserId: UserId | null | undefined;
  userStatusLabel: string | undefined;
  currentInstanceRealm: string | undefined;
  media: RightPanelUserInfo["media"] | undefined;
}
