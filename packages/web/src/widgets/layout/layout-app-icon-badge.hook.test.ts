import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { osIntegration } from "~/shared/lib/os-integration";
import { createInstance } from "~/test/factories";

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

interface HookTestProps {
  dmUnreadCountsByInstance: Record<string, number>;
  currentInstanceId: string | null;
  currentInstanceDmUnread: number;
}

describe("useLayoutAppIconBadge", () => {
  afterEach(() => {
    vi.clearAllMocks();
    useInstancesStore.setState({
      instances: [],
      currentInstanceId: null,
      dmUnreadCountsByInstance: {},
    });
  });

  it("clears OS badge on unmount", () => {
    const { unmount } = renderHook(() =>
      useLayoutAppIconBadge({
        dmUnreadCountsByInstance: { a: 1 },
        currentInstanceId: "a",
        currentInstanceDmUnread: 1,
      }),
    );

    expect(osIntegration.setBadgeCount).toHaveBeenCalledWith(1);
    unmount();
    expect(osIntegration.setBadgeCount).toHaveBeenLastCalledWith(0);
  });

  it("syncs OS badge and favicon from total DM unread across instances", () => {
    useInstancesStore.setState({
      instances: [createInstance({ id: "a" }), createInstance({ id: "b" })],
      currentInstanceId: "a",
    });

    const initialProps: HookTestProps = {
      dmUnreadCountsByInstance: { a: 2, b: 3 },
      currentInstanceId: "a",
      currentInstanceDmUnread: 2,
    };

    const { rerender } = renderHook(
      ({ dmUnreadCountsByInstance, currentInstanceId, currentInstanceDmUnread }: HookTestProps) =>
        useLayoutAppIconBadge({
          dmUnreadCountsByInstance,
          currentInstanceId,
          currentInstanceDmUnread,
        }),
      {
        initialProps,
      },
    );

    expect(osIntegration.setBadgeCount).toHaveBeenCalledWith(1);
    expect(syncFaviconWithUnreadIndicator).toHaveBeenCalledWith({ hasUnread: true });

    rerender({
      dmUnreadCountsByInstance: {},
      currentInstanceId: "a",
      currentInstanceDmUnread: 0,
    });
    expect(osIntegration.setBadgeCount).toHaveBeenLastCalledWith(0);
    expect(syncFaviconWithUnreadIndicator).toHaveBeenLastCalledWith({ hasUnread: false });
  });

  it("does not show badge when only channel unread exists for current instance", () => {
    useInstancesStore.setState({
      instances: [createInstance({ id: "a" })],
      currentInstanceId: "a",
    });

    renderHook(
      ({ dmUnreadCountsByInstance, currentInstanceId, currentInstanceDmUnread }: HookTestProps) =>
        useLayoutAppIconBadge({
          dmUnreadCountsByInstance,
          currentInstanceId,
          currentInstanceDmUnread,
        }),
      {
        initialProps: {
          dmUnreadCountsByInstance: { a: 10 },
          currentInstanceId: "a",
          currentInstanceDmUnread: 0,
        },
      },
    );

    expect(osIntegration.setBadgeCount).toHaveBeenCalledWith(0);
    expect(syncFaviconWithUnreadIndicator).toHaveBeenCalledWith({ hasUnread: false });
  });
});
