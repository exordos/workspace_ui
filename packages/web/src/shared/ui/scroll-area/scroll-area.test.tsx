import { fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ScrollArea } from "./scroll-area";
import type { ScrollAreaProps } from "./scroll-area.types";

function setScrollSize(element: HTMLElement, clientWidth = 200, scrollWidth = 600) {
  Object.defineProperties(element, {
    clientWidth: { configurable: true, value: clientWidth },
    scrollWidth: { configurable: true, value: scrollWidth },
  });
}

function renderArea(props: Omit<ScrollAreaProps, "children"> = {}) {
  const view = render(
    <ScrollArea axis="x" role="region" aria-label="Actions" {...props}>
      <button type="button">Action</button>
    </ScrollArea>,
  );
  const area = screen.getByRole("region", { name: "Actions" });
  setScrollSize(area);
  return { ...view, area };
}

describe("ScrollArea horizontal wheel", () => {
  it("scrolls from a child without moving focus or swallowing the caller's handler", () => {
    const onWheel = vi.fn();
    const { area } = renderArea({ onWheel });
    const button = screen.getByRole("button", { name: "Action" });
    button.focus();

    expect(fireEvent.wheel(button, { deltaY: 80, cancelable: true })).toBe(false);
    expect(area.scrollLeft).toBe(80);
    expect(fireEvent.wheel(button, { deltaY: -30, cancelable: true })).toBe(false);
    expect(area.scrollLeft).toBe(50);
    expect(button).toHaveFocus();
    expect(onWheel).toHaveBeenCalledTimes(2);
  });

  it("clamps movement and releases outward wheel events at either edge", () => {
    const { area } = renderArea();
    const wheel = (deltaY: number) => fireEvent.wheel(area, { deltaY, cancelable: true });

    expect(wheel(-100)).toBe(true);
    expect(area.scrollLeft).toBe(0);
    expect(wheel(1000)).toBe(false);
    expect(area.scrollLeft).toBe(400);
    expect(wheel(100)).toBe(true);
    expect(area.scrollLeft).toBe(400);
    expect(wheel(-1000)).toBe(false);
    expect(area.scrollLeft).toBe(0);
    expect(wheel(-100)).toBe(true);
  });

  it("leaves the outer scroll available when content fits", () => {
    const { area } = renderArea();
    setScrollSize(area, 200, 200);
    expect(fireEvent.wheel(area, { deltaY: 100, cancelable: true })).toBe(true);
    expect(area.scrollLeft).toBe(0);
  });

  it.each([
    { deltaX: 80, deltaY: 0 },
    { deltaX: 1, deltaY: 80 },
    { deltaY: 80, ctrlKey: true },
    { deltaY: 80, metaKey: true },
    { deltaY: 80, altKey: true },
    { deltaY: 80, shiftKey: true },
    { deltaY: 0 },
    { deltaY: 80, cancelable: false },
  ])("preserves native wheel input for %j", (event) => {
    const { area } = renderArea();
    expect(fireEvent.wheel(area, { cancelable: true, ...event })).toBe(true);
    expect(area.scrollLeft).toBe(0);
  });

  it.each([
    [WheelEvent.DOM_DELTA_LINE, 48],
    [WheelEvent.DOM_DELTA_PAGE, 400],
  ])("normalizes wheel delta mode %s", (deltaMode, expected) => {
    const { area } = renderArea({ style: { lineHeight: "24px" } });
    expect(fireEvent.wheel(area, { deltaY: 2, deltaMode, cancelable: true })).toBe(false);
    expect(area.scrollLeft).toBe(expected);
  });

  it.each([{ axis: "y" }, { axis: "both" }, { horizontalWheel: false }] as const)(
    "keeps native scrolling for %j",
    (props) => {
      const { area } = renderArea(props);
      expect(fireEvent.wheel(area, { deltaY: 80, cancelable: true })).toBe(true);
      expect(area.scrollLeft).toBe(0);
    },
  );

  it("updates the listener when the axis or wheel option changes and cleans it up", () => {
    const content = (props: Pick<ScrollAreaProps, "axis" | "horizontalWheel">) => (
      <StrictMode>
        <ScrollArea {...props}>Actions</ScrollArea>
      </StrictMode>
    );
    const view = render(content({ axis: "x" }));
    const area = screen.getByText("Actions");
    setScrollSize(area);
    const wheel = () => fireEvent.wheel(area, { deltaY: 40, cancelable: true });

    expect(wheel()).toBe(false);
    expect(area.scrollLeft).toBe(40);
    view.rerender(content({ axis: "y" }));
    expect(wheel()).toBe(true);
    view.rerender(content({ axis: "x", horizontalWheel: false }));
    expect(wheel()).toBe(true);
    view.rerender(content({ axis: "x" }));
    expect(wheel()).toBe(false);
    expect(area.scrollLeft).toBe(80);
    view.unmount();
    expect(wheel()).toBe(true);
    expect(area.scrollLeft).toBe(80);
  });

  it("lets a nested area handle the wheel first, then scrolls the parent at its edge", () => {
    render(
      <ScrollArea axis="x" role="region" aria-label="Outer">
        <ScrollArea axis="x" role="region" aria-label="Inner">
          Content
        </ScrollArea>
      </ScrollArea>,
    );
    const inner = screen.getByRole("region", { name: "Inner" });
    const outer = screen.getByRole("region", { name: "Outer" });
    setScrollSize(inner);
    setScrollSize(outer);
    expect(fireEvent.wheel(inner, { deltaY: 400, cancelable: true })).toBe(false);
    expect(inner.scrollLeft).toBe(400);
    expect(outer.scrollLeft).toBe(0);
    expect(fireEvent.wheel(inner, { deltaY: 80, cancelable: true })).toBe(false);
    expect(inner.scrollLeft).toBe(400);
    expect(outer.scrollLeft).toBe(80);
  });

  it("uses logical forward and backward movement in RTL", () => {
    const { area } = renderArea({ style: { direction: "rtl" } });
    expect(fireEvent.wheel(area, { deltaY: 80, cancelable: true })).toBe(false);
    expect(area.scrollLeft).toBe(-80);
    expect(fireEvent.wheel(area, { deltaY: -80, cancelable: true })).toBe(false);
    expect(area.scrollLeft).toBeCloseTo(0);
    expect(fireEvent.wheel(area, { deltaY: -80, cancelable: true })).toBe(true);
  });
});
