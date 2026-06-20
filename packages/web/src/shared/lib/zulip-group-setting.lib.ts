/**
 * Normalization and equality for Zulip channel group-setting values.
 * Keeps API and store on one `{ number | direct_members/subgroups }` shape.
 */
import type {
  ZulipGroupSettingValue,
  ZulipGroupSettingValueObject,
} from "~/shared/api/zulip.types";

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function normalizeIds(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(new Set(value.filter(isPositiveInteger))).sort((left, right) => left - right);
}

function normalizeGroupSettingObject(value: unknown): ZulipGroupSettingValueObject | undefined {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  return {
    direct_members: normalizeIds(record.direct_members),
    direct_subgroups: normalizeIds(record.direct_subgroups),
  };
}

export function normalizeGroupSettingValue(value: unknown): ZulipGroupSettingValue | undefined {
  const normalized: ZulipGroupSettingValue | undefined = isPositiveInteger(value)
    ? value
    : normalizeGroupSettingObject(value);
  return normalized;
}

/** Detects metadata changes in the store (both Zulip shapes: group id or member/subgroup object). */
export function areGroupSettingValuesEqual(
  left: ZulipGroupSettingValue | undefined,
  right: ZulipGroupSettingValue | undefined,
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
