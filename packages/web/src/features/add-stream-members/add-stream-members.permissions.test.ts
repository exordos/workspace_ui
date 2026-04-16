// Тесты доменной проверки прав add-members.
// Проверяют org-level guard и channel-level group membership ветки.
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

  it("allows owner/admin as realm-level fallback", () => {
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
});
