import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppTooltip } from "./app-tooltip.ui";

function renderTooltip(closeDelay?: number) {
  return render(
    <AppTooltip content="Files are stored without end-to-end encryption." closeDelay={closeDelay}>
      <button type="button" aria-describedby="existing-description">
        Chat information
      </button>
    </AppTooltip>,
  );
}

describe("AppTooltip", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("opens on hover, describes the actual trigger and allows reading inside the portal", () => {
    const { container } = renderTooltip();
    const button = screen.getByRole("button", { name: "Chat information" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.pointerEnter(button);
    const tooltip = screen.getByRole("tooltip");
    expect(button).toHaveAttribute("aria-describedby", `existing-description ${tooltip.id}`);
    expect(container).not.toContainElement(tooltip);

    fireEvent.pointerLeave(button);
    fireEvent.pointerEnter(tooltip);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(tooltip).toBeInTheDocument();
    fireEvent.pointerLeave(tooltip);
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(button).toHaveAttribute("aria-describedby", "existing-description");
  });

  it("uses a custom close delay and cancels it when the trigger is hovered again", () => {
    renderTooltip(500);
    const button = screen.getByRole("button", { name: "Chat information" });
    fireEvent.pointerEnter(button);
    fireEvent.pointerLeave(button);
    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.pointerEnter(button);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.pointerLeave(button);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("closes immediately with zero delay while preserving keyboard focus behavior", () => {
    renderTooltip(0);
    const button = screen.getByRole("button", { name: "Chat information" });
    fireEvent.pointerEnter(button);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.pointerLeave(button);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);

    act(() => button.focus());
    fireEvent.pointerEnter(button);
    fireEvent.pointerLeave(button);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    act(() => button.blur());
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("opens on keyboard focus, dismisses on Escape and releases focus normally", () => {
    renderTooltip();
    const button = screen.getByRole("button", { name: "Chat information" });
    act(() => button.focus());
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    fireEvent.keyDown(button, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(button).toHaveFocus();

    act(() => button.blur());
    act(() => button.focus());
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    act(() => button.blur());
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("keeps the tooltip visible while its trigger has keyboard focus", () => {
    renderTooltip();
    const button = screen.getByRole("button", { name: "Chat information" });
    act(() => button.focus());
    fireEvent.pointerEnter(button);
    fireEvent.pointerLeave(button);
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  it("scrolls overflowing content from the focused trigger without capturing Tab or Escape", () => {
    renderTooltip();
    const button = screen.getByRole("button", { name: "Chat information" });
    act(() => button.focus());
    const tooltip = screen.getByRole("tooltip");
    Object.defineProperties(tooltip, {
      scrollHeight: { value: 500 },
      clientHeight: { value: 100 },
    });
    expect(tooltip).toHaveAttribute("tabindex", "-1");

    const scrollCases = [
      ["ArrowDown", 40],
      ["PageDown", 140],
      ["ArrowUp", 100],
      ["PageUp", 0],
      ["End", 400],
      ["ArrowDown", 400],
      ["Home", 0],
    ] as const;
    for (const [key, scrollTop] of scrollCases) {
      expect(fireEvent.keyDown(button, { key })).toBe(false);
      expect(tooltip.scrollTop).toBe(scrollTop);
      expect(button).toHaveFocus();
      expect(tooltip).toBeInTheDocument();
    }
    expect(fireEvent.keyDown(button, { key: "ArrowDown", ctrlKey: true })).toBe(true);
    expect(tooltip.scrollTop).toBe(0);
    expect(fireEvent.keyDown(button, { key: "Tab" })).toBe(true);
    fireEvent.keyDown(button, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(fireEvent.keyDown(button, { key: "PageDown" })).toBe(true);
    act(() => button.blur());
    expect(button).not.toHaveFocus();
  });

  it("leaves scrolling keys alone when the panel fits or the trigger is only hovered", () => {
    renderTooltip();
    const button = screen.getByRole("button", { name: "Chat information" });
    act(() => button.focus());
    expect(fireEvent.keyDown(button, { key: "ArrowDown" })).toBe(true);
    const tooltip = screen.getByRole("tooltip");
    Object.defineProperties(tooltip, {
      scrollHeight: { value: 500 },
      clientHeight: { value: 100 },
    });
    fireEvent.pointerEnter(button);
    act(() => button.blur());
    expect(fireEvent.keyDown(button, { key: "PageDown" })).toBe(true);
    expect(tooltip.scrollTop).toBe(0);
  });

  it("aligns at the right viewport edge and flips upward when space below is limited", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      const tooltip = this.getAttribute("role") === "tooltip";
      const left = tooltip ? 0 : window.innerWidth - 36;
      const top = tooltip ? 0 : window.innerHeight - 36;
      const width = tooltip ? 320 : 32;
      const height = tooltip ? 180 : 32;
      return {
        x: left,
        y: top,
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
        toJSON: () => ({}),
      };
    });
    renderTooltip();
    fireEvent.pointerEnter(screen.getByRole("button", { name: "Chat information" }));
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveStyle({
      left: `${window.innerWidth - 320 - 12}px`,
      top: `${window.innerHeight - 36 - 8 - 180}px`,
      visibility: "visible",
      maxWidth: "calc(100vw - 24px)",
    });
  });

  it("cleans up its portal, dismissal timer and positioning listeners on unmount", () => {
    const removeListener = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderTooltip();
    const button = screen.getByRole("button", { name: "Chat information" });
    fireEvent.pointerEnter(button);
    fireEvent.pointerLeave(button);
    unmount();

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
    expect(removeListener).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(removeListener).toHaveBeenCalledWith("scroll", expect.any(Function), true);
  });
});
