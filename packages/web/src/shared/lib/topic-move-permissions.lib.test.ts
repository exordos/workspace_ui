import { describe, expect, it } from "vitest";
import { UserRole } from "~/shared/lib/roles";
import { resolveCanMoveTopicToChannel } from "./topic-move-permissions.lib";

const alwaysInGroup = () => true;
const neverInGroup = () => false;

describe("resolveCanMoveTopicToChannel", () => {
  it("denies when current user id is missing", () => {
    expect(
      resolveCanMoveTopicToChannel({
        currentUserId: null,
        roleCode: UserRole.Member,
        isUserInGroupSetting: alwaysInGroup,
      }).allowed,
    ).toBe(false);
  });

  it("allows org admin regardless of group settings", () => {
    expect(
      resolveCanMoveTopicToChannel({
        currentUserId: 1,
        roleCode: UserRole.Admin,
        realmCanMoveMessagesBetweenChannelsGroup: 99,
        streamCanMoveMessagesOutOfChannelGroup: 88,
        isUserInGroupSetting: neverInGroup,
      }),
    ).toMatchObject({ allowed: true, source: "org_admin" });
  });

  it("requires membership in both realm and stream groups when both settings exist", () => {
    expect(
      resolveCanMoveTopicToChannel({
        currentUserId: 1,
        roleCode: UserRole.Member,
        realmCanMoveMessagesBetweenChannelsGroup: 10,
        streamCanMoveMessagesOutOfChannelGroup: 20,
        isUserInGroupSetting: (setting) => setting === 10,
      }).allowed,
    ).toBe(false);

    expect(
      resolveCanMoveTopicToChannel({
        currentUserId: 1,
        roleCode: UserRole.Member,
        realmCanMoveMessagesBetweenChannelsGroup: 10,
        streamCanMoveMessagesOutOfChannelGroup: 20,
        isUserInGroupSetting: alwaysInGroup,
      }),
    ).toMatchObject({ allowed: true, source: "realm_and_stream_group" });
  });

  it("allows realm group when stream out-of setting is missing", () => {
    expect(
      resolveCanMoveTopicToChannel({
        currentUserId: 1,
        roleCode: UserRole.Member,
        realmCanMoveMessagesBetweenChannelsGroup: 10,
        isUserInGroupSetting: alwaysInGroup,
      }),
    ).toMatchObject({ allowed: true, source: "realm_group" });
  });

  it("falls back to moderator role when group settings are missing", () => {
    expect(
      resolveCanMoveTopicToChannel({
        currentUserId: 1,
        roleCode: UserRole.Moderator,
        isUserInGroupSetting: neverInGroup,
      }),
    ).toMatchObject({ allowed: true, source: "moderator_role_fallback" });

    expect(
      resolveCanMoveTopicToChannel({
        currentUserId: 1,
        roleCode: UserRole.Member,
        isUserInGroupSetting: neverInGroup,
      }).allowed,
    ).toBe(false);
  });
});
