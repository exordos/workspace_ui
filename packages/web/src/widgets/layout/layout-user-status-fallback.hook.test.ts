import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLayoutUserStatusFallback } from "./layout-user-status-fallback.hook";

const requestUserStatusMock = vi.hoisted(() => vi.fn());

vi.mock("~/entities/user/api/user.api", () => ({
  requestUserStatus: (...args: unknown[]) => requestUserStatusMock(...args),
}));

describe("useLayoutUserStatusFallback", () => {
  afterEach(() => {
    requestUserStatusMock.mockReset();
  });

  it("requests current user, DM partner, right-panel target, and visible member statuses", () => {
    renderHook(() =>
      useLayoutUserStatusFallback({
        enabled: true,
        currentUserId: 7,
        partnerUserId: 20,
        rightDrawerOpen: true,
        rightDrawerTargetUserId: 30,
        rightPanelMemberStatusIds: [40, 41],
      }),
    );

    expect(requestUserStatusMock).toHaveBeenCalledWith(7, {
      reason: "top_bar",
      priority: "high",
    });
    expect(requestUserStatusMock).toHaveBeenCalledWith(20, {
      reason: "dm_header",
      priority: "high",
    });
    expect(requestUserStatusMock).toHaveBeenCalledWith(30, {
      reason: "right_panel",
      priority: "high",
    });
    expect(requestUserStatusMock).toHaveBeenCalledWith(40, {
      reason: "right_panel",
      priority: "low",
    });
    expect(requestUserStatusMock).toHaveBeenCalledWith(41, {
      reason: "right_panel",
      priority: "low",
    });
  });

  it("does not request statuses when disabled", () => {
    renderHook(() =>
      useLayoutUserStatusFallback({
        enabled: false,
        currentUserId: 7,
        partnerUserId: 20,
        rightDrawerOpen: true,
        rightDrawerTargetUserId: 30,
        rightPanelMemberStatusIds: [40, 41],
      }),
    );

    expect(requestUserStatusMock).not.toHaveBeenCalled();
  });
});
