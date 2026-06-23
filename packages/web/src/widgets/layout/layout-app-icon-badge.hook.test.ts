import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { syncFaviconWithUnreadIndicator } from "~/shared/lib/organization-branding";
import { osIntegration } from "~/shared/lib/os-integration";
import { useLayoutAppIconBadge } from "./layout-app-icon-badge.hook";

vi.mock("~/shared/lib/electron", () => ({
  getElectronAPI: vi.fn(() => null),
}));

vi.mock("~/shared/lib/os-integration", () => ({
  osIntegration: { setBadgeCount: vi.fn() },
}));

vi.mock("~/shared/lib/organization-branding", () => ({
  syncFaviconWithUnreadIndicator: vi.fn(() => () => {}),
}));

describe("useLayoutAppIconBadge", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("clears OS badge on unmount", () => {
    const { unmount } = renderHook(() =>
      useLayoutAppIconBadge({
        personalUnreadCount: 1,
      }),
    );

    expect(osIntegration.setBadgeCount).toHaveBeenCalledWith(1);
    unmount();
    expect(osIntegration.setBadgeCount).toHaveBeenLastCalledWith(0);
  });

  it("syncs OS badge from server personal unread count", () => {
    const { rerender } = renderHook(
      ({ personalUnreadCount }: { personalUnreadCount: number }) =>
        useLayoutAppIconBadge({ personalUnreadCount }),
      {
        initialProps: { personalUnreadCount: 2 },
      },
    );

    expect(osIntegration.setBadgeCount).toHaveBeenCalledWith(1);
    expect(syncFaviconWithUnreadIndicator).toHaveBeenCalledWith({ hasUnread: true });

    rerender({ personalUnreadCount: 0 });
    expect(osIntegration.setBadgeCount).toHaveBeenLastCalledWith(0);
    expect(syncFaviconWithUnreadIndicator).toHaveBeenLastCalledWith({ hasUnread: false });

    rerender({ personalUnreadCount: 3 });
    expect(osIntegration.setBadgeCount).toHaveBeenLastCalledWith(1);
    expect(syncFaviconWithUnreadIndicator).toHaveBeenLastCalledWith({ hasUnread: true });
  });

  it("does not show badge when no personal DM or mentions unread", () => {
    renderHook(() =>
      useLayoutAppIconBadge({
        personalUnreadCount: 0,
      }),
    );

    expect(osIntegration.setBadgeCount).toHaveBeenCalledWith(0);
    expect(syncFaviconWithUnreadIndicator).toHaveBeenCalledWith({ hasUnread: false });
  });
});
