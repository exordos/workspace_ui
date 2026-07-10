import { describe, expect, it } from "vitest";
import {
  detectRecurrencePreset,
  formatRecurrenceLabel,
  recurrencePresetToRrule,
} from "~/entities/calendar/calendar-recurrence.lib";

describe("calendar-recurrence.lib", () => {
  it("maps presets to RRULE", () => {
    expect(recurrencePresetToRrule("daily", "")).toBe("FREQ=DAILY");
    expect(recurrencePresetToRrule("none", "")).toBeNull();
  });

  it("detects known presets", () => {
    expect(detectRecurrencePreset("FREQ=WEEKLY")).toEqual({ preset: "weekly", custom: "" });
  });

  it("formats recurrence labels", () => {
    expect(formatRecurrenceLabel("FREQ=MONTHLY")).toBeTruthy();
  });
});
