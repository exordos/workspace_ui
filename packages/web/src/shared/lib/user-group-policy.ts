import type { ZulipGroupSettingValue } from "~/shared/api/zulip.types";

interface AnnouncementOnlyGroupRecord {
  id: number;
  name: string;
  isSystemGroup: boolean;
}

interface BuildAnnouncementOnlyCanSendGroupInput {
  userGroups: ReadonlyMap<number, AnnouncementOnlyGroupRecord>;
  currentUserId: number | null;
}

const ANNOUNCEMENT_ONLY_ROLE_NAMES = new Set(["role:moderators", "role:administrators"]);

function isValidPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function normalizeSubgroupIds(ids: readonly number[]): number[] {
  return Array.from(new Set(ids.filter(isValidPositiveInteger))).sort(
    (left, right) => left - right,
  );
}

export function buildAnnouncementOnlyCanSendGroup(
  input: BuildAnnouncementOnlyCanSendGroupInput,
): ZulipGroupSettingValue | null {
  const subgroupIds = normalizeSubgroupIds(
    Array.from(input.userGroups.values())
      .filter(
        (group) =>
          group.isSystemGroup === true &&
          ANNOUNCEMENT_ONLY_ROLE_NAMES.has(group.name.trim().toLowerCase()),
      )
      .map((group) => group.id),
  );

  if (subgroupIds.length === 0) {
    return null;
  }

  return {
    direct_members: isValidPositiveInteger(input.currentUserId) ? [input.currentUserId] : [],
    direct_subgroups: subgroupIds,
  };
}
