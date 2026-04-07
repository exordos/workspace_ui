import type { RightPanelUserInfo } from "~/widgets/right-panel/right-panel.types";

export interface RightPanelCommonGroup {
  name: string;
  lastMessage?: string;
  unread?: number;
  slug?: string;
}

export interface RightPanelPresenceLike {
  status?: "active" | "idle";
  timestamp: number;
}

export interface RightPanelUserFromStoreLike {
  user_id?: number;
  full_name?: string;
  email?: string;
  avatar_url?: string | null;
  presence?: RightPanelPresenceLike;
  role?: number;
}

export interface RightPanelDetailedProfileLike {
  userId: number;
  fullName?: string;
  email?: string;
  avatarUrl?: string;
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
  isGroup?: boolean;
}

export interface BuildRightPanelUserInfoOptions {
  userFromStore: RightPanelUserFromStoreLike | undefined;
  detailedProfile: RightPanelDetailedProfileLike | null | undefined;
  dmChat: RightPanelDmChatLike | undefined;
  rightDrawerTargetUserId: number | null | undefined;
  userStatusLabel: string | undefined;
  currentInstanceRealm: string | undefined;
  media: RightPanelUserInfo["media"] | undefined;
  commonGroups: RightPanelUserInfo["commonGroups"] | undefined;
}
