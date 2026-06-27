// Tests for the messenger API user group store.
// Covers membership logic for nested groups and group-setting values.
import { afterEach, describe, expect, it } from "vitest";
import { useUserGroupsStore } from "./user-group.model";

const USER_A_UUID = "00000000-0000-4000-8000-000000000100";
const USER_B_UUID = "00000000-0000-4000-8000-000000000200";

describe("useUserGroupsStore", () => {
  // Reset global Zustand store after each test to prevent state leaks.
  afterEach(() => {
    useUserGroupsStore.getState().clear();
  });

  it("resolves nested subgroup membership", () => {
    useUserGroupsStore.getState().setGroups([
      {
        id: 1,
        name: "parent",
        members: [],
        direct_subgroup_ids: [2],
      },
      {
        id: 2,
        name: "child",
        members: [USER_A_UUID],
        direct_subgroup_ids: [],
      },
    ]);

    expect(useUserGroupsStore.getState().isUserInGroup(1, USER_A_UUID)).toBe(true);
    expect(useUserGroupsStore.getState().isUserInGroup(2, USER_A_UUID)).toBe(true);
    expect(useUserGroupsStore.getState().isUserInGroup(1, USER_B_UUID)).toBe(false);
  });

  it("checks group-setting values for both integer and object forms", () => {
    useUserGroupsStore.getState().setGroups([
      {
        id: 10,
        name: "members",
        members: [USER_A_UUID],
        direct_subgroup_ids: [],
      },
    ]);

    const store = useUserGroupsStore.getState();
    expect(store.isUserInGroupSetting(10, USER_A_UUID)).toBe(true);
    expect(
      store.isUserInGroupSetting(
        { direct_members: [USER_B_UUID], direct_subgroups: [10] },
        USER_A_UUID,
      ),
    ).toBe(true);
    expect(
      store.isUserInGroupSetting(
        { direct_members: [USER_B_UUID], direct_subgroups: [] },
        USER_A_UUID,
      ),
    ).toBe(false);
  });
});
