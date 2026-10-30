import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale } from "~/i18n/i18n";
import { TimePicker } from "./time-picker.ui";
function ControlledPicker({
  showSeconds = false,
  showArrows = true,
}: Readonly<{ showSeconds?: boolean; showArrows?: boolean }>) {
  const [value, setValue] = useState<string | null>(showSeconds ? "10:30:15" : "10:58");
  return (
    <TimePicker
      value={value}
      onValueChange={setValue}
      showSeconds={showSeconds}
      showArrows={showArrows}
    />
  );
}
describe("TimePicker", () => {
  beforeEach(() => setLocale("en"));
  it.each([
    ["en", ["h.", "m.", "s."]],
    ["ru", ["ч.", "м.", "с."]],
  ] as const)("uses localized inline unit abbreviations in %s", (locale, suffixes) => {
    setLocale(locale);
    render(<TimePicker value="10:58:32" showSeconds onValueChange={vi.fn()} />);
    for (const suffix of suffixes) expect(screen.getByText(suffix)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/^10:58:32$/);
    expect(screen.getAllByRole("spinbutton")).toHaveLength(3);
  });
  it("scrolls each hovered segment without focus and consumes scrolling at the bounds", () => {
    render(<ControlledPicker showSeconds showArrows={false} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    const wheel = (unit: string, deltaY: number) =>
      fireEvent.wheel(screen.getByRole("group", { name: unit }), { deltaY, cancelable: true });
    expect(wheel("Hours", -100)).toBe(false);
    expect(screen.getByText("11:30:15")).toBeInTheDocument();
    wheel("Minutes", 100);
    wheel("Minutes", 100);
    wheel("Seconds", -100);
    expect(screen.getByText("11:28:16")).toBeInTheDocument();
    expect(
      screen.getAllByRole("spinbutton").every((input) => input !== document.activeElement),
    ).toBe(true);
    for (let index = 0; index < 30; index++) wheel("Hours", -100);
    expect(screen.getByText("23:28:16")).toBeInTheDocument();
    expect(wheel("Hours", -100)).toBe(false);
    expect(screen.getByText("23:28:16")).toBeInTheDocument();
    screen.getByRole("spinbutton", { name: "Minutes" }).focus();
    fireEvent.keyDown(screen.getByRole("spinbutton", { name: "Minutes" }), { key: "ArrowDown" });
    expect(screen.getByText("23:27:16")).toBeInTheDocument();
  });
  it("accumulates fine trackpad movement and resets it on direction changes or leaving", () => {
    render(<ControlledPicker />);
    const minutes = screen.getByRole("group", { name: "Minutes" });
    const wheel = (deltaY: number) => fireEvent.wheel(minutes, { deltaY, cancelable: true });
    wheel(8);
    wheel(8);
    expect(screen.getByText("10:58")).toBeInTheDocument();
    wheel(8);
    expect(screen.getByText("10:57")).toBeInTheDocument();
    wheel(16);
    wheel(-16);
    expect(screen.getByText("10:57")).toBeInTheDocument();
    fireEvent.mouseLeave(minutes);
    wheel(-8);
    expect(screen.getByText("10:57")).toBeInTheDocument();
    fireEvent.wheel(minutes, { deltaY: -1, deltaMode: 1, cancelable: true });
    expect(screen.getByText("10:58")).toBeInTheDocument();
  });
  it("leaves disabled, zoom, horizontal and preview scrolling alone", () => {
    const onValueChange = vi.fn();
    const view = render(<TimePicker value="10:58" onValueChange={onValueChange} />);
    const hours = screen.getByRole("group", { name: "Hours" });
    expect(fireEvent.wheel(hours, { deltaY: -100, ctrlKey: true, cancelable: true })).toBe(true);
    expect(fireEvent.wheel(hours, { deltaX: 100, deltaY: 1, cancelable: true })).toBe(true);
    expect(fireEvent.wheel(screen.getByText("10:58"), { deltaY: -100, cancelable: true })).toBe(
      true,
    );
    view.rerender(<TimePicker value="10:58" disabled onValueChange={onValueChange} />);
    expect(fireEvent.wheel(hours, { deltaY: -100, cancelable: true })).toBe(true);
    expect(onValueChange).not.toHaveBeenCalled();
  });
  it("edits hours and minutes independently, commits on blur and supports keyboard stepping", async () => {
    const user = userEvent.setup();
    render(<ControlledPicker />);
    const hours = screen.getByRole("spinbutton", { name: "Hours" });
    await user.clear(hours);
    await user.type(hours, "23");
    await user.tab();
    expect(screen.getByText("23:58")).toBeInTheDocument();
    const minutes = screen.getByRole("spinbutton", { name: "Minutes" });
    await user.click(minutes);
    await user.keyboard("{ArrowUp}");
    expect(screen.getByText("23:59")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Increase Minutes" })).toBeDisabled();
    await user.clear(minutes);
    await user.type(minutes, "00{Enter}");
    expect(screen.getByText("23:00")).toBeInTheDocument();
    await user.clear(hours);
    await user.type(hours, "12{ArrowUp}");
    expect(screen.getByText("13:00")).toBeInTheDocument();
  });
  it("respects bounds and excludes unavailable hours when stepping", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const view = render(
      <TimePicker value="09:30" min="09:30" max="10:15" onValueChange={onValueChange} />,
    );
    expect(screen.getByRole("button", { name: "Decrease Minutes" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Increase Hours" }));
    expect(onValueChange).toHaveBeenLastCalledWith("10:15");
    view.rerender(
      <TimePicker
        value="11:45"
        isTimeDisabled={(value) => value >= "12:00" && value < "14:00"}
        onValueChange={onValueChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Increase Hours" }));
    expect(onValueChange).toHaveBeenLastCalledWith("14:45");
  });
  it("can start empty and disables all controls for invalid bounds or the disabled prop", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const view = render(<TimePicker value={null} min="09:30" onValueChange={onValueChange} />);
    await user.click(screen.getByRole("button", { name: "Increase Hours" }));
    expect(onValueChange).toHaveBeenCalledWith("09:30");
    view.rerender(<TimePicker value="00:00" disabled onValueChange={onValueChange} />);
    expect(
      screen.getAllByRole<HTMLButtonElement>("button").every((button) => button.disabled),
    ).toBe(true);
    expect(
      screen.getAllByRole<HTMLInputElement>("spinbutton").every((input) => input.disabled),
    ).toBe(true);
    view.rerender(<TimePicker value={null} min="25:00" onValueChange={onValueChange} />);
    expect(
      screen.getAllByRole<HTMLInputElement>("spinbutton").every((input) => input.disabled),
    ).toBe(true);
  });
  it("reverts invalid edits and leaves the caller's value unchanged", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<TimePicker value="10:58" onValueChange={onValueChange} />);
    const hours = screen.getByRole("spinbutton", { name: "Hours" });
    await user.clear(hours);
    await user.type(hours, "99");
    await user.tab();
    expect(hours).toHaveValue("10");
    expect(onValueChange).not.toHaveBeenCalled();
  });
  it("offers optional second precision and includes seconds in its bounds", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <TimePicker
        value="10:58:32"
        showSeconds
        min="10:58:32"
        max="10:58:33"
        onValueChange={onValueChange}
      />,
    );
    expect(screen.getByRole("spinbutton", { name: "Seconds" })).toHaveValue("32");
    expect(screen.getByRole("button", { name: "Decrease Seconds" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Increase Seconds" }));
    expect(onValueChange).toHaveBeenCalledWith("10:58:33");
  });
  it("renders the stored time without segments, arrows or focus targets", () => {
    render(<TimePicker readOnly value="10:58:32" showSeconds onValueChange={vi.fn()} />);
    expect(screen.getByRole("group", { name: "Time" })).toBeInTheDocument();
    expect(screen.queryAllByRole("spinbutton")).toHaveLength(0);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByRole("status")).toHaveTextContent(/^10:58:32$/);
    expect(screen.getByRole("group", { name: "Hours" })).toHaveTextContent("10");
    expect(screen.getByRole("group", { name: "Seconds" })).toHaveTextContent("32");
    expect(document.querySelectorAll("[tabindex]")).toHaveLength(0);
  });
});
