import type { MessengerGroupSettingValue } from "~/shared/api/messenger.types";
import { numericUserIdOrNull, type UserId } from "~/shared/lib/user-id.lib";

interface AnnouncementOnlyGroupRecord {
  id: number;
  name: string;
  isSystemGroup: boolean;
}

interface BuildAnnouncementOnlyCanSendGroupInput {
  userGroups: ReadonlyMap<number, AnnouncementOnlyGroupRecord>;
  currentUserId: UserId | null;
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
): MessengerGroupSettingValue | null {
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
    direct_members:
      numericUserIdOrNull(input.currentUserId) != null
        ? [numericUserIdOrNull(input.currentUserId)!]
        : [],
    direct_subgroups: subgroupIds,
  };
}
