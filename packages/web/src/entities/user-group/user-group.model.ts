/**
 * Zulip realm user groups store — membership checks for channel-level group-setting permissions.
 */
import { create } from "zustand";
import type { ZulipGroupSettingValue, ZulipRealmUserGroup } from "~/shared/api/zulip.types";
import { logStoreAction } from "~/shared/lib/logger";

export interface UserGroupRecord {
  id: number;
  name: string;
  members: number[];
  directSubgroupIds: number[];
  isSystemGroup: boolean;
}

interface UserGroupsState {
  groups: Map<number, UserGroupRecord>;
  setGroups: (groups: ZulipRealmUserGroup[]) => void;
  clear: () => void;
  isUserInGroup: (groupId: number, userId: number) => boolean;
  isUserInGroupSetting: (setting: ZulipGroupSettingValue | undefined, userId: number) => boolean;
}

function normalizeIds(ids: readonly number[]): number[] {
  return Array.from(new Set(ids.filter((id) => Number.isInteger(id) && id > 0))).sort(
    (left, right) => left - right,
  );
}

function emptyGroupsMap(): Map<number, UserGroupRecord> {
  return new Map();
}

function isUserInGroupRecursive(
  groups: Map<number, UserGroupRecord>,
  groupId: number,
  userId: number,
  visited: Set<number>,
): boolean {
  if (visited.has(groupId)) {
    return false;
  }
  visited.add(groupId);
  const group = groups.get(groupId);
  if (group == null) {
    return false;
  }
  if (group.members.includes(userId)) {
    return true;
  }
  for (const subgroupId of group.directSubgroupIds) {
    if (isUserInGroupRecursive(groups, subgroupId, userId, visited)) {
      return true;
    }
  }
  return false;
}

export const useUserGroupsStore = create<UserGroupsState>((set, get) => ({
  groups: emptyGroupsMap(),

  setGroups(groups) {
    const nextGroups = new Map<number, UserGroupRecord>();
    for (const group of groups) {
      if (!Number.isInteger(group.id) || group.id <= 0) {
        continue;
      }
      nextGroups.set(group.id, {
        id: group.id,
        name: group.name,
        members: normalizeIds(group.members),
        directSubgroupIds: normalizeIds(group.direct_subgroup_ids),
        isSystemGroup: group.is_system_group === true,
      });
    }
    logStoreAction("userGroups", "setGroups", {
      count: nextGroups.size,
      systemGroupsCount: Array.from(nextGroups.values()).filter((group) => group.isSystemGroup)
        .length,
    });
    set({ groups: nextGroups });
  },

  clear() {
    logStoreAction("userGroups", "clear", {});
    set({ groups: emptyGroupsMap() });
  },

  isUserInGroup(groupId, userId) {
    if (!Number.isInteger(groupId) || groupId <= 0) {
      return false;
    }
    if (!Number.isInteger(userId) || userId <= 0) {
      return false;
    }
    return isUserInGroupRecursive(get().groups, groupId, userId, new Set<number>());
  },

  isUserInGroupSetting(setting, userId) {
    if (!Number.isInteger(userId) || userId <= 0 || setting == null) {
      return false;
    }
    if (typeof setting === "number") {
      return get().isUserInGroup(setting, userId);
    }
    if (setting.direct_members.includes(userId)) {
      return true;
    }
    for (const subgroupId of setting.direct_subgroups) {
      if (get().isUserInGroup(subgroupId, userId)) {
        return true;
      }
    }
    return false;
  },
}));
