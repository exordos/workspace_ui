import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "~/test/render";

describe("CalendarPage", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("renders embeddable calendar placeholder page by default", async () => {
    vi.resetModules();
    const { CalendarPage } = await import("./calendar-page.ui");

    renderWithProviders(<CalendarPage />);

    const frame = screen.getByTitle(/calendar/i);
    expect(frame).toBeInTheDocument();
    expect(frame).toHaveAttribute(
      "src",
      expect.stringContaining("/embeds/calendar-placeholder.html"),
    );
  });

  it("uses configurable calendar embed URL", async () => {
    vi.stubEnv("VITE_CALENDAR_EMBED_URL", "https://calendar.example.com/mock.html");
    vi.stubEnv("VITE_EMBED_ALLOWED_ORIGINS", "https://calendar.example.com");
    vi.resetModules();
    const { CalendarPage } = await import("./calendar-page.ui");

    renderWithProviders(<CalendarPage />);

    expect(screen.getByTitle(/calendar/i)).toHaveAttribute(
      "src",
      "https://calendar.example.com/mock.html",
    );
  });
});
