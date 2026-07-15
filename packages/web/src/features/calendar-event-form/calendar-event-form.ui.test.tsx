import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CalendarInfo } from "~/entities/calendar/calendar.types";
import { setLocale } from "~/i18n/i18n";
import { renderWithProviders } from "~/test/render";
import { CalendarEventFormDialog } from "./calendar-event-form.ui";

function calendar(id: string, displayName: string): CalendarInfo {
  return { id, displayName, color: null };
}

describe("CalendarEventFormDialog", () => {
  afterEach(() => setLocale("en"));

  it("preserves the draft when calendars rerender with the same logical set", async () => {
    setLocale("en");
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const props = {
      open: true,
      initialEvent: null,
      focusDate: new Date("2026-07-15T10:00:00Z"),
      saving: false,
      onOpenChange: vi.fn(),
      onSubmit,
    };
    const firstCalendars = [calendar("work", "Work"), calendar("personal", "Personal")];
    const view = renderWithProviders(
      <CalendarEventFormDialog {...props} calendars={firstCalendars} />,
    );

    const title = screen.getByLabelText("Title");
    const save = screen.getByRole("button", { name: "Save" });
    fireEvent.change(title, { target: { value: "Provider sync review" } });
    expect(save).toBeEnabled();

    view.rerender(
      <CalendarEventFormDialog
        {...props}
        calendars={[calendar("work", "Work refreshed"), calendar("personal", "Personal")]}
      />,
    );

    expect(screen.getByLabelText("Title")).toHaveValue("Provider sync review");
    expect(save).toBeEnabled();
    fireEvent.click(save);

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ summary: "Provider sync review", calendarId: "work" }),
      ),
    );
  });
});
