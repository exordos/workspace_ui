/**
 * Runtime channel action capabilities aligned with Zulip group-setting semantics.
 */
import type { CurrentUserChannelCapabilities } from "~/entities/user/user.model";
import type { ZulipGroupSettingValue } from "~/shared/api/zulip.types";
import { UserRole } from "~/shared/lib/roles";

export interface ResolveCurrentUserChannelCapabilitiesInput {
  currentUserId: number | null;
  orgRole: UserRole;
  currentUserChannelCapabilities?: CurrentUserChannelCapabilities;
  inviteOnly?: boolean;
  canAddSubscribersGroup?: ZulipGroupSettingValue;
  canRemoveSubscribersGroup?: ZulipGroupSettingValue;
  canAdministerChannelGroup?: ZulipGroupSettingValue;
  isUserInGroupSetting: (setting: ZulipGroupSettingValue | undefined, userId: number) => boolean;
}

export interface ChannelActionCapabilities {
  canAddSubscribers: boolean;
  canRemoveSubscribers: boolean;
  canEditChannelMetadata: boolean;
  canArchiveChannel: boolean;
}

function isOrgAdminRole(role: UserRole): boolean {
  return role === UserRole.Owner || role === UserRole.Admin;
}

export function resolveCurrentUserChannelCapabilities(
  input: ResolveCurrentUserChannelCapabilitiesInput,
): ChannelActionCapabilities {
  const { currentUserId, orgRole, currentUserChannelCapabilities, canAdministerChannelGroup } =
    input;
  if (currentUserId == null || orgRole === UserRole.Guest) {
    return {
      canAddSubscribers: false,
      canRemoveSubscribers: false,
      canEditChannelMetadata: false,
      canArchiveChannel: false,
    };
  }

  const isOrgAdmin = isOrgAdminRole(orgRole);
  const isChannelAdmin = input.isUserInGroupSetting(canAdministerChannelGroup, currentUserId);
  const inAddSubscribersGroup = input.isUserInGroupSetting(
    input.canAddSubscribersGroup,
    currentUserId,
  );
  const inRealmAddSubscribersGroup = input.isUserInGroupSetting(
    currentUserChannelCapabilities?.realmCanAddSubscribersGroup,
    currentUserId,
  );
  const inRemoveSubscribersGroup = input.isUserInGroupSetting(
    input.canRemoveSubscribersGroup,
    currentUserId,
  );
  return {
    canAddSubscribers:
      isOrgAdmin ||
      inAddSubscribersGroup ||
      inRealmAddSubscribersGroup ||
      (isChannelAdmin && input.inviteOnly !== true),
    canRemoveSubscribers: isOrgAdmin || isChannelAdmin || inRemoveSubscribersGroup,
    canEditChannelMetadata: isOrgAdmin || isChannelAdmin,
    canArchiveChannel: isOrgAdmin || isChannelAdmin,
  };
}
