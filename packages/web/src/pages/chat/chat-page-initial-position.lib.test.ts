import { describe, expect, it } from "vitest";
import { resolveInitialPositionReady } from "./chat-page-initial-position.lib";

const BASE = {
  hasRuntimeContext: true,
  hasConversationWindow: true,
  hasFocusTarget: false,
  realtimeReady: true,
  viewedBefore: false,
};

describe("resolveInitialPositionReady", () => {
  it("waits while there is nothing to position", () => {
    expect(resolveInitialPositionReady({ ...BASE, hasConversationWindow: false })).toBe(false);
    expect(resolveInitialPositionReady({ ...BASE, hasRuntimeContext: false })).toBe(false);
  });

  it("waits for the runtime on a first visit", () => {
    expect(resolveInitialPositionReady({ ...BASE, realtimeReady: false })).toBe(false);
  });

  // The revisit case: everything needed is already on hand, and waiting for the
  // runtime to report ready again is exactly what the user sees as a blink.
  it("does not wait for the runtime for a conversation seen before", () => {
    expect(resolveInitialPositionReady({ ...BASE, realtimeReady: false, viewedBefore: true })).toBe(
      true,
    );
  });

  it("does not wait when the navigation carries its own anchor", () => {
    expect(
      resolveInitialPositionReady({ ...BASE, realtimeReady: false, hasFocusTarget: true }),
    ).toBe(true);
  });

  // Being seen before cannot conjure a window that is not loaded yet.
  it("still waits for the window even for a conversation seen before", () => {
    expect(
      resolveInitialPositionReady({ ...BASE, hasConversationWindow: false, viewedBefore: true }),
    ).toBe(false);
  });
});
