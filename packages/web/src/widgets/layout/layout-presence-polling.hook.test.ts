import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useLayoutPresencePolling } from "./layout-presence-polling.hook";

describe("useLayoutPresencePolling", () => {
  it("does nothing when enabled because Workspace realtime owns presence", () => {
    expect(() => {
      renderHook(() => useLayoutPresencePolling({ enabled: true, pollMs: 90_000 }));
    }).not.toThrow();
  });
});
