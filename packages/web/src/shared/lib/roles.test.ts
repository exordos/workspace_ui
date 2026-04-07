/**
 * Tests for the role-based access control (RBAC) module.
 *
 * This module maps Zulip's numeric role codes to a typed hierarchy
 * (Owner > Admin > Moderator > Member > Guest) and enforces permissions
 * for message editing, deletion, channel creation, and org settings.
 * Incorrect permission checks could allow unauthorized actions or
 * hide UI controls from users who should have access.
 */

import { describe, expect, it } from "vitest";
import {
  UserRole,
  parseRole,
  hasRole,
  hasPermission,
  getRoleLabel,
  getRoleColor,
  getMinRole,
  getAllPermissions,
  canEditMessage,
  canDeleteMessage,
  getPermissionsForRole,
  getAllRoles,
} from "./roles";

// parseRole converts Zulip API numeric codes (100, 200, ...) to typed UserRole enum
describe("parseRole", () => {
  // Zulip uses non-obvious codes: 100=Owner, 200=Admin (not the other way around!)
  it("maps Zulip API codes correctly", () => {
    expect(parseRole(100)).toBe(UserRole.Owner);
    expect(parseRole(200)).toBe(UserRole.Admin);
    expect(parseRole(300)).toBe(UserRole.Moderator);
    expect(parseRole(400)).toBe(UserRole.Member);
    expect(parseRole(600)).toBe(UserRole.Guest);
  });

  // Unknown/missing codes default to Guest (least privilege) for safety
  it("defaults to Guest for unknown codes", () => {
    expect(parseRole(0)).toBe(UserRole.Guest);
    expect(parseRole(999)).toBe(UserRole.Guest);
    expect(parseRole(undefined)).toBe(UserRole.Guest);
    expect(parseRole(null)).toBe(UserRole.Guest);
  });
});

// hasRole checks if a user's role is at or above a required minimum role
describe("hasRole", () => {
  // Owner is the highest role — it must satisfy every role check
  it("owner has all roles", () => {
    expect(hasRole(UserRole.Owner, UserRole.Owner)).toBe(true);
    expect(hasRole(UserRole.Owner, UserRole.Admin)).toBe(true);
    expect(hasRole(UserRole.Owner, UserRole.Guest)).toBe(true);
  });

  // Guest is the lowest role — it must not satisfy higher role checks
  it("guest has only guest role", () => {
    expect(hasRole(UserRole.Guest, UserRole.Guest)).toBe(true);
    expect(hasRole(UserRole.Guest, UserRole.Member)).toBe(false);
    expect(hasRole(UserRole.Guest, UserRole.Admin)).toBe(false);
  });

  // Member sits in the middle — can match Member and Guest but not Moderator+
  it("member has member and guest", () => {
    expect(hasRole(UserRole.Member, UserRole.Member)).toBe(true);
    expect(hasRole(UserRole.Member, UserRole.Guest)).toBe(true);
    expect(hasRole(UserRole.Member, UserRole.Moderator)).toBe(false);
  });
});

// hasPermission is the primary gate for UI actions (show/hide buttons, enable features)
describe("hasPermission", () => {
  // Even guests must be able to send messages — it's the core feature
  it("guest can send messages", () => {
    expect(hasPermission(UserRole.Guest, "message:send")).toBe(true);
  });

  // Guests can't delete — prevents accidental/malicious message removal
  it("guest cannot delete own messages", () => {
    expect(hasPermission(UserRole.Guest, "message:delete:own")).toBe(false);
  });

  // Members get self-management capabilities
  it("member can delete own messages", () => {
    expect(hasPermission(UserRole.Member, "message:delete:own")).toBe(true);
  });

  // Members must not delete other people's messages — that's admin territory
  it("member cannot delete others' messages", () => {
    expect(hasPermission(UserRole.Member, "message:delete:any")).toBe(false);
  });

  // Admins need moderation power to maintain channel hygiene
  it("admin can delete any message", () => {
    expect(hasPermission(UserRole.Admin, "message:delete:any")).toBe(true);
  });

  // Role changes are owner-only — prevents admin privilege escalation
  it("admin cannot change roles", () => {
    expect(hasPermission(UserRole.Admin, "user:change-role")).toBe(false);
  });

  // Only the owner can promote/demote other users
  it("owner can change roles", () => {
    expect(hasPermission(UserRole.Owner, "user:change-role")).toBe(true);
  });

  // Message moving is a moderation action — moderator is the minimum role
  it("moderator can move messages", () => {
    expect(hasPermission(UserRole.Moderator, "message:move")).toBe(true);
  });

  it("member cannot move messages", () => {
    expect(hasPermission(UserRole.Member, "message:move")).toBe(false);
  });
});

// canEditMessage / canDeleteMessage combine role + ownership for message-level access
describe("canEditMessage / canDeleteMessage", () => {
  // Members can edit their own messages (e.g. fix typos)
  it("member can edit own message", () => {
    expect(canEditMessage(UserRole.Member, true)).toBe(true);
  });

  // Members must not edit other users' messages — prevents impersonation
  it("member cannot edit others' messages", () => {
    expect(canEditMessage(UserRole.Member, false)).toBe(false);
  });

  // Admins can edit any message for moderation purposes
  it("admin can edit any message", () => {
    expect(canEditMessage(UserRole.Admin, false)).toBe(true);
  });

  // Guest delete restriction prevents data loss by untrusted users
  it("guest cannot delete own message", () => {
    expect(canDeleteMessage(UserRole.Guest, true)).toBe(false);
  });

  it("member can delete own message", () => {
    expect(canDeleteMessage(UserRole.Member, true)).toBe(true);
  });

  it("admin can delete any message", () => {
    expect(canDeleteMessage(UserRole.Admin, false)).toBe(true);
  });
});

// getRoleLabel returns human-readable labels shown in UI badges and profile cards
describe("getRoleLabel", () => {
  // Every role must have a non-empty display label
  it("returns non-empty labels for all roles", () => {
    for (const role of getAllRoles()) {
      const label = getRoleLabel(role);
      expect(label).toBeTruthy();
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

// getPermissionsForRole returns the full list of allowed actions for a given role
describe("getPermissionsForRole", () => {
  // Guest should have minimal permissions — principle of least privilege
  it("guest has minimal permissions", () => {
    const perms = getPermissionsForRole(UserRole.Guest);
    expect(perms).toContain("message:send");
    expect(perms).toContain("message:edit:own");
    expect(perms).toContain("topic:mute");
    expect(perms).not.toContain("message:delete:own");
    expect(perms).not.toContain("channel:create");
  });

  // Owner must have every permission in the system
  it("owner has all permissions", () => {
    const perms = getPermissionsForRole(UserRole.Owner);
    expect(perms).toContain("user:change-role");
    expect(perms).toContain("org:settings");
    expect(perms).toContain("message:send");
  });
});

// getAllRoles returns the hierarchy array — used for role picker dropdowns
describe("getAllRoles", () => {
  // Must be exactly 5 roles in descending privilege order (Owner → Guest)
  it("returns 5 roles in hierarchy order", () => {
    const roles = getAllRoles();
    expect(roles).toHaveLength(5);
    expect(roles[0]).toBe(UserRole.Owner);
    expect(roles[4]).toBe(UserRole.Guest);
  });
});

// getRoleColor returns Tailwind classes for color-coded role badges in the UI
describe("getRoleColor", () => {
  it("returns indicator-orange for Owner", () => {
    expect(getRoleColor(UserRole.Owner)).toBe("text-indicator-orange");
  });

  it("returns indicator-pink for Admin", () => {
    expect(getRoleColor(UserRole.Admin)).toBe("text-indicator-pink");
  });

  it("returns indicator-purple for Moderator", () => {
    expect(getRoleColor(UserRole.Moderator)).toBe("text-indicator-purple");
  });

  it("returns text-secondary for Member", () => {
    expect(getRoleColor(UserRole.Member)).toBe("text-text-secondary");
  });

  it("returns text-muted for Guest", () => {
    expect(getRoleColor(UserRole.Guest)).toBe("text-text-muted");
  });
});

// getMinRole returns the minimum role required for a given permission
describe("getMinRole", () => {
  // message:send is available to all — minimum is Guest
  it("returns Guest for message:send", () => {
    expect(getMinRole("message:send")).toBe(UserRole.Guest);
  });

  it("returns Admin for message:delete:any", () => {
    expect(getMinRole("message:delete:any")).toBe(UserRole.Admin);
  });

  it("returns Owner for user:change-role", () => {
    expect(getMinRole("user:change-role")).toBe(UserRole.Owner);
  });

  it("returns Moderator for message:move", () => {
    expect(getMinRole("message:move")).toBe(UserRole.Moderator);
  });
});

// getAllPermissions is used by admin UIs to display the full permission matrix
describe("getAllPermissions", () => {
  // The permission registry must contain all known permission strings
  it("returns all permission strings", () => {
    const perms = getAllPermissions();
    expect(perms.length).toBeGreaterThan(0);
    expect(perms).toContain("message:send");
    expect(perms).toContain("user:change-role");
    expect(perms).toContain("org:settings");
  });

  // Permission format is "domain:action" — colon separator is required
  it("returns colon-separated permission identifiers", () => {
    const perms = getAllPermissions();
    for (const p of perms) {
      expect(typeof p).toBe("string");
      expect(p).toContain(":");
    }
  });
});
