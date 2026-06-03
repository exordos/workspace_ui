// Tests for Zulip user group store.
// Covers membership logic for nested groups and group-setting values.
import { afterEach, describe, expect, it } from "vitest";
import { useUserGroupsStore } from "./user-group.model";

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
        members: [42],
        direct_subgroup_ids: [],
      },
    ]);

    expect(useUserGroupsStore.getState().isUserInGroup(1, 42)).toBe(true);
    expect(useUserGroupsStore.getState().isUserInGroup(2, 42)).toBe(true);
    expect(useUserGroupsStore.getState().isUserInGroup(1, 77)).toBe(false);
  });

  it("checks group-setting values for both integer and object forms", () => {
    useUserGroupsStore.getState().setGroups([
      {
        id: 10,
        name: "members",
        members: [100],
        direct_subgroup_ids: [],
      },
    ]);

    const store = useUserGroupsStore.getState();
    expect(store.isUserInGroupSetting(10, 100)).toBe(true);
    expect(store.isUserInGroupSetting({ direct_members: [200], direct_subgroups: [10] }, 100)).toBe(
      true,
    );
    expect(store.isUserInGroupSetting({ direct_members: [200], direct_subgroups: [] }, 100)).toBe(
      false,
    );
  });
});
