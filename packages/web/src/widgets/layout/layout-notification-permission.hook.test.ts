import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLayoutNotificationPermission } from "./layout-notification-permission.hook";

const getPermissionMock = vi.hoisted(() => vi.fn(() => "default"));
const isSupportedMock = vi.hoisted(() => vi.fn(() => true));
const requestPermissionMock = vi.hoisted(() => vi.fn(() => Promise.resolve("granted")));
const registerMock = vi.hoisted(() => vi.fn(() => Promise.resolve(true)));

vi.mock("~/shared/lib/notifications", () => ({
  notificationService: {
    getPermission: getPermissionMock,
    isSupported: isSupportedMock,
    requestPermission: requestPermissionMock,
  },
}));

vi.mock("~/shared/lib/push/push.service", () => ({
  pushService: {
    register: registerMock,
  },
}));

describe("useLayoutNotificationPermission", () => {
  afterEach(() => {
    getPermissionMock.mockClear();
    isSupportedMock.mockClear();
    requestPermissionMock.mockClear();
    requestPermissionMock.mockResolvedValue("granted");
    registerMock.mockClear();
  });

  it("does not register legacy push when disabled for granted permission", async () => {
    const { result } = renderHook(() =>
      useLayoutNotificationPermission({
        enabled: true,
        organizationId: "workspace-owner",
        registerPushOnGrant: false,
      }),
    );

    act(() => {
      result.current.enable();
    });

    await waitFor(() => {
      expect(result.current.permission).toBe("granted");
    });
    expect(requestPermissionMock).toHaveBeenCalledTimes(1);
    expect(registerMock).not.toHaveBeenCalled();
  });

  it("keeps legacy push registration enabled by default for granted permission", async () => {
    const { result } = renderHook(() =>
      useLayoutNotificationPermission({
        enabled: true,
        organizationId: "legacy-org",
      }),
    );

    act(() => {
      result.current.enable();
    });

    await waitFor(() => {
      expect(registerMock).toHaveBeenCalledTimes(1);
    });
  });

  it("registers legacy push when explicitly enabled for granted permission", async () => {
    const { result } = renderHook(() =>
      useLayoutNotificationPermission({
        enabled: true,
        organizationId: "legacy-org",
        registerPushOnGrant: true,
      }),
    );

    act(() => {
      result.current.enable();
    });

    await waitFor(() => {
      expect(registerMock).toHaveBeenCalledTimes(1);
    });
  });
});
