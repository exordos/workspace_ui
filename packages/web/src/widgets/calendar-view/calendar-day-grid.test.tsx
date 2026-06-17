import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
});
