// Тесты единого helper-а прав управления участниками канала.
// Нужны, чтобы зафиксировать базовую матрицу allow/deny для add/remove операций.
import { describe, expect, it } from "vitest";
import { UserRole } from "~/shared/lib/roles";
import { canManageMembersInStream } from "./stream-member-management-permissions.lib";

// Унифицированный stub membership-проверки для unit-тестов.
const neverInGroup = () => false;

describe("canManageMembersInStream", () => {
  it("denies when current user is unknown", () => {
    expect(
      canManageMembersInStream({
        operation: "add",
        currentUserId: null,
        orgRole: UserRole.Member,
        isUserInGroupSetting: neverInGroup,
      }),
    ).toBe(false);
  });

  it("denies guests regardless of channel groups", () => {
    expect(
      canManageMembersInStream({
        operation: "remove",
        currentUserId: 10,
        orgRole: UserRole.Guest,
        canAdministerChannelGroup: 66,
        operationGroup: 55,
        isUserInGroupSetting: () => true,
      }),
    ).toBe(false);
  });

  it("allows org owner/admin as fallback", () => {
    expect(
      canManageMembersInStream({
        operation: "add",
        currentUserId: 10,
        orgRole: UserRole.Owner,
        isUserInGroupSetting: neverInGroup,
      }),
    ).toBe(true);
    expect(
      canManageMembersInStream({
        operation: "remove",
        currentUserId: 10,
        orgRole: UserRole.Admin,
        isUserInGroupSetting: neverInGroup,
      }),
    ).toBe(true);
  });

  it("allows channel admin group members", () => {
    expect(
      canManageMembersInStream({
        operation: "remove",
        currentUserId: 10,
        orgRole: UserRole.Member,
        canAdministerChannelGroup: 66,
        operationGroup: 55,
        isUserInGroupSetting: (setting, userId) => setting === 66 && userId === 10,
      }),
    ).toBe(true);
  });

  it("allows operation-specific group members when not channel-admin", () => {
    expect(
      canManageMembersInStream({
        operation: "add",
        currentUserId: 10,
        orgRole: UserRole.Member,
        canAdministerChannelGroup: 66,
        operationGroup: 55,
        isUserInGroupSetting: (setting, userId) => setting === 55 && userId === 10,
      }),
    ).toBe(true);
  });

  it("denies when neither channel-admin nor operation-group membership matches", () => {
    expect(
      canManageMembersInStream({
        operation: "remove",
        currentUserId: 10,
        orgRole: UserRole.Member,
        canAdministerChannelGroup: 66,
        operationGroup: 55,
        isUserInGroupSetting: neverInGroup,
      }),
    ).toBe(false);
  });
});
