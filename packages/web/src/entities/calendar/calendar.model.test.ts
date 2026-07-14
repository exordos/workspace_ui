import { afterEach, describe, expect, it, vi } from "vitest";
import { useCalendarStore } from "./calendar.model";

describe("useCalendarStore", () => {
  afterEach(() => {
    vi.useRealTimers();
    useCalendarStore.getState().clear();
  });

  it("clear resets selected recurrence instance", () => {
    useCalendarStore.setState({
      selectedEventUid: "recurring-event",
      selectedRecurrenceId: "20260710T100000Z",
    });

    useCalendarStore.getState().clear();

    expect(useCalendarStore.getState().selectedEventUid).toBeNull();
    expect(useCalendarStore.getState().selectedRecurrenceId).toBeNull();
  });

  it("clear resets view mode and focus date to defaults", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-10T12:00:00Z"));

    useCalendarStore.setState({
      focusDate: new Date("2020-01-01T00:00:00Z"),
      viewMode: "week",
    });

    useCalendarStore.getState().clear();

    expect(useCalendarStore.getState().viewMode).toBe("month");
    expect(useCalendarStore.getState().focusDate.toISOString()).toBe("2026-07-10T12:00:00.000Z");
  });
});
