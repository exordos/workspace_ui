import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLayoutNotificationPermission } from "./layout-notification-permission.hook";

const getPermissionMock = vi.hoisted(() => vi.fn(() => "default"));
const isSupportedMock = vi.hoisted(() => vi.fn(() => true));
const requestPermissionMock = vi.hoisted(() => vi.fn(() => Promise.resolve("granted")));

vi.mock("~/shared/lib/notifications", () => ({
  notificationService: {
    getPermission: getPermissionMock,
    isSupported: isSupportedMock,
    requestPermission: requestPermissionMock,
  },
}));

describe("useLayoutNotificationPermission", () => {
  afterEach(() => {
    getPermissionMock.mockClear();
    isSupportedMock.mockClear();
    requestPermissionMock.mockClear();
    requestPermissionMock.mockResolvedValue("granted");
  });

  it("requests notification permission and stores the granted state", async () => {
    const { result } = renderHook(() =>
      useLayoutNotificationPermission({
        enabled: true,
        organizationId: "workspace-owner",
      }),
    );

    act(() => {
      result.current.enable();
    });

    await waitFor(() => {
      expect(result.current.permission).toBe("granted");
    });
    expect(requestPermissionMock).toHaveBeenCalledTimes(1);
  });
});
