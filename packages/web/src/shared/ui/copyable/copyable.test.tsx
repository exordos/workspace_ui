import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Copyable } from "./copyable";

describe("Copyable", () => {
  afterEach(() => vi.useRealTimers());

  it("shows success temporarily and restarts the timer after another copy", async () => {
    vi.useFakeTimers();
    render(<Copyable onCopy={() => Promise.resolve(true)} showOnHover={false} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy text" }));
      await Promise.resolve();
    });
    expect(screen.getByRole("button", { name: "Copied" })).toHaveAttribute(
      "data-copy-state",
      "success",
    );
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copied" }));
      await Promise.resolve();
    });
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByRole("button", { name: "Copy text" })).toBeInTheDocument();
  });
});
