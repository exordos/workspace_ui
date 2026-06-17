import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "~/test/render";

vi.mock("~/widgets/calendar-view/calendar-view.ui", () => ({
  CalendarView: () => <div data-testid="calendar-view">CalendarView</div>,
}));

describe("CalendarPage", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("renders not configured fallback when mail API origin is empty", async () => {
    vi.stubEnv("VITE_MAIL_API_ORIGIN", "");
    vi.resetModules();
    const { CalendarPage } = await import("./calendar-page.ui");

    renderWithProviders(<CalendarPage />);

    expect(screen.getByText(/calendar is not configured/i)).toBeInTheDocument();
    expect(screen.queryByTestId("calendar-view")).not.toBeInTheDocument();
  });

  it("renders native calendar view when API is configured", async () => {
    vi.stubEnv("VITE_MAIL_API_ORIGIN", "/mail-api");
    vi.resetModules();
    const { CalendarPage } = await import("./calendar-page.ui");

    renderWithProviders(<CalendarPage />);

    expect(screen.getByTestId("calendar-view")).toBeInTheDocument();
  });
});
