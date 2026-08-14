import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useInstalledAppUpdateToast } from "./app-update-installation.hook";
import { consumeInstalledAppUpdate, rememberPendingAppUpdate } from "./app-update-installation.lib";

const getVersionSpy = vi.hoisted(() => vi.fn());
const successSpy = vi.hoisted(() => vi.fn());

vi.mock("~/shared/lib/electron", () => ({
  getElectronAPI: () => ({ app: { getVersion: getVersionSpy } }),
}));
vi.mock("~/shared/lib/logger", () => ({
  createLogger: () => ({ warn: vi.fn() }),
}));
vi.mock("~/shared/lib/toast/toast", () => ({
  toast: { success: successSpy },
}));

describe("useInstalledAppUpdateToast", () => {
  beforeEach(() => {
    consumeInstalledAppUpdate("");
    getVersionSpy.mockReset();
    successSpy.mockReset();
  });

  it("shows a global success toast after the expected version starts", async () => {
    rememberPendingAppUpdate("0.4.11");
    getVersionSpy.mockResolvedValue("0.4.11");

    renderHook(() => useInstalledAppUpdateToast());

    await waitFor(() => {
      expect(successSpy).toHaveBeenCalledWith("Update 0.4.11 installed successfully");
    });
  });

  it("does not show success when the running version is unchanged", async () => {
    rememberPendingAppUpdate("0.4.11");
    getVersionSpy.mockResolvedValue("0.4.10");

    renderHook(() => useInstalledAppUpdateToast());

    await waitFor(() => {
      expect(getVersionSpy).toHaveBeenCalledTimes(1);
    });
    expect(successSpy).not.toHaveBeenCalled();
  });
});
