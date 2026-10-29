import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale, t } from "~/i18n/i18n";
import { DatePicker } from "./date-picker.ui";

function ControlledPicker() {
  const [value, setValue] = useState<Date | null>(new Date(2024, 0, 31));
  return <DatePicker value={value} onValueChange={setValue} />;
}
describe("DatePicker", () => {
  beforeEach(() => setLocale("en"));
  it("selects today from a different month and disables the shortcut outside the bounds", async () => {
    const user = userEvent.setup();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const previousMonth = new Date(today);
    previousMonth.setMonth(previousMonth.getMonth() - 2, 1);
    const onValueChange = vi.fn();
    const view = render(<DatePicker value={previousMonth} onValueChange={onValueChange} />);
    await user.click(screen.getByRole("button", { name: "Today" }));
    expect(onValueChange).toHaveBeenCalledWith(today);
    expect(screen.getByRole("grid")).toHaveAccessibleName(
      new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(today),
    );
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    onValueChange.mockClear();
    view.rerender(<DatePicker value={null} min={tomorrow} onValueChange={onValueChange} />);
    expect(screen.getByRole("button", { name: "Today" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Today" }));
    expect(onValueChange).not.toHaveBeenCalled();
  });
  it("selects an adjacent month's date without mutating the supplied value", async () => {
    const user = userEvent.setup();
    const value = new Date(2025, 11, 31, 10, 58);
    const onValueChange = vi.fn();
    render(<DatePicker value={value} onValueChange={onValueChange} />);
    await user.click(screen.getByRole("button", { name: "Thursday, January 1, 2026" }));
    expect(onValueChange).toHaveBeenCalledWith(new Date(2026, 0, 1));
    expect(value.getTime()).toBe(new Date(2025, 11, 31, 10, 58).getTime());
    expect(screen.getByRole("grid")).toHaveAccessibleName("January 2026");
  });
  it("navigates month ends and leap days with the keyboard without selecting until Enter", async () => {
    const user = userEvent.setup();
    render(<ControlledPicker />);
    screen.getByRole("button", { name: "Wednesday, January 31, 2024" }).focus();
    await user.keyboard("{PageDown}");
    const leapDay = await screen.findByRole("button", { name: "Thursday, February 29, 2024" });
    await vi.waitFor(() => expect(leapDay).toHaveFocus());
    expect(leapDay.closest("td")).toHaveAttribute("aria-selected", "false");
    await user.keyboard("{Enter}");
    expect(leapDay.closest("td")).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowRight}");
    await vi.waitFor(() =>
      expect(screen.getByRole("button", { name: "Friday, March 1, 2024" })).toHaveFocus(),
    );
  });
  it("ignores times in inclusive date bounds and keeps weekends selectable", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <DatePicker
        value={new Date(2025, 10, 10)}
        min={new Date(2025, 10, 10, 18)}
        max={new Date(2025, 10, 15, 20)}
        onValueChange={onValueChange}
      />,
    );
    expect(screen.getByRole("button", { name: "Sunday, November 9, 2025" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Saturday, November 15, 2025" })).toBeEnabled();
    expect(screen.getByRole("button", { name: t("datePicker.previousMonth") })).toBeDisabled();
    expect(screen.getByRole("button", { name: t("datePicker.nextMonth") })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Monday, November 10, 2025" }));
    expect(onValueChange).toHaveBeenCalledWith(new Date(2025, 10, 10));
  });
  it("follows controlled changes and changing bounds without trapping the calendar", () => {
    const onValueChange = vi.fn();
    const view = render(
      <DatePicker
        value={null}
        defaultMonth={new Date(2025, 10, 1)}
        onValueChange={onValueChange}
      />,
    );
    expect(screen.getByRole("grid")).toHaveAccessibleName("November 2025");
    view.rerender(
      <DatePicker value={null} min={new Date(2026, 3, 1)} onValueChange={onValueChange} />,
    );
    expect(screen.getByRole("grid")).toHaveAccessibleName("April 2026");
    view.rerender(<DatePicker value={new Date(2026, 0, 1)} onValueChange={onValueChange} />);
    expect(screen.getByRole("grid")).toHaveAccessibleName("January 2026");
    view.rerender(<DatePicker value={null} onValueChange={onValueChange} disabled />);
    expect(
      screen.getAllByRole<HTMLButtonElement>("button").every((button) => button.disabled),
    ).toBe(true);
  });
  it("localizes calendar labels and disables an inverted range", () => {
    setLocale("ru");
    const onValueChange = vi.fn();
    render(
      <DatePicker
        value={new Date(2025, 10, 10)}
        min={new Date(2025, 10, 15)}
        max={new Date(2025, 10, 10)}
        onValueChange={onValueChange}
      />,
    );
    expect(screen.getByRole("group", { name: "Дата" })).toBeInTheDocument();
    const day = screen.getByRole("button", {
      name: new Intl.DateTimeFormat("ru", { dateStyle: "full" }).format(new Date(2025, 10, 10)),
    });
    fireEvent.click(day);
    expect(onValueChange).not.toHaveBeenCalled();
  });
});
