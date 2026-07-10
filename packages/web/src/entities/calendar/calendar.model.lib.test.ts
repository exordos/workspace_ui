import { describe, expect, it, vi } from "vitest";
import { invalidateCalendarSessionIfUnauthorized } from "./calendar.model.lib";

describe("invalidateCalendarSessionIfUnauthorized", () => {
  it("clears error state when session is invalidated", () => {
    const set = vi.fn();
    const emptyCalendars: never[] = [];

    invalidateCalendarSessionIfUnauthorized(new Error("Unauthorized"), {
      emptyCalendars,
      set,
    });

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        error: null,
        loadingCalendars: false,
        loadingEvents: false,
        saving: false,
      }),
    );
  });

  it("does nothing for non-unauthorized errors", () => {
    const set = vi.fn();

    const result = invalidateCalendarSessionIfUnauthorized(new Error("Network error"), {
      emptyCalendars: [],
      set,
    });

    expect(result).toBe(false);
    expect(set).not.toHaveBeenCalled();
  });
});
