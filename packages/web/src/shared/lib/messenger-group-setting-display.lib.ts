/**
 * Human-readable labels for the messenger API channel group-setting values.
 */
import type { MessengerGroupSettingValue } from "~/shared/api/messenger.types";

export interface FormatGroupSettingDisplayOptions {
  resolveGroupName: (groupId: number) => string | undefined;
  unknownGroupLabel: string;
  directMembersLabel: (count: number) => string;
}

/** Formats a group id or `{ direct_members, direct_subgroups }` object for UI. */
export function formatGroupSettingDisplay(
  value: MessengerGroupSettingValue | null | undefined,
  options: FormatGroupSettingDisplayOptions,
): string | null {
  if (value == null) {
    return null;
  }
  if (typeof value === "number") {
    const name = options.resolveGroupName(value);
    return name ?? `${options.unknownGroupLabel} #${value}`;
  }

  const parts: string[] = [];
  for (const subgroupId of value.direct_subgroups) {
    const name = options.resolveGroupName(subgroupId);
    parts.push(name ?? `${options.unknownGroupLabel} #${subgroupId}`);
  }
  if (value.direct_members.length > 0) {
    parts.push(options.directMembersLabel(value.direct_members.length));
  }
  if (parts.length === 0) {
    return null;
  }
  return parts.join(", ");
}
