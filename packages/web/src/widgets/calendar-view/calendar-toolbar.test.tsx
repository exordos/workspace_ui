import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CalendarToolbar } from "./calendar-toolbar.ui";

describe("CalendarToolbar", () => {
  it("keeps navigation, search, view, import, and create actions in one toolbar", () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    const onToday = vi.fn();
    const onToggleSidebar = vi.fn();
    const onNewEvent = vi.fn();
    render(
      <CalendarToolbar
        viewMode="month"
        title="June 2026"
        searchQuery=""
        onSearchChange={vi.fn()}
        onImportIcs={vi.fn()}
        onViewModeChange={vi.fn()}
        onPrev={onPrev}
        onNext={onNext}
        onToday={onToday}
        onToggleSidebar={onToggleSidebar}
        onNewEvent={onNewEvent}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "My calendars" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "New event" }));

    expect(onToggleSidebar).toHaveBeenCalledTimes(1);
    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onToday).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onNewEvent).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Month" })).toHaveAttribute("aria-pressed", "true");
  });
});
