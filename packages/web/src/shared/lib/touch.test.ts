/**
 * Tests for the touch/pointer input detection module.
 *
 * Verifies runtime detection of touch vs. pointer input, dynamic input mode
 * switching based on pointer events, and safe area inset reading. The app
 * adapts its UI (hover states, hit targets, swipe gestures) based on the
 * current input mode, so accurate detection is critical for cross-platform UX.
 */
import { describe, expect, it } from "vitest";
import {
  isTouchDevice,
  isCoarsePointer,
  getInputMode,
  initTouchTracking,
  getSafeAreaInsets,
} from "./touch";

// Verifies that detection functions return valid values in any environment
describe("touch detection", () => {
  // Must always return a boolean, even in environments without touch support
  it("isTouchDevice returns boolean", () => {
    expect(typeof isTouchDevice()).toBe("boolean");
  });

  // Coarse pointer detection drives larger hit targets on mobile
  it("isCoarsePointer returns boolean", () => {
    expect(typeof isCoarsePointer()).toBe("boolean");
  });

  // The app uses this to decide between hover-based and touch-based UI patterns
  it("getInputMode returns touch or pointer", () => {
    const mode = getInputMode();
    expect(["touch", "pointer"]).toContain(mode);
  });
});

// Verifies dynamic input mode switching based on actual pointer events
describe("initTouchTracking", () => {
  // jsdom has no touch capability, so it should default to pointer mode
  it("sets initial mode to pointer in jsdom", () => {
    initTouchTracking();
    expect(getInputMode()).toBe("pointer");
  });

  // Init must be idempotent since it may be called from multiple entry points
  it("does not throw when called multiple times", () => {
    expect(() => {
      initTouchTracking();
      initTouchTracking();
    }).not.toThrow();
  });

  // Detects when user starts using touch — adapts UI to show touch affordances
  it("switches to touch on touch pointerdown", () => {
    initTouchTracking();
    window.dispatchEvent(new PointerEvent("pointerdown", { pointerType: "touch" }));
    expect(getInputMode()).toBe("touch");
  });

  // Hybrid devices (e.g. Surface) can switch between touch and mouse mid-session
  it("switches back to pointer on mouse pointerdown", () => {
    initTouchTracking();
    window.dispatchEvent(new PointerEvent("pointerdown", { pointerType: "touch" }));
    expect(getInputMode()).toBe("touch");

    window.dispatchEvent(new PointerEvent("pointerdown", { pointerType: "mouse" }));
    expect(getInputMode()).toBe("pointer");
  });

  // Pen/stylus input has precise cursor, so it uses pointer mode UI
  it("treats pen input as pointer mode", () => {
    initTouchTracking();
    window.dispatchEvent(new PointerEvent("pointerdown", { pointerType: "pen" }));
    expect(getInputMode()).toBe("pointer");
  });
});

// Safe area insets account for notches and rounded corners on mobile devices
describe("getSafeAreaInsets", () => {
  // Must return all four inset values for proper layout calculations
  it("returns an object with top, right, bottom, left", () => {
    const insets = getSafeAreaInsets();
    expect(insets).toHaveProperty("top");
    expect(insets).toHaveProperty("right");
    expect(insets).toHaveProperty("bottom");
    expect(insets).toHaveProperty("left");
  });

  // Values must be numbers for use in layout math (padding, margins)
  it("returns numeric values", () => {
    const insets = getSafeAreaInsets();
    expect(typeof insets.top).toBe("number");
    expect(typeof insets.right).toBe("number");
    expect(typeof insets.bottom).toBe("number");
    expect(typeof insets.left).toBe("number");
  });

  // jsdom doesn't support CSS env() function, so all insets are 0
  it("returns zeros in jsdom (no env() CSS support)", () => {
    expect(getSafeAreaInsets()).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });
});
