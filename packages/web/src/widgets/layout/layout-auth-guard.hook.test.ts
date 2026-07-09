import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authIdleTimeoutToMs } from "~/features/settings/auth-idle-timeout.lib";
import { useSettingsStore } from "~/features/settings/settings.model";
import { useLayoutAuthGuard } from "./layout-auth-guard.hook";

const initAuthGuardMock = vi.hoisted(() => vi.fn());

vi.mock("~/shared/lib/auth-guard", () => ({
  initAuthGuard: initAuthGuardMock,
}));

describe("useLayoutAuthGuard", () => {
  afterEach(() => {
    initAuthGuardMock.mockReset();
    useSettingsStore.getState().resetToDefaults();
  });

  it("maps auth idle timeout presets to milliseconds", () => {
    expect(authIdleTimeoutToMs("6h")).toBe(6 * 60 * 60 * 1000);
    expect(authIdleTimeoutToMs("12h")).toBe(12 * 60 * 60 * 1000);
    expect(authIdleTimeoutToMs("24h")).toBe(24 * 60 * 60 * 1000);
    expect(authIdleTimeoutToMs("3d")).toBe(3 * 24 * 60 * 60 * 1000);
    expect(authIdleTimeoutToMs("7d")).toBe(7 * 24 * 60 * 60 * 1000);
    expect(authIdleTimeoutToMs("never")).toBeNull();
  });

  it("passes 3 day timeout to auth guard by default", () => {
    const cleanup = vi.fn();
    initAuthGuardMock.mockReturnValue(cleanup);

    const { unmount } = renderHook(() =>
      useLayoutAuthGuard({
        currentInstanceId: "org-a",
        currentUserStatus: "ready",
        navigate: vi.fn(),
      }),
    );

    expect(initAuthGuardMock).toHaveBeenCalledWith(
      expect.objectContaining({ timeoutMs: 3 * 24 * 60 * 60 * 1000 }),
    );

    unmount();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("keeps 24 hour behavior when selected", () => {
    act(() => {
      useSettingsStore.getState().setAuthIdleTimeout("24h");
    });
    initAuthGuardMock.mockReturnValue(vi.fn());

    const { unmount } = renderHook(() =>
      useLayoutAuthGuard({
        currentInstanceId: "org-a",
        currentUserStatus: "ready",
        navigate: vi.fn(),
      }),
    );

    expect(initAuthGuardMock).toHaveBeenCalledWith(
      expect.objectContaining({ timeoutMs: 24 * 60 * 60 * 1000 }),
    );

    unmount();
  });

  it("does not start auth guard when timeout is disabled", () => {
    act(() => {
      useSettingsStore.getState().setAuthIdleTimeout("never");
    });

    const { unmount } = renderHook(() =>
      useLayoutAuthGuard({
        currentInstanceId: "org-a",
        currentUserStatus: "ready",
        navigate: vi.fn(),
      }),
    );

    expect(initAuthGuardMock).not.toHaveBeenCalled();

    unmount();
  });

  it("cleans up an existing auth guard when timeout is changed to never", () => {
    const cleanup = vi.fn();
    initAuthGuardMock.mockReturnValue(cleanup);

    const { unmount } = renderHook(() =>
      useLayoutAuthGuard({
        currentInstanceId: "org-a",
        currentUserStatus: "ready",
        navigate: vi.fn(),
      }),
    );

    expect(initAuthGuardMock).toHaveBeenCalledTimes(1);

    act(() => {
      useSettingsStore.getState().setAuthIdleTimeout("never");
    });

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(initAuthGuardMock).toHaveBeenCalledTimes(1);

    unmount();
  });
});
