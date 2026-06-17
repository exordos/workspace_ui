import { describe, expect, it } from "vitest";
import {
  buildDefaultFormState,
  formStateToEventInput,
  recurrencePresetToRrule,
} from "./calendar-event-form.lib";

describe("calendar-event-form.lib", () => {
  it("maps recurrence presets to RRULE", () => {
    expect(recurrencePresetToRrule("weekly", "")).toBe("FREQ=WEEKLY");
    expect(recurrencePresetToRrule("none", "")).toBeNull();
  });

  it("builds event input from form state", () => {
    const state = buildDefaultFormState([{ id: "personal" }], new Date("2026-06-15"), null);
    state.summary = "Standup";
    const input = formStateToEventInput(state);
    expect(input.summary).toBe("Standup");
    expect(input.calendarId).toBe("personal");
  });
});
