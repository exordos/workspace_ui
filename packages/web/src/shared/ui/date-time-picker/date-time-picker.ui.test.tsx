import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale } from "~/i18n/i18n";
import { DateTimePicker } from "./date-time-picker.ui";
function ControlledPicker() {
  const [value, setValue] = useState<Date | null>(new Date(2025, 10, 10, 10, 58));
  return <DateTimePicker value={value} onValueChange={setValue} />;
}
describe("DateTimePicker composition", () => {
  beforeEach(() => setLocale("en"));
  it("combines the real DatePicker and TimePicker while preserving the other part", async () => {
    const user = userEvent.setup();
    render(<ControlledPicker />);
    expect(screen.getByRole("group", { name: "Date" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Time" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tuesday, November 11, 2025" }));
    expect(screen.getByText("10:58")).toBeInTheDocument();
    await user.clear(screen.getByRole("spinbutton", { name: "Hours" }));
    await user.type(screen.getByRole("spinbutton", { name: "Hours" }), "12{Enter}");
    expect(screen.getByText("12:58")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Tuesday, November 11, 2025" }).closest("td"),
    ).toHaveAttribute("aria-selected", "true");
    fireEvent.wheel(screen.getByRole("group", { name: "Minutes" }), {
      deltaY: 100,
      cancelable: true,
    });
    expect(screen.getByText("12:57")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Tuesday, November 11, 2025" }).closest("td"),
    ).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("button", { name: "Today" }));
    expect(screen.getByText("12:57")).toBeInTheDocument();
    expect(
      screen
        .getByRole("button", {
          name: new Intl.DateTimeFormat("en", { dateStyle: "full" }).format(new Date()),
        })
        .closest("td"),
    ).toHaveAttribute("aria-selected", "true");
  });
  it("rounds bounds to available minutes and clamps the old time on a boundary day", async () => {
    const user = userEvent.setup();
    const value = new Date(2025, 10, 11, 10, 58);
    const onValueChange = vi.fn();
    const min = new Date(2025, 10, 10, 12, 30, 1);
    const view = render(
      <DateTimePicker
        value={value}
        min={min}
        max={new Date(2025, 10, 12, 18, 15, 59)}
        onValueChange={onValueChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Monday, November 10, 2025" }));
    expect(onValueChange).toHaveBeenLastCalledWith(new Date(2025, 10, 10, 12, 31));
    expect(value.getTime()).toBe(new Date(2025, 10, 11, 10, 58).getTime());
    view.rerender(
      <DateTimePicker
        value={new Date(2025, 10, 12, 18, 0)}
        max={new Date(2025, 10, 12, 18, 15, 59)}
        onValueChange={onValueChange}
      />,
    );
    const minutes = screen.getByRole("spinbutton", { name: "Minutes" });
    await user.clear(minutes);
    await user.type(minutes, "15{Enter}");
    expect(onValueChange).toHaveBeenLastCalledWith(new Date(2025, 10, 12, 18, 15));
  });
  it("keeps time disabled until a date exists and passes child presentation props through", () => {
    const view = render(
      <DateTimePicker
        value={null}
        defaultMonth={new Date(2025, 10, 1)}
        onValueChange={vi.fn()}
        datePickerProps={{ "aria-label": "Choose date", className: "calendar-example" }}
        timePickerProps={{ "aria-label": "Choose time" }}
      />,
    );
    expect(screen.getByRole("group", { name: "Choose date" })).toHaveClass("calendar-example");
    expect(screen.getByRole("group", { name: "Choose time" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    view.rerender(
      <DateTimePicker
        value={new Date(2025, 10, 10)}
        min={new Date(2025, 10, 10, 12)}
        max={new Date(2025, 10, 10, 10)}
        onValueChange={vi.fn()}
      />,
    );
    expect(
      screen.getAllByRole<HTMLButtonElement>("button").every((button) => button.disabled),
    ).toBe(true);
  });
  it("preserves and edits optional seconds with accessible controls and no arrow buttons", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <DateTimePicker
        value={new Date(2025, 10, 10, 10, 58, 32)}
        showSeconds
        showArrows={false}
        onValueChange={onValueChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Tuesday, November 11, 2025" }));
    expect(onValueChange).toHaveBeenLastCalledWith(new Date(2025, 10, 11, 10, 58, 32));
    expect(
      within(screen.getByRole("group", { name: "Time" })).queryByRole("button"),
    ).not.toBeInTheDocument();
    fireEvent.wheel(screen.getByRole("group", { name: "Seconds" }), {
      deltaY: -100,
      cancelable: true,
    });
    expect(onValueChange).toHaveBeenLastCalledWith(new Date(2025, 10, 10, 10, 58, 33));
  });
});
