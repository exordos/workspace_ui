/**
 * Tests for the touch gesture hooks module.
 *
 * Verifies that the gesture hooks (useSwipe, useLongPress, usePinch) are
 * properly exported and that their TypeScript type contracts are correct.
 * These hooks power mobile-like interactions (swipe to navigate, long-press
 * for context menu, pinch to zoom) on both touch and desktop platforms.
 *
 * Note: These are type-contract and export tests, not integration tests —
 * gesture behavior is tested via E2E tests since jsdom lacks real touch events.
 */
import { describe, expect, it } from "vitest";
import {
  useSwipe,
  useLongPress,
  usePinch,
  type SwipeCallbacks,
  type SwipeOptions,
  type LongPressOptions,
  type PinchState,
} from "./gestures";

// Ensures all three gesture hooks are exported and callable
describe("gestures module exports", () => {
  it("useSwipe is a function", () => {
    expect(typeof useSwipe).toBe("function");
  });

  it("useLongPress is a function", () => {
    expect(typeof useLongPress).toBe("function");
  });

  it("usePinch is a function", () => {
    expect(typeof usePinch).toBe("function");
  });
});

// Validates that SwipeOptions type allows flexible configuration
describe("SwipeOptions type contract", () => {
  // Empty options should be valid so defaults can be used
  it("all fields are optional", () => {
    const opts: SwipeOptions = {};
    expect(opts).toBeDefined();
  });

  // Threshold controls minimum swipe distance to trigger a callback
  it("accepts threshold as a number", () => {
    const opts: SwipeOptions = { threshold: 100 };
    expect(opts.threshold).toBe(100);
  });

  // maxDuration distinguishes swipes from slow drags
  it("accepts maxDuration as a number", () => {
    const opts: SwipeOptions = { maxDuration: 300 };
    expect(opts.maxDuration).toBe(300);
  });

  // Edge swipes (from screen edge) are used for sidebar navigation
  it("accepts edgeOnly and edgeWidth together", () => {
    const opts: SwipeOptions = { edgeOnly: true, edgeWidth: 40 };
    expect(opts.edgeOnly).toBe(true);
    expect(opts.edgeWidth).toBe(40);
  });

  // All options should compose together without conflicts
  it("accepts all fields simultaneously", () => {
    const opts: SwipeOptions = {
      threshold: 50,
      maxDuration: 500,
      edgeOnly: false,
      edgeWidth: 30,
    };
    expect(Object.keys(opts)).toHaveLength(4);
  });
});

// Validates that SwipeCallbacks type supports all directional handlers
describe("SwipeCallbacks type contract", () => {
  // Empty callbacks should be valid — not all directions need handlers
  it("allows empty callbacks object", () => {
    const cbs: SwipeCallbacks = {};
    expect(cbs).toBeDefined();
  });

  // All four swipe directions should be independently subscribable
  it("accepts all directional callbacks", () => {
    const cbs: SwipeCallbacks = {
      onSwipeLeft: () => {},
      onSwipeRight: () => {},
      onSwipeUp: () => {},
      onSwipeDown: () => {},
    };
    expect(typeof cbs.onSwipeLeft).toBe("function");
    expect(typeof cbs.onSwipeRight).toBe("function");
    expect(typeof cbs.onSwipeUp).toBe("function");
    expect(typeof cbs.onSwipeDown).toBe("function");
  });

  // onSwiping provides real-time drag offset for animated transitions
  it("accepts onSwiping with dx/dy parameters", () => {
    let capturedDx = 0;
    let capturedDy = 0;
    const cbs: SwipeCallbacks = {
      onSwiping: (dx, dy) => {
        capturedDx = dx;
        capturedDy = dy;
      },
    };
    cbs.onSwiping!(10, -5);
    expect(capturedDx).toBe(10);
    expect(capturedDy).toBe(-5);
  });

  // onSwipeEnd fires when the finger lifts, used to finalize animations
  it("accepts onSwipeEnd callback", () => {
    const cbs: SwipeCallbacks = { onSwipeEnd: () => {} };
    expect(typeof cbs.onSwipeEnd).toBe("function");
  });
});

// Validates LongPressOptions type for context menu triggers
describe("LongPressOptions type contract", () => {
  // Delay controls how long the user must hold before the long-press fires
  it("accepts delay as a number", () => {
    const opts: LongPressOptions = { delay: 700 };
    expect(opts.delay).toBe(700);
  });

  // moveTolerance prevents false triggers when the finger drifts slightly
  it("accepts moveTolerance as a number", () => {
    const opts: LongPressOptions = { moveTolerance: 15 };
    expect(opts.moveTolerance).toBe(15);
  });

  // Both options should compose together
  it("accepts both fields together", () => {
    const opts: LongPressOptions = { delay: 500, moveTolerance: 10 };
    expect(opts.delay).toBe(500);
    expect(opts.moveTolerance).toBe(10);
  });
});

// Validates PinchState type used for pinch-to-zoom in image viewer
describe("PinchState type contract", () => {
  // Pinch state must include zoom level and the center point between fingers
  it("requires scale, centerX, and centerY", () => {
    const state: PinchState = { scale: 1.5, centerX: 100, centerY: 200 };
    expect(state.scale).toBe(1.5);
    expect(state.centerX).toBe(100);
    expect(state.centerY).toBe(200);
  });

  // 1.0 is the identity zoom — no transformation applied
  it("scale of 1.0 represents no zoom", () => {
    const state: PinchState = { scale: 1.0, centerX: 0, centerY: 0 };
    expect(state.scale).toBe(1.0);
  });
});
