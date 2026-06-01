import { renderHook } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDismissOnOutsideAndEscape } from "./use-dismiss-on-outside-escape.hook";

describe("useDismissOnOutsideAndEscape", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls onDismiss on Escape when enabled", () => {
    const onDismiss = vi.fn();
    const containerRef = createRef<HTMLDivElement>();
    const container = document.createElement("div");
    containerRef.current = container;
    document.body.appendChild(container);

    renderHook(() =>
      useDismissOnOutsideAndEscape({
        enabled: true,
        containerRef,
        onDismiss,
      }),
    );

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(onDismiss).toHaveBeenCalledTimes(1);

    container.remove();
  });

  it("calls onDismiss on mousedown outside container", () => {
    const onDismiss = vi.fn();
    const containerRef = createRef<HTMLDivElement>();
    const container = document.createElement("div");
    const outside = document.createElement("button");
    containerRef.current = container;
    document.body.appendChild(container);
    document.body.appendChild(outside);

    renderHook(() =>
      useDismissOnOutsideAndEscape({
        enabled: true,
        containerRef,
        onDismiss,
      }),
    );

    outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(onDismiss).toHaveBeenCalledTimes(1);

    outside.remove();
    container.remove();
  });

  it("does not call onDismiss for mousedown inside container", () => {
    const onDismiss = vi.fn();
    const containerRef = createRef<HTMLDivElement>();
    const container = document.createElement("div");
    const inner = document.createElement("button");
    container.appendChild(inner);
    containerRef.current = container;
    document.body.appendChild(container);

    renderHook(() =>
      useDismissOnOutsideAndEscape({
        enabled: true,
        containerRef,
        onDismiss,
      }),
    );

    inner.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(onDismiss).not.toHaveBeenCalled();

    container.remove();
  });

  it("does nothing when disabled", () => {
    const onDismiss = vi.fn();
    const containerRef = createRef<HTMLDivElement>();

    renderHook(() =>
      useDismissOnOutsideAndEscape({
        enabled: false,
        containerRef,
        onDismiss,
      }),
    );

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
