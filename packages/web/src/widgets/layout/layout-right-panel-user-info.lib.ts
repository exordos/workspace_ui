import type { RightPanelUserInfo } from "~/widgets/right-panel/right-panel.types";
import {
  resolveRightPanelAvatarUrl,
  resolveRightPanelEmail,
  resolveRightPanelProfileLink,
  resolveRightPanelRoleLabel,
  resolveRightPanelUserId,
  resolveRightPanelUserName,
  selectRightPanelDetailedProfile,
} from "./layout-right-panel-resolve.lib";
import { formatRightPanelLastSeen, formatRightPanelLocalTime } from "./layout-right-panel.lib";
import type { BuildRightPanelUserInfoOptions } from "./layout-right-panel.types";

function buildRightPanelUserInfoFromProfileSources(
  options: BuildRightPanelUserInfoOptions,
  profileForRightPanelUser: ReturnType<typeof selectRightPanelDetailedProfile>,
): RightPanelUserInfo {
  const {
    userFromStore,
    dmChat,
    rightDrawerTargetUserId,
    userStatusLabel,
    currentInstanceRealm,
    media,
  } = options;
  const userPresence = userFromStore?.presence;
  const resolvedUserId = resolveRightPanelUserId({
    profile: profileForRightPanelUser,
    userFromStore,
    fallbackUserId: rightDrawerTargetUserId,
  });

  return {
    name: resolveRightPanelUserName({
      profile: profileForRightPanelUser,
      userFromStore,
      dmChat,
      fallbackUserId: rightDrawerTargetUserId,
    }),
    status: userStatusLabel,
    lastSeen: formatRightPanelLastSeen(userPresence),
    avatarUrl: resolveRightPanelAvatarUrl({
      profile: profileForRightPanelUser,
      userFromStore,
    }),
    userId: resolvedUserId,
    email: resolveRightPanelEmail({ profile: profileForRightPanelUser, userFromStore }),
    username: userFromStore?.email ?? undefined,
    role: resolveRightPanelRoleLabel({ profile: profileForRightPanelUser, userFromStore }),
    timezone: profileForRightPanelUser?.timezone ?? undefined,
    dateJoined: profileForRightPanelUser?.dateJoined ?? undefined,
    isBot: profileForRightPanelUser?.isBot ?? undefined,
    isActive: profileForRightPanelUser?.isActive ?? userFromStore?.is_active,
    profileLink:
      userFromStore?.identity_kind === "external"
        ? undefined
        : resolveRightPanelProfileLink(resolvedUserId, currentInstanceRealm),
    phone: profileForRightPanelUser?.phone ?? undefined,
    jobTitle: profileForRightPanelUser?.jobTitle ?? undefined,
    manager: profileForRightPanelUser?.manager ?? undefined,
    birthday: profileForRightPanelUser?.birthday ?? undefined,
    localTime: formatRightPanelLocalTime(profileForRightPanelUser?.timezone),
    identityKind: userFromStore?.identity_kind,
    provider:
      userFromStore?.provider == null
        ? userFromStore?.provider
        : {
            kind: userFromStore.provider.kind,
            accountUuid: userFromStore.provider.account_uuid,
          },
    media,
  };
}

function buildRightPanelUserInfoFromDmOnly(
  options: BuildRightPanelUserInfoOptions,
): RightPanelUserInfo | undefined {
  const { dmChat, userFromStore, userStatusLabel } = options;
  if (!dmChat) return undefined;
  return {
    name: dmChat.name,
    status: userStatusLabel,
    lastSeen: formatRightPanelLastSeen(userFromStore?.presence),
  };
}

export function buildRightPanelUserInfo(
  options: BuildRightPanelUserInfoOptions,
): RightPanelUserInfo | undefined {
  const { userFromStore, detailedProfile, rightDrawerTargetUserId } = options;

  const profileForRightPanelUser = selectRightPanelDetailedProfile({
    detailedProfile,
    rightDrawerTargetUserId,
  });

  if (
    profileForRightPanelUser != null ||
    userFromStore != null ||
    rightDrawerTargetUserId != null
  ) {
    return buildRightPanelUserInfoFromProfileSources(options, profileForRightPanelUser);
  }

  return buildRightPanelUserInfoFromDmOnly(options);
}
