/**
 * Resolves whether the current user may move a stream topic to another channel.
 *
 * Workspace uses realm `can_move_messages_between_channels_group` and per-channel
 * `can_move_messages_out_of_channel_group`. When register metadata is missing,
 * falls back to Moderator+ (`message:move`) so the API can enforce policy.
 */
import type { MessengerGroupSettingValue } from "~/shared/api/messenger.types";
import { hasPermission, hasRole, parseRole, UserRole } from "~/shared/lib/roles";

export type TopicMovePermissionSource =
  | "denied"
  | "org_admin"
  | "realm_and_stream_group"
  | "realm_group"
  | "stream_group"
  | "moderator_role_fallback";

export interface ResolveCanMoveTopicToChannelInput {
  currentUserId: number | null;
  roleCode: number | undefined;
  realmCanMoveMessagesBetweenChannelsGroup?: MessengerGroupSettingValue;
  streamCanMoveMessagesOutOfChannelGroup?: MessengerGroupSettingValue;
  isUserInGroupSetting: (
    setting: MessengerGroupSettingValue | undefined,
    userId: number,
  ) => boolean;
}

export interface ResolveCanMoveTopicToChannelResult {
  allowed: boolean;
  source: TopicMovePermissionSource;
  parsedRole: UserRole;
  inRealmGroup: boolean;
  inStreamGroup: boolean;
  hasRealmSetting: boolean;
  hasStreamSetting: boolean;
}

function isOrgAdminRole(role: UserRole): boolean {
  return role === UserRole.Owner || role === UserRole.Admin;
}

export function resolveCanMoveTopicToChannel(
  input: ResolveCanMoveTopicToChannelInput,
): ResolveCanMoveTopicToChannelResult {
  const parsedRole = parseRole(input.roleCode);
  const hasRealmSetting = input.realmCanMoveMessagesBetweenChannelsGroup != null;
  const hasStreamSetting = input.streamCanMoveMessagesOutOfChannelGroup != null;

  const base = {
    parsedRole,
    inRealmGroup: false,
    inStreamGroup: false,
    hasRealmSetting,
    hasStreamSetting,
  };

  if (input.currentUserId == null) {
    return { ...base, allowed: false, source: "denied" };
  }

  const userId = input.currentUserId;

  if (isOrgAdminRole(parsedRole)) {
    return { ...base, allowed: true, source: "org_admin" };
  }

  let realmAllowed = false;
  if (hasRealmSetting) {
    realmAllowed = input.isUserInGroupSetting(
      input.realmCanMoveMessagesBetweenChannelsGroup,
      userId,
    );
  } else if (hasPermission(parsedRole, "message:move")) {
    realmAllowed = true;
  }

  if (!realmAllowed) {
    return { ...base, allowed: false, source: "denied" };
  }

  const inRealmGroup = hasRealmSetting && realmAllowed;

  if (hasStreamSetting) {
    const inStreamGroup = input.isUserInGroupSetting(
      input.streamCanMoveMessagesOutOfChannelGroup,
      userId,
    );
    if (!inStreamGroup) {
      return { ...base, inRealmGroup, allowed: false, source: "denied" };
    }
    return {
      ...base,
      inRealmGroup,
      inStreamGroup: true,
      allowed: true,
      source: hasRealmSetting ? "realm_and_stream_group" : "stream_group",
    };
  }

  if (hasRealmSetting) {
    return {
      ...base,
      inRealmGroup: true,
      allowed: true,
      source: "realm_group",
    };
  }

  if (hasRole(parsedRole, UserRole.Moderator)) {
    return { ...base, allowed: true, source: "moderator_role_fallback" };
  }

  return { ...base, allowed: false, source: "denied" };
}
