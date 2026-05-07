import { formatLastSeen } from "~/shared/lib/format";
import { getRoleLabel, parseRole } from "~/shared/lib/roles";
import { isValidRealmUrl } from "~/shared/lib/validation";
import type { SidebarChat } from "~/shared/types/sidebar-chat";
import type { RightPanelUserInfo } from "~/widgets/right-panel/right-panel.types";
import type {
  BuildRightPanelUserInfoOptions,
  RightPanelCommonGroup,
  RightPanelPresenceLike,
} from "./layout-right-panel.types";

export type { RightPanelCommonGroup };

export function formatRightPanelLocalTime(
  timezone: string | undefined,
  now: Date = new Date(),
): string | undefined {
  if (!timezone || timezone.trim() === "") return undefined;
  try {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: timezone,
    }).format(now);
  } catch {
    return undefined;
  }
}

export function buildRightPanelCommonGroups(
  dms: Extract<SidebarChat, { type: "dm" }>[],
  partnerUserId: number,
  currentDmSlug?: string,
  maxItems = 6,
): RightPanelCommonGroup[] {
  return dms
    .filter((dm) => dm.isGroup && dm.slug !== currentDmSlug && dm.userIds?.includes(partnerUserId))
    .sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0))
    .slice(0, maxItems)
    .map((dm) => ({
      name: dm.name,
      lastMessage: dm.lastMessage,
      unread: dm.badge,
      slug: dm.slug,
    }));
}

export function formatRightPanelLastSeen(
  presence: RightPanelPresenceLike | undefined,
): string | undefined {
  if (presence == null) return undefined;
  return formatLastSeen(presence.timestamp, presence.status);
}

export function buildRightPanelUserInfo(
  options: BuildRightPanelUserInfoOptions,
): RightPanelUserInfo | undefined {
  const {
    userFromStore,
    detailedProfile,
    dmChat,
    rightDrawerTargetUserId,
    userStatusLabel,
    currentInstanceRealm,
    media,
    commonGroups,
  } = options;

  const userPresence = userFromStore?.presence;

  const profileForRightPanelUser =
    rightDrawerTargetUserId != null && detailedProfile?.userId === rightDrawerTargetUserId
      ? detailedProfile
      : undefined;

  if (
    profileForRightPanelUser != null ||
    userFromStore != null ||
    rightDrawerTargetUserId != null
  ) {
    const profileName = profileForRightPanelUser?.fullName?.trim();
    const userName = userFromStore?.full_name?.trim();
    const dmName = dmChat?.name?.trim();
    const resolvedName =
      profileName != null && profileName.length > 0
        ? profileName
        : userName != null && userName.length > 0
          ? userName
          : dmName != null && dmName.length > 0
            ? dmName
            : rightDrawerTargetUserId != null
              ? `User #${rightDrawerTargetUserId}`
              : "";

    const profileAvatarUrl = profileForRightPanelUser?.avatarUrl;
    const resolvedAvatarUrl =
      userFromStore?.avatar_url ??
      (profileAvatarUrl != null && profileAvatarUrl.length > 0 ? profileAvatarUrl : undefined);

    const profileEmail = profileForRightPanelUser?.email?.trim();
    const userEmail = userFromStore?.email?.trim();
    const resolvedEmail =
      profileEmail != null && profileEmail.length > 0
        ? profileEmail
        : userEmail != null && userEmail.length > 0
          ? userEmail
          : undefined;

    const resolvedUserId =
      profileForRightPanelUser?.userId ?? userFromStore?.user_id ?? rightDrawerTargetUserId;

    const realm = currentInstanceRealm?.trim();
    const profileLink =
      resolvedUserId != null && realm != null && realm.length > 0 && isValidRealmUrl(realm)
        ? `${realm.replace(/\/+$/, "")}/#user/${resolvedUserId}`
        : undefined;

    const role =
      profileForRightPanelUser?.role != null
        ? getRoleLabel(parseRole(profileForRightPanelUser.role))
        : userFromStore?.role != null
          ? getRoleLabel(parseRole(userFromStore.role))
          : undefined;

    return {
      name: resolvedName,
      status: userStatusLabel,
      lastSeen: formatRightPanelLastSeen(userPresence),
      avatarUrl: resolvedAvatarUrl,
      userId: resolvedUserId ?? undefined,
      email: resolvedEmail,
      username: userFromStore?.email ?? undefined,
      role,
      timezone: profileForRightPanelUser?.timezone ?? undefined,
      dateJoined: profileForRightPanelUser?.dateJoined ?? undefined,
      isBot: profileForRightPanelUser?.isBot ?? undefined,
      isActive: profileForRightPanelUser?.isActive ?? undefined,
      profileLink,
      phone: profileForRightPanelUser?.phone ?? undefined,
      jobTitle: profileForRightPanelUser?.jobTitle ?? undefined,
      manager: profileForRightPanelUser?.manager ?? undefined,
      birthday: profileForRightPanelUser?.birthday ?? undefined,
      localTime: formatRightPanelLocalTime(profileForRightPanelUser?.timezone),
      media,
      commonGroups,
    };
  }

  if (dmChat && !dmChat.isGroup) {
    return {
      name: dmChat.name,
      status: userStatusLabel,
      lastSeen: formatRightPanelLastSeen(userPresence),
      commonGroups,
    };
  }

  return undefined;
}
