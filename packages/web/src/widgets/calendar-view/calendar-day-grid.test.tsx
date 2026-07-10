import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CALENDAR_HOUR_HEIGHT_PX } from "~/entities/calendar/calendar.lib";
import type { CalendarEvent } from "~/entities/calendar/calendar.types";
import { CalendarDayGrid } from "./calendar-day-grid.ui";

const event: CalendarEvent = {
  uid: "evt-1",
  calendarId: "personal",
  summary: "Standup",
  description: null,
  location: null,
  start: "2026-06-17T10:00:00",
  end: "2026-06-17T11:00:00",
  allDay: false,
  etag: null,
  recurrence: null,
  attendees: [],
  alarms: [],
  recurrenceId: null,
  isRecurringInstance: false,
};

describe("CalendarDayGrid", () => {
  it("renders 24-hour time grid for a single day", () => {
    render(
      <CalendarDayGrid
        date={new Date("2026-06-17T12:00:00")}
        events={[event]}
        getEventColor={() => "var(--accent)"}
        onSelectEvent={vi.fn()}
      />,
    );

    const grid = screen.getByTestId("calendar-time-grid");
    expect(grid).toHaveAttribute("data-layout", "day");
    expect(screen.getByText("00:00")).toBeInTheDocument();
    expect(screen.getByText("23:00")).toBeInTheDocument();
    expect(screen.getByText("Standup")).toBeInTheDocument();
  });

  it("reports clicked time slot on empty grid area", () => {
    const onSelectTimeSlot = vi.fn();
    render(
      <CalendarDayGrid
        date={new Date("2026-06-17T12:00:00")}
        events={[]}
        getEventColor={() => "var(--accent)"}
        onSelectEvent={vi.fn()}
        onSelectTimeSlot={onSelectTimeSlot}
      />,
    );

    const column = screen.getByTestId("calendar-day-column-2026-06-17");
    vi.spyOn(column, "getBoundingClientRect").mockReturnValue({
      top: 0,
      left: 0,
      right: 200,
      bottom: 24 * CALENDAR_HOUR_HEIGHT_PX,
      width: 200,
      height: 24 * CALENDAR_HOUR_HEIGHT_PX,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    fireEvent.click(column, { clientY: 10 * CALENDAR_HOUR_HEIGHT_PX });

    expect(onSelectTimeSlot).toHaveBeenCalledTimes(1);
    const [, start] = onSelectTimeSlot.mock.calls[0] as [Date, Date];
    expect(start.getHours()).toBe(10);
    expect(start.getMinutes()).toBe(0);
  });
});
