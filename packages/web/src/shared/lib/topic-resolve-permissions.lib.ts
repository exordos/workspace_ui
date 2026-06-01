/**
 * Resolves whether the current user may mark stream topics as done/un-done.
 *
 * Zulip uses realm/channel `can_resolve_topics_group` settings (not org role alone).
 * When register metadata is missing, falls back to Member+ so the API can enforce policy.
 */
import type { ZulipGroupSettingValue } from "~/shared/api/zulip.types";
import { hasRole, parseRole, UserRole } from "~/shared/lib/roles";

export type TopicResolvePermissionSource =
  | "denied"
  | "org_admin"
  | "stream_group"
  | "realm_group"
  | "moderator_role_fallback"
  | "member_role_fallback"
  | "permission_check_skipped";

export interface ResolveCanResolveTopicsInput {
  currentUserId: number | null;
  roleCode: number | undefined;
  realmCanResolveTopicsGroup?: ZulipGroupSettingValue;
  streamCanResolveTopicsGroup?: ZulipGroupSettingValue;
  isUserInGroupSetting: (setting: ZulipGroupSettingValue | undefined, userId: number) => boolean;
}

export interface ResolveCanResolveTopicsResult {
  allowed: boolean;
  source: TopicResolvePermissionSource;
  parsedRole: UserRole;
  inRealmGroup: boolean;
  inStreamGroup: boolean;
  hasRealmSetting: boolean;
  hasStreamSetting: boolean;
}

function isOrgAdminRole(role: UserRole): boolean {
  return role === UserRole.Owner || role === UserRole.Admin;
}

export function resolveCanResolveTopics(
  input: ResolveCanResolveTopicsInput,
): ResolveCanResolveTopicsResult {
  const parsedRole = parseRole(input.roleCode);
  const hasRealmSetting = input.realmCanResolveTopicsGroup != null;
  const hasStreamSetting = input.streamCanResolveTopicsGroup != null;

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

  if (hasStreamSetting) {
    const inStreamGroup = input.isUserInGroupSetting(input.streamCanResolveTopicsGroup, userId);
    if (inStreamGroup) {
      return { ...base, allowed: true, source: "stream_group", inStreamGroup: true };
    }
    return { ...base, allowed: false, source: "denied" };
  }

  if (hasRealmSetting) {
    const inRealmGroup = input.isUserInGroupSetting(input.realmCanResolveTopicsGroup, userId);
    return {
      ...base,
      allowed: inRealmGroup,
      source: inRealmGroup ? "realm_group" : "denied",
      inRealmGroup,
    };
  }

  if (hasRole(parsedRole, UserRole.Moderator)) {
    return { ...base, allowed: true, source: "moderator_role_fallback" };
  }

  if (hasRole(parsedRole, UserRole.Member)) {
    return { ...base, allowed: true, source: "member_role_fallback" };
  }

  return { ...base, allowed: false, source: "denied" };
}
