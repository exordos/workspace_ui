// Тесты store групп пользователей Zulip.
// Проверяют корректность membership-логики для вложенных групп и group-setting значений.
import { afterEach, describe, expect, it } from "vitest";
import { useUserGroupsStore } from "./user-group.model";

describe("useUserGroupsStore", () => {
  // После каждого теста очищаем глобальный Zustand store, чтобы не было протечек состояния.
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
