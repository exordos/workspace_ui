import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { osIntegration } from "~/shared/lib/os-integration";

vi.mock("~/shared/lib/electron", () => ({
  getElectronAPI: vi.fn(() => null),
}));

vi.mock("~/shared/lib/os-integration", () => ({
  osIntegration: { setBadgeCount: vi.fn() },
}));

vi.mock("~/shared/lib/organization-branding", () => ({
  syncFaviconWithUnreadIndicator: vi.fn(() => () => {}),
}));

import { syncFaviconWithUnreadIndicator } from "~/shared/lib/organization-branding";
import { useLayoutAppIconBadge } from "./layout-app-icon-badge.hook";

describe("useLayoutAppIconBadge", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("syncs OS badge and favicon from total unread across instances", () => {
    const { rerender } = renderHook(
      ({
        unreadCountsByInstance,
        currentInstanceId,
        currentInstanceUnread,
      }: {
        unreadCountsByInstance: Record<string, number>;
        currentInstanceId: string | null;
        currentInstanceUnread: number;
      }) =>
        useLayoutAppIconBadge({
          unreadCountsByInstance,
          currentInstanceId,
          currentInstanceUnread,
        }),
      {
        initialProps: {
          unreadCountsByInstance: { a: 2, b: 3 },
          currentInstanceId: "a",
          currentInstanceUnread: 2,
        },
      },
    );

    expect(osIntegration.setBadgeCount).toHaveBeenCalledWith(5);
    expect(syncFaviconWithUnreadIndicator).toHaveBeenCalledWith({
      hasUnread: true,
      realmIcon: undefined,
      realmBaseUrl: undefined,
    });

    rerender({
      unreadCountsByInstance: {},
      currentInstanceId: "a",
      currentInstanceUnread: 0,
    });
    expect(osIntegration.setBadgeCount).toHaveBeenLastCalledWith(0);
    expect(syncFaviconWithUnreadIndicator).toHaveBeenLastCalledWith({
      hasUnread: false,
      realmIcon: undefined,
      realmBaseUrl: undefined,
    });
  });
});
