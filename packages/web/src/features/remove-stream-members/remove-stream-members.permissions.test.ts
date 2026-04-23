// Тесты доменной проверки прав remove-members.
// Проверяют org-level и channel-level ветки.
import { describe, expect, it } from "vitest";
import { UserRole } from "~/shared/lib/roles";
import { canRemoveMembersFromStream } from "./remove-stream-members.permissions";

describe("canRemoveMembersFromStream", () => {
  it("denies guests regardless of channel groups", () => {
    expect(
      canRemoveMembersFromStream({
        currentUserId: 10,
        orgRole: UserRole.Guest,
        canRemoveSubscribersGroup: { direct_members: [10], direct_subgroups: [] },
        isUserInGroupSetting: () => true,
      }),
    ).toBe(false);
  });

  it("allows owner/admin regardless of channel groups", () => {
    expect(
      canRemoveMembersFromStream({
        currentUserId: 10,
        orgRole: UserRole.Owner,
        isUserInGroupSetting: () => false,
      }),
    ).toBe(true);
    expect(
      canRemoveMembersFromStream({
        currentUserId: 10,
        orgRole: UserRole.Admin,
        isUserInGroupSetting: () => false,
      }),
    ).toBe(true);
  });

  it("allows member when they are in channel remove-subscribers group", () => {
    expect(
      canRemoveMembersFromStream({
        currentUserId: 10,
        orgRole: UserRole.Member,
        canRemoveSubscribersGroup: 55,
        isUserInGroupSetting: (setting, userId) => setting === 55 && userId === 10,
      }),
    ).toBe(true);
  });

  it("allows member when they are in channel admins group even without remove-group membership", () => {
    expect(
      canRemoveMembersFromStream({
        currentUserId: 10,
        orgRole: UserRole.Member,
        canAdministerChannelGroup: 66,
        canRemoveSubscribersGroup: 55,
        isUserInGroupSetting: (setting, userId) => setting === 66 && userId === 10,
      }),
    ).toBe(true);
  });
});
