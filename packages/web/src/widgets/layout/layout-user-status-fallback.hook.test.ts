import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useLayoutUserStatusFallback } from "./layout-user-status-fallback.hook";

describe("useLayoutUserStatusFallback", () => {
  it("ignores legacy status-prefetch inputs when enabled", () => {
    const { result } = renderHook(() =>
      useLayoutUserStatusFallback({
        enabled: true,
        currentUserId: 7,
        partnerUserId: 20,
        rightDrawerOpen: true,
        rightDrawerTargetUserId: 30,
        rightPanelMemberStatusIds: [40, 41],
      }),
    );

    expect(result.current).toBeUndefined();
  });

  it("does not request statuses when disabled", () => {
    const { result } = renderHook(() =>
      useLayoutUserStatusFallback({
        enabled: false,
        currentUserId: 7,
        partnerUserId: 20,
        rightDrawerOpen: true,
        rightDrawerTargetUserId: 30,
        rightPanelMemberStatusIds: [40, 41],
      }),
    );

    expect(result.current).toBeUndefined();
  });
});
