// Тесты доменной проверки прав add-members.
// Проверяют ветки org runtime capability и channel-level membership.
import { describe, expect, it } from "vitest";
import { UserRole } from "~/shared/lib/roles";
import { canAddMembersToStream } from "./add-stream-members.permissions";

describe("canAddMembersToStream", () => {
  it("denies guests regardless of channel groups", () => {
    expect(
      canAddMembersToStream({
        currentUserId: 10,
        orgRole: UserRole.Guest,
        canAddSubscribersGroup: { direct_members: [10], direct_subgroups: [] },
        isUserInGroupSetting: () => true,
      }),
    ).toBe(false);
  });

  it("allows owner/admin even without explicit channel or realm groups", () => {
    expect(
      canAddMembersToStream({
        currentUserId: 10,
        orgRole: UserRole.Owner,
        isUserInGroupSetting: () => false,
      }),
    ).toBe(true);
    expect(
      canAddMembersToStream({
        currentUserId: 10,
        orgRole: UserRole.Admin,
        isUserInGroupSetting: () => false,
      }),
    ).toBe(true);
  });

  it("allows member from modern org add-subscribers group", () => {
    expect(
      canAddMembersToStream({
        currentUserId: 10,
        orgRole: UserRole.Member,
        currentUserChannelCapabilities: {
          realmCanAddSubscribersGroup: 71,
        },
        isUserInGroupSetting: (setting, userId) => setting === 71 && userId === 10,
      }),
    ).toBe(true);
  });

  it("allows member when they are in channel add-subscribers group", () => {
    expect(
      canAddMembersToStream({
        currentUserId: 10,
        orgRole: UserRole.Member,
        canAddSubscribersGroup: 55,
        isUserInGroupSetting: (setting, userId) => setting === 55 && userId === 10,
      }),
    ).toBe(true);
  });

  it("allows channel admins only for public channels", () => {
    expect(
      canAddMembersToStream({
        currentUserId: 10,
        orgRole: UserRole.Member,
        canAdministerChannelGroup: 66,
        inviteOnly: false,
        isUserInGroupSetting: (setting, userId) => setting === 66 && userId === 10,
      }),
    ).toBe(true);
    expect(
      canAddMembersToStream({
        currentUserId: 10,
        orgRole: UserRole.Member,
        canAdministerChannelGroup: 66,
        inviteOnly: true,
        isUserInGroupSetting: (setting, userId) => setting === 66 && userId === 10,
      }),
    ).toBe(false);
  });
});
