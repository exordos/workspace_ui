import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildEventsByDay, buildMonthGrid } from "~/entities/calendar/calendar.lib";
import type { CalendarEvent } from "~/entities/calendar/calendar.types";
import { CalendarMonthGrid } from "./calendar-month-grid.ui";

const event: CalendarEvent = {
  uid: "evt-1",
  calendarId: "work",
  summary: "Architecture review",
  description: null,
  location: null,
  start: "2026-06-17T10:00:00",
  end: "2026-06-17T11:00:00",
  allDay: false,
  recurrence: null,
  attendees: [],
  alarms: [],
  recurrenceId: null,
  isRecurringInstance: false,
};

describe("CalendarMonthGrid", () => {
  it("uses grid cells with sibling day and event buttons", () => {
    const cells = buildMonthGrid(new Date("2026-06-17T12:00:00"));
    const onSelectDay = vi.fn();
    const onSelectEvent = vi.fn();
    render(
      <CalendarMonthGrid
        cells={cells}
        eventsByDay={buildEventsByDay(
          [event],
          cells.map((cell) => cell.isoDate),
        )}
        selectedIsoDate="2026-06-17"
        getEventColor={() => "rgb(12, 34, 56)"}
        onSelectDay={onSelectDay}
        onSelectEvent={onSelectEvent}
      />,
    );

    const cell = screen.getByRole("gridcell", { name: /6\/17\/2026|17\/6\/2026/ });
    const dayButton = within(cell).getByRole("button", { name: "17" });
    const eventButton = within(cell).getByRole("button", {
      name: /10:00 Architecture review/,
    });

    expect(dayButton).not.toContainElement(eventButton);
    expect(eventButton.parentElement?.closest("button")).toBeNull();
    fireEvent.click(eventButton);
    expect(onSelectEvent).toHaveBeenCalledWith("evt-1", null);
    expect(onSelectDay).not.toHaveBeenCalled();
    fireEvent.click(dayButton);
    expect(onSelectDay).toHaveBeenCalledTimes(1);
  });
});
