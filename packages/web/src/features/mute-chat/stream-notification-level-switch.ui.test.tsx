import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StreamNotificationLevelSwitch } from "./stream-notification-level-switch.ui";

describe("StreamNotificationLevelSwitch", () => {
  it("renders three notification level options", () => {
    render(<StreamNotificationLevelSwitch value="default" onChange={vi.fn()} />);

    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(screen.getByRole("radio", { name: /mentions only/i })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("calls onChange when selecting a different level", () => {
    const onChange = vi.fn();
    render(<StreamNotificationLevelSwitch value="default" onChange={onChange} />);

    fireEvent.click(screen.getByRole("radio", { name: /muted/i }));
    expect(onChange).toHaveBeenCalledWith("muted");
  });

  it("does not call onChange when clicking the active level", () => {
    const onChange = vi.fn();
    render(<StreamNotificationLevelSwitch value="subscribed" onChange={onChange} />);

    fireEvent.click(screen.getByRole("radio", { name: /all messages/i }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
