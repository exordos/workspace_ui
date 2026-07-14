import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "~/test/render";
import { CalendarPage } from "./calendar-page.ui";

vi.mock("~/widgets/calendar-view/calendar-view.ui", () => ({
  CalendarView: () => <div data-testid="calendar-view">CalendarView</div>,
}));

describe("CalendarPage", () => {
  it("opens the local calendar with the current Workspace IAM session", () => {
    renderWithProviders(<CalendarPage />);
    expect(screen.getByTestId("calendar-view")).toBeInTheDocument();
  });
});
