/**
 * Shared recurrence preset ↔ RRULE mapping for calendar form and display.
 */

import { t } from "~/i18n/i18n";

export type RecurrencePreset = "none" | "daily" | "weekly" | "monthly" | "custom";

export function normalizeRrule(rrule: string | null | undefined): string {
  if (rrule == null || rrule.length === 0) return "";
  return rrule.replace(/^RRULE:/i, "");
}

export function recurrencePresetToRrule(preset: RecurrencePreset, custom: string): string | null {
  if (preset === "none") return null;
  if (preset === "custom") return custom.trim().length > 0 ? custom.trim() : null;
  if (preset === "daily") return "FREQ=DAILY";
  if (preset === "weekly") return "FREQ=WEEKLY";
  if (preset === "monthly") return "FREQ=MONTHLY";
  return null;
}

export function detectRecurrencePreset(rrule: string | null | undefined): {
  preset: RecurrencePreset;
  custom: string;
} {
  const normalized = normalizeRrule(rrule);
  if (normalized.length === 0) return { preset: "none", custom: "" };
  if (normalized === "FREQ=DAILY") return { preset: "daily", custom: "" };
  if (normalized === "FREQ=WEEKLY") return { preset: "weekly", custom: "" };
  if (normalized === "FREQ=MONTHLY") return { preset: "monthly", custom: "" };
  return { preset: "custom", custom: normalized };
}

export function formatRecurrenceLabel(rrule: string | null | undefined): string | null {
  const normalized = normalizeRrule(rrule);
  if (normalized.length === 0) return null;
  if (normalized === "FREQ=DAILY") return t("calendar.recurrenceDaily");
  if (normalized === "FREQ=WEEKLY") return t("calendar.recurrenceWeekly");
  if (normalized === "FREQ=MONTHLY") return t("calendar.recurrenceMonthly");
  return normalized;
}
