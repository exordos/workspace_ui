import { describe, expect, it } from "vitest";
import { buildAnnouncementOnlyCanSendGroup } from "./user-group-policy";

function createGroupMap(
  groups: { id: number; name: string; isSystemGroup: boolean }[],
): Map<number, { id: number; name: string; isSystemGroup: boolean }> {
  return new Map(groups.map((group) => [group.id, group]));
}

describe("buildAnnouncementOnlyCanSendGroup", () => {
  it("builds can-send group for moderators and administrators", () => {
    const result = buildAnnouncementOnlyCanSendGroup({
      userGroups: createGroupMap([
        { id: 12, name: "role:moderators", isSystemGroup: true },
        { id: 11, name: "role:administrators", isSystemGroup: true },
      ]),
      currentUserId: 10,
    });

    expect(result).toEqual({
      direct_members: [10],
      direct_subgroups: [11, 12],
    });
  });

  it("returns null when target system groups are missing", () => {
    const result = buildAnnouncementOnlyCanSendGroup({
      userGroups: createGroupMap([{ id: 15, name: "role:owners", isSystemGroup: true }]),
      currentUserId: 10,
    });

    expect(result).toBeNull();
  });

  it("matches target names case-insensitively and with trimming", () => {
    const result = buildAnnouncementOnlyCanSendGroup({
      userGroups: createGroupMap([{ id: 8, name: "  ROLE:Moderators  ", isSystemGroup: true }]),
      currentUserId: 10,
    });

    expect(result).toEqual({
      direct_members: [10],
      direct_subgroups: [8],
    });
  });

  it("filters invalid subgroup ids and returns sorted unique ids", () => {
    const result = buildAnnouncementOnlyCanSendGroup({
      userGroups: createGroupMap([
        { id: 12, name: "role:moderators", isSystemGroup: true },
        { id: 4, name: "role:administrators", isSystemGroup: true },
        { id: -1, name: "role:moderators", isSystemGroup: true },
        { id: 0, name: "role:administrators", isSystemGroup: true },
      ]),
      currentUserId: 10,
    });

    expect(result).toEqual({
      direct_members: [10],
      direct_subgroups: [4, 12],
    });
  });

  it("ignores non-system groups with matching names", () => {
    const result = buildAnnouncementOnlyCanSendGroup({
      userGroups: createGroupMap([
        { id: 11, name: "role:administrators", isSystemGroup: false },
        { id: 12, name: "role:moderators", isSystemGroup: false },
      ]),
      currentUserId: 10,
    });

    expect(result).toBeNull();
  });

  it("omits current user from direct members when currentUserId is invalid", () => {
    const result = buildAnnouncementOnlyCanSendGroup({
      userGroups: createGroupMap([{ id: 12, name: "role:moderators", isSystemGroup: true }]),
      currentUserId: null,
    });

    expect(result).toEqual({
      direct_members: [],
      direct_subgroups: [12],
    });
  });
});
