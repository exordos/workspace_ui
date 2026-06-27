/**
 * Normalization and equality for the messenger API channel group-setting values.
 * Keeps API and store on one `{ groupId | direct_members/subgroups }` shape.
 */
import type {
  MessengerGroupSettingValue,
  MessengerGroupSettingValueObject,
} from "~/shared/api/messenger.types";
import { isIamUserUuid } from "~/shared/lib/user-id.lib";

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function normalizeGroupIds(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(new Set(value.filter(isPositiveInteger))).sort((left, right) => left - right);
}

function normalizeDirectMemberIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(new Set(value.filter(isIamUserUuid).map((id) => id.trim().toLowerCase()))).sort(
    (left, right) => left.localeCompare(right),
  );
}

function normalizeGroupSettingObject(value: unknown): MessengerGroupSettingValueObject | undefined {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  return {
    direct_members: normalizeDirectMemberIds(record.direct_members),
    direct_subgroups: normalizeGroupIds(record.direct_subgroups),
  };
}

export function normalizeGroupSettingValue(value: unknown): MessengerGroupSettingValue | undefined {
  const normalized: MessengerGroupSettingValue | undefined = isPositiveInteger(value)
    ? value
    : normalizeGroupSettingObject(value);
  return normalized;
}

/** Detects metadata changes in the store (both Workspace shapes: group id or member/subgroup object). */
export function areGroupSettingValuesEqual(
  left: MessengerGroupSettingValue | undefined,
  right: MessengerGroupSettingValue | undefined,
): boolean {
  if (left === right) return true;
  if (left == null || right == null) return false;
  if (typeof left === "number" || typeof right === "number") {
    return left === right;
  }
  if (left.direct_members.length !== right.direct_members.length) return false;
  if (left.direct_subgroups.length !== right.direct_subgroups.length) return false;
  for (let index = 0; index < left.direct_members.length; index += 1) {
    if (left.direct_members[index] !== right.direct_members[index]) {
      return false;
    }
  }
  for (let index = 0; index < left.direct_subgroups.length; index += 1) {
    if (left.direct_subgroups[index] !== right.direct_subgroups[index]) {
      return false;
    }
  }
  return true;
}
