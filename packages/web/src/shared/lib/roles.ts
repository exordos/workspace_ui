import { t } from "~/i18n/i18n";
import { assertNever } from "./guards";

/**
 * Zulip role model and permissions system.
 *
 * Roles hierarchy (Zulip API numeric codes):
 *   Owner (100) > Admin (200) > Moderator (300) > Member (400) > Guest (600)
 *
 * Usage:
 *   import { UserRole, parseRole, hasPermission, Permission } from "~/lib/roles";
 *
 *   const role = parseRole(user.role);             // numeric → enum
 *   hasPermission(role, "message:delete:any");     // can this role delete others' messages?
 *   hasRole(role, UserRole.Moderator);             // is moderator or above?
 *   getRoleLabel(role);                            // "Administrator"
 */

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export enum UserRole {
  Owner = 100,
  Admin = 200,
  Moderator = 300,
  Member = 400,
  Guest = 600,
}

const ROLE_HIERARCHY: readonly UserRole[] = [
  UserRole.Owner,
  UserRole.Admin,
  UserRole.Moderator,
  UserRole.Member,
  UserRole.Guest,
];

export function parseRole(code: number | undefined | null): UserRole {
  switch (code) {
    case 100:
      return UserRole.Owner;
    case 200:
      return UserRole.Admin;
    case 300:
      return UserRole.Moderator;
    case 400:
      return UserRole.Member;
    default:
      return UserRole.Guest;
  }
}

export function hasRole(userRole: UserRole, requiredRole: UserRole): boolean {
  return userRole <= requiredRole;
}

export function getRoleLabel(role: UserRole): string {
  switch (role) {
    case UserRole.Owner:
      return t("roles.owner");
    case UserRole.Admin:
      return t("roles.admin");
    case UserRole.Moderator:
      return t("roles.moderator");
    case UserRole.Member:
      return t("roles.member");
    case UserRole.Guest:
      return t("roles.guest");
    default:
      return assertNever(role);
  }
}

export function getRoleColor(role: UserRole): string {
  switch (role) {
    case UserRole.Owner:
      return "text-indicator-orange";
    case UserRole.Admin:
      return "text-indicator-pink";
    case UserRole.Moderator:
      return "text-indicator-purple";
    case UserRole.Member:
      return "text-text-secondary";
    case UserRole.Guest:
      return "text-text-muted";
    default:
      return assertNever(role);
  }
}

export function getAllRoles(): readonly UserRole[] {
  return ROLE_HIERARCHY;
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export type Permission =
  | "message:send"
  | "message:edit:own"
  | "message:delete:own"
  | "message:edit:any"
  | "message:delete:any"
  | "message:move"
  | "message:pin"
  | "topic:create"
  | "topic:mute"
  | "topic:resolve"
  | "user:invite"
  | "user:deactivate"
  | "user:change-role"
  | "org:settings"
  | "org:emoji"
  | "org:linkifiers";

const PERMISSION_MAP: Record<Permission, UserRole> = {
  "message:send": UserRole.Guest,
  "message:edit:own": UserRole.Guest,
  "message:delete:own": UserRole.Member,
  "message:edit:any": UserRole.Admin,
  "message:delete:any": UserRole.Admin,
  "message:move": UserRole.Moderator,
  "message:pin": UserRole.Moderator,
  "topic:create": UserRole.Member,
  "topic:mute": UserRole.Guest,
  "topic:resolve": UserRole.Moderator,
  "user:invite": UserRole.Admin,
  "user:deactivate": UserRole.Admin,
  "user:change-role": UserRole.Owner,
  "org:settings": UserRole.Admin,
  "org:emoji": UserRole.Admin,
  "org:linkifiers": UserRole.Admin,
};

export function hasPermission(userRole: UserRole, permission: Permission): boolean {
  const requiredRole = PERMISSION_MAP[permission];
  return hasRole(userRole, requiredRole);
}

export function getMinRole(permission: Permission): UserRole {
  return PERMISSION_MAP[permission];
}

export function getAllPermissions(): readonly Permission[] {
  return Object.keys(PERMISSION_MAP) as Permission[];
}

export function getPermissionsForRole(role: UserRole): Permission[] {
  return (Object.entries(PERMISSION_MAP) as [Permission, UserRole][])
    .filter(([, minRole]) => hasRole(role, minRole))
    .map(([perm]) => perm);
}

// ---------------------------------------------------------------------------
// Ownership checks (for message actions)
// ---------------------------------------------------------------------------

export function canEditMessage(userRole: UserRole, isOwnMessage: boolean): boolean {
  if (isOwnMessage) return hasPermission(userRole, "message:edit:own");
  return hasPermission(userRole, "message:edit:any");
}

export function canDeleteMessage(userRole: UserRole, isOwnMessage: boolean): boolean {
  if (isOwnMessage) return hasPermission(userRole, "message:delete:own");
  return hasPermission(userRole, "message:delete:any");
}
