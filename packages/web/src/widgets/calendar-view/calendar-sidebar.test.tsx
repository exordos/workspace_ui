import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CalendarInfo } from "~/entities/calendar/calendar.types";
import { CalendarSidebarPanel } from "./calendar-sidebar.ui";

const calendars: CalendarInfo[] = [{ id: "work", displayName: "Work", color: "rgb(12, 34, 56)" }];

describe("CalendarSidebarPanel", () => {
  it("navigates its mini-calendar independently and exposes row actions", () => {
    const onSelectDate = vi.fn();
    render(
      <CalendarSidebarPanel
        open
        calendars={calendars}
        visibleCalendarIds={["work"]}
        focusDate={new Date("2026-01-15T12:00:00")}
        onToggleCalendar={vi.fn()}
        onSelectDate={onSelectDate}
        onCreateCalendar={vi.fn()}
        onDeleteCalendar={vi.fn()}
        onRenameCalendar={vi.fn()}
        getCalendarColor={(calendar) => calendar.color ?? "var(--accent)"}
      />,
    );

    const sidebar = screen.getByRole("complementary");
    expect(sidebar).toHaveClass("md:w-16", "lg:w-60");
    expect(screen.getByText(/January 2026/).parentElement?.parentElement).toHaveClass("lg:block");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText(/February 2026/)).toBeInTheDocument();
    expect(onSelectDate).not.toHaveBeenCalled();

    expect(screen.getByRole("checkbox", { name: "Work" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Rename calendar" })).toHaveClass(
      "focus-visible:opacity-100",
    );
    expect(screen.getByRole("button", { name: "Delete calendar" })).toHaveClass(
      "focus-visible:opacity-100",
    );
  });
});
