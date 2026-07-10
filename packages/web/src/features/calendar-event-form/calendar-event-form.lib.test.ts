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

  it("prefills start and end from draft slot click", () => {
    const draftStart = new Date("2026-06-17T14:30:00");
    const state = buildDefaultFormState(
      [{ id: "personal" }],
      new Date("2026-06-17"),
      null,
      draftStart,
    );
    expect(state.startDate).toBe("2026-06-17");
    expect(state.startTime).toBe("14:30");
    expect(state.endDate).toBe("2026-06-17");
    expect(state.endTime).toBe("15:30");
  });
});
