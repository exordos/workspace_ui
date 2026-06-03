// Tests for shared scroll-to-bottom helper.
// Covers instant mode for auto-scrolls and smooth mode for explicit user actions.
import { afterEach, describe, expect, it, vi } from "vitest";
import { scrollToBottom } from "./scroll-position.lib";

// Preserve original matchMedia so tests restore the environment afterward.
const originalMatchMedia = typeof window === "undefined" ? undefined : window.matchMedia;

// Creates a test DOM element with a given content height.
// Used to verify which scrollTop value the helper sets.
function createScrollElement(scrollHeight: number): HTMLDivElement {
  const el = document.createElement("div");
  Object.defineProperty(el, "scrollHeight", {
    configurable: true,
    value: scrollHeight,
  });

  return el;
}

describe("scrollToBottom", () => {
  afterEach(() => {
    if (typeof window === "undefined") {
      return;
    }

    // Restore matchMedia after each test so mocks do not leak between cases.
    if (typeof originalMatchMedia === "function") {
      window.matchMedia = originalMatchMedia;
      return;
    }

    Reflect.deleteProperty(window, "matchMedia");
  });

  it("scrolls instantly by default", () => {
    const el = createScrollElement(960);
    const scrollTo = vi.fn();
    Object.defineProperty(el, "scrollTo", {
      configurable: true,
      value: scrollTo,
    });

    scrollToBottom(el);

    expect(scrollTo).toHaveBeenCalledWith({ top: 960, behavior: "instant" });
  });

  it("uses smooth behavior when requested", () => {
    const el = createScrollElement(720);
    const scrollTo = vi.fn();
    Object.defineProperty(el, "scrollTo", {
      configurable: true,
      value: scrollTo,
    });
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });

    scrollToBottom(el, "smooth");

    expect(scrollTo).toHaveBeenCalledWith({ top: 720, behavior: "smooth" });
  });

  it("falls back to instant when reduced motion is enabled", () => {
    const el = createScrollElement(640);
    const scrollTo = vi.fn();
    Object.defineProperty(el, "scrollTo", {
      configurable: true,
      value: scrollTo,
    });
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });

    scrollToBottom(el, "smooth");

    expect(scrollTo).toHaveBeenCalledWith({ top: 640, behavior: "instant" });
  });
});
