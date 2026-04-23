// Тесты runtime-capabilities текущего пользователя для действий в канале.
import { describe, expect, it } from "vitest";
import { UserRole } from "~/shared/lib/roles";
import { resolveCurrentUserChannelCapabilities } from "./stream-member-management-permissions.lib";

// Унифицированный stub membership-проверки для unit-тестов.
const neverInGroup = () => false;

describe("resolveCurrentUserChannelCapabilities", () => {
  it("denies when current user is unknown", () => {
    expect(
      resolveCurrentUserChannelCapabilities({
        currentUserId: null,
        orgRole: UserRole.Member,
        isUserInGroupSetting: neverInGroup,
      }),
    ).toEqual({
      canAddSubscribers: false,
      canRemoveSubscribers: false,
      canEditChannelMetadata: false,
      canArchiveChannel: false,
    });
  });

  it("denies guests regardless of channel groups", () => {
    expect(
      resolveCurrentUserChannelCapabilities({
        currentUserId: 10,
        orgRole: UserRole.Guest,
        canAdministerChannelGroup: 66,
        canAddSubscribersGroup: 55,
        canRemoveSubscribersGroup: 55,
        isUserInGroupSetting: () => true,
      }),
    ).toEqual({
      canAddSubscribers: false,
      canRemoveSubscribers: false,
      canEditChannelMetadata: false,
      canArchiveChannel: false,
    });
  });

  it("allows org owner/admin as add-subscribers fallback when realm metadata is missing", () => {
    expect(
      resolveCurrentUserChannelCapabilities({
        currentUserId: 10,
        orgRole: UserRole.Owner,
        isUserInGroupSetting: neverInGroup,
      }),
    ).toMatchObject({
      canAddSubscribers: true,
      canRemoveSubscribers: true,
      canEditChannelMetadata: true,
      canArchiveChannel: true,
    });
  });

  it("keeps org admin add-members access without explicit realm group metadata", () => {
    expect(
      resolveCurrentUserChannelCapabilities({
        currentUserId: 10,
        orgRole: UserRole.Admin,
        isUserInGroupSetting: neverInGroup,
      }),
    ).toMatchObject({
      canAddSubscribers: true,
      canRemoveSubscribers: true,
      canEditChannelMetadata: true,
      canArchiveChannel: true,
    });
  });

  it("allows add-members for modern realm add-subscribers group", () => {
    expect(
      resolveCurrentUserChannelCapabilities({
        currentUserId: 10,
        orgRole: UserRole.Member,
        currentUserChannelCapabilities: {
          realmCanAddSubscribersGroup: 91,
        },
        isUserInGroupSetting: (setting, userId) => setting === 91 && userId === 10,
      }),
    ).toMatchObject({
      canAddSubscribers: true,
    });
  });

  it("allows channel admin to add subscribers only in public channels", () => {
    expect(
      resolveCurrentUserChannelCapabilities({
        currentUserId: 10,
        orgRole: UserRole.Member,
        canAdministerChannelGroup: 66,
        inviteOnly: false,
        isUserInGroupSetting: (setting, userId) => setting === 66 && userId === 10,
      }),
    ).toMatchObject({
      canAddSubscribers: true,
      canRemoveSubscribers: true,
      canEditChannelMetadata: true,
      canArchiveChannel: true,
    });
    expect(
      resolveCurrentUserChannelCapabilities({
        currentUserId: 10,
        orgRole: UserRole.Member,
        canAdministerChannelGroup: 66,
        inviteOnly: true,
        isUserInGroupSetting: (setting, userId) => setting === 66 && userId === 10,
      }),
    ).toMatchObject({
      canAddSubscribers: false,
      canRemoveSubscribers: true,
      canEditChannelMetadata: true,
      canArchiveChannel: true,
    });
  });

  it("allows add-members from can_add_subscribers_group even for private channels", () => {
    expect(
      resolveCurrentUserChannelCapabilities({
        currentUserId: 10,
        orgRole: UserRole.Member,
        inviteOnly: true,
        canAddSubscribersGroup: 55,
        isUserInGroupSetting: (setting, userId) => setting === 55 && userId === 10,
      }),
    ).toMatchObject({
      canAddSubscribers: true,
    });
  });

  it("allows remove-members from remove-group membership", () => {
    expect(
      resolveCurrentUserChannelCapabilities({
        currentUserId: 10,
        orgRole: UserRole.Member,
        canRemoveSubscribersGroup: 55,
        isUserInGroupSetting: (setting, userId) => setting === 55 && userId === 10,
      }),
    ).toMatchObject({
      canRemoveSubscribers: true,
    });
  });
});
