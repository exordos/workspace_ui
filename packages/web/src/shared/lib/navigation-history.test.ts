/**
 * Tests for the in-app navigation history module.
 *
 * Verifies back/forward navigation state, mouse button mapping (buttons 3/4
 * for back/forward), and cleanup behavior. This module enables browser-like
 * navigation within the SPA and maps mouse side buttons to history actions
 * — important for desktop users with multi-button mice.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import {
  canGoBack,
  canGoForward,
  getBackPath,
  getForwardPath,
  initMouseNavigation,
} from "./navigation-history";

// Verifies the initial state of navigation history before any navigation occurs
describe("navigation-history (unit, no React)", () => {
  // Fresh app has no history — both directions should be disabled
  it("initially cannot go back or forward", () => {
    expect(canGoBack()).toBe(false);
    expect(canGoForward()).toBe(false);
  });

  // Must return null (not undefined or empty string) to signal "no path available"
  it("getBackPath returns null when no history", () => {
    expect(getBackPath()).toBeNull();
  });

  // Forward is only available after going back
  it("getForwardPath returns null when no forward history", () => {
    expect(getForwardPath()).toBeNull();
  });
});

// Verifies mouse button mapping and lifecycle of the mouse navigation listener
describe("initMouseNavigation", () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
  });

  // Mouse button 3 is the "back" side button on most mice
  it("calls goBack on mouse button 3", () => {
    const goBack = vi.fn();
    const goForward = vi.fn();
    cleanup = initMouseNavigation(goBack, goForward);

    window.dispatchEvent(new MouseEvent("mouseup", { button: 3 }));
    expect(goBack).toHaveBeenCalledTimes(1);
    expect(goForward).not.toHaveBeenCalled();
  });

  // Mouse button 4 is the "forward" side button on most mice
  it("calls goForward on mouse button 4", () => {
    const goBack = vi.fn();
    const goForward = vi.fn();
    cleanup = initMouseNavigation(goBack, goForward);

    window.dispatchEvent(new MouseEvent("mouseup", { button: 4 }));
    expect(goForward).toHaveBeenCalledTimes(1);
    expect(goBack).not.toHaveBeenCalled();
  });

  // Left (0), middle (1), and right (2) clicks should not trigger navigation
  it("ignores standard mouse buttons (0, 1, 2)", () => {
    const goBack = vi.fn();
    const goForward = vi.fn();
    cleanup = initMouseNavigation(goBack, goForward);

    window.dispatchEvent(new MouseEvent("mouseup", { button: 0 }));
    window.dispatchEvent(new MouseEvent("mouseup", { button: 1 }));
    window.dispatchEvent(new MouseEvent("mouseup", { button: 2 }));
    expect(goBack).not.toHaveBeenCalled();
    expect(goForward).not.toHaveBeenCalled();
  });

  // Prevents duplicate listeners if init is called twice (singleton pattern)
  it("returns no-op when already active", () => {
    const goBack = vi.fn();
    cleanup = initMouseNavigation(goBack, vi.fn());

    const secondCleanup = initMouseNavigation(vi.fn(), vi.fn());
    secondCleanup();

    window.dispatchEvent(new MouseEvent("mouseup", { button: 3 }));
    expect(goBack).toHaveBeenCalledTimes(1);
  });

  // After cleanup, new callbacks should replace the old ones entirely
  it("cleanup allows re-initialization with new callbacks", () => {
    const first = vi.fn();
    cleanup = initMouseNavigation(first, vi.fn());
    cleanup();
    cleanup = null;

    const second = vi.fn();
    cleanup = initMouseNavigation(second, vi.fn());

    window.dispatchEvent(new MouseEvent("mouseup", { button: 3 }));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  // Cleanup must fully remove the listener to prevent leaked event handlers
  it("does not fire after cleanup", () => {
    const goBack = vi.fn();
    cleanup = initMouseNavigation(goBack, vi.fn());
    cleanup();
    cleanup = null;

    window.dispatchEvent(new MouseEvent("mouseup", { button: 3 }));
    expect(goBack).not.toHaveBeenCalled();
  });
});
