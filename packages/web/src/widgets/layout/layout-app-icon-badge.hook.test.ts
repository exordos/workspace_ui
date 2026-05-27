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
        currentInstanceDmUnread: 1,
      }),
    );

    expect(osIntegration.setBadgeCount).toHaveBeenCalledWith(1);
    unmount();
    expect(osIntegration.setBadgeCount).toHaveBeenLastCalledWith(0);
  });

  it("syncs OS badge and favicon from active org personal DM unread only", () => {
    const { rerender } = renderHook(
      ({ currentInstanceDmUnread }: { currentInstanceDmUnread: number }) =>
        useLayoutAppIconBadge({ currentInstanceDmUnread }),
      {
        initialProps: { currentInstanceDmUnread: 2 },
      },
    );

    expect(osIntegration.setBadgeCount).toHaveBeenCalledWith(1);
    expect(syncFaviconWithUnreadIndicator).toHaveBeenCalledWith({ hasUnread: true });

    rerender({ currentInstanceDmUnread: 0 });
    expect(osIntegration.setBadgeCount).toHaveBeenLastCalledWith(0);
    expect(syncFaviconWithUnreadIndicator).toHaveBeenLastCalledWith({ hasUnread: false });
  });

  it("does not show badge when current org has no personal DM unread", () => {
    renderHook(() =>
      useLayoutAppIconBadge({
        currentInstanceDmUnread: 0,
      }),
    );

    expect(osIntegration.setBadgeCount).toHaveBeenCalledWith(0);
    expect(syncFaviconWithUnreadIndicator).toHaveBeenCalledWith({ hasUnread: false });
  });
});
