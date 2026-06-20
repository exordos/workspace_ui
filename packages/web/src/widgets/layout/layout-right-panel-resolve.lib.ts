import { getRoleLabel, parseRole } from "~/shared/lib/roles";
import { numericUserIdOrNull, type UserId } from "~/shared/lib/user-id.lib";
import { isValidRealmUrl } from "~/shared/lib/validation";
import type {
  BuildRightPanelUserInfoOptions,
  RightPanelDetailedProfileLike,
  RightPanelDmChatLike,
  RightPanelUserFromStoreLike,
} from "./layout-right-panel.types";

function pickNonEmptyString(...candidates: (string | null | undefined)[]): string | undefined {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed != null && trimmed.length > 0) return trimmed;
  }
  return undefined;
}

export function resolveRightPanelUserName(options: {
  profile: RightPanelDetailedProfileLike | undefined;
  userFromStore: RightPanelUserFromStoreLike | undefined;
  dmChat: RightPanelDmChatLike | undefined;
  fallbackUserId: UserId | null | undefined;
}): string {
  const fromProfile = pickNonEmptyString(options.profile?.fullName);
  if (fromProfile != null) return fromProfile;
  const fromStore = pickNonEmptyString(options.userFromStore?.full_name);
  if (fromStore != null) return fromStore;
  const fromDm = pickNonEmptyString(options.dmChat?.name);
  if (fromDm != null) return fromDm;
  if (options.fallbackUserId != null) return `User #${options.fallbackUserId}`;
  return "";
}

export function resolveRightPanelAvatarUrl(options: {
  profile: RightPanelDetailedProfileLike | undefined;
  userFromStore: RightPanelUserFromStoreLike | undefined;
}): string | undefined {
  if (options.userFromStore?.avatar_url != null) {
    return options.userFromStore.avatar_url ?? undefined;
  }
  return pickNonEmptyString(options.profile?.avatarUrl);
}

export function resolveRightPanelEmail(options: {
  profile: RightPanelDetailedProfileLike | undefined;
  userFromStore: RightPanelUserFromStoreLike | undefined;
}): string | undefined {
  return pickNonEmptyString(options.profile?.email, options.userFromStore?.email);
}

export function resolveRightPanelUserId(options: {
  profile: RightPanelDetailedProfileLike | undefined;
  userFromStore: RightPanelUserFromStoreLike | undefined;
  fallbackUserId: UserId | null | undefined;
}): UserId | undefined {
  return (
    options.profile?.userId ?? options.userFromStore?.user_id ?? options.fallbackUserId ?? undefined
  );
}

export function resolveRightPanelProfileLink(
  userId: UserId | undefined,
  realm: string | undefined,
): string | undefined {
  const trimmedRealm = realm?.trim();
  const numericUserId = numericUserIdOrNull(userId);
  if (numericUserId == null || trimmedRealm == null || trimmedRealm.length === 0) return undefined;
  if (!isValidRealmUrl(trimmedRealm)) return undefined;
  return `${trimmedRealm.replace(/\/+$/, "")}/#user/${numericUserId}`;
}

export function resolveRightPanelRoleLabel(options: {
  profile: RightPanelDetailedProfileLike | undefined;
  userFromStore: RightPanelUserFromStoreLike | undefined;
}): string | undefined {
  if (options.profile?.role != null) {
    return getRoleLabel(parseRole(options.profile.role));
  }
  if (options.userFromStore?.role != null) {
    return getRoleLabel(parseRole(options.userFromStore.role));
  }
  return undefined;
}

export function selectRightPanelDetailedProfile(
  options: Pick<BuildRightPanelUserInfoOptions, "detailedProfile" | "rightDrawerTargetUserId">,
): RightPanelDetailedProfileLike | undefined {
  const { detailedProfile, rightDrawerTargetUserId } = options;
  const numericTargetUserId = numericUserIdOrNull(rightDrawerTargetUserId);
  if (numericTargetUserId == null) return undefined;
  if (detailedProfile?.userId !== numericTargetUserId) return undefined;
  return detailedProfile;
}
