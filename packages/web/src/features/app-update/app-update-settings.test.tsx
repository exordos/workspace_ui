import { fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "~/test/render";
import { consumeInstalledAppUpdate } from "./app-update-installation.lib";
import { shouldShowAppUpdateSettings } from "./app-update-settings.lib";
import { AppUpdateSettings } from "./app-update-settings.ui";

const checkSpy = vi.hoisted(() => vi.fn());
const installSpy = vi.hoisted(() => vi.fn());
const useAppUpdateMock = vi.hoisted(() => vi.fn());

vi.mock("~/shared/lib/updater", () => ({
  useAppUpdate: useAppUpdateMock,
}));

describe("AppUpdateSettings", () => {
  afterEach(() => {
    checkSpy.mockReset();
    installSpy.mockReset();
    useAppUpdateMock.mockReset();
    consumeInstalledAppUpdate("");
  });

  it.each([
    { isProduction: false, isElectronRuntime: false, expected: true },
    { isProduction: true, isElectronRuntime: true, expected: true },
    { isProduction: true, isElectronRuntime: false, expected: false },
  ])(
    "resolves visibility for production=$isProduction and electron=$isElectronRuntime",
    ({ isProduction, isElectronRuntime, expected }) => {
      expect(shouldShowAppUpdateSettings(isProduction, isElectronRuntime)).toBe(expected);
    },
  );

  it("checks for updates from application version settings", () => {
    useAppUpdateMock.mockReturnValue({
      status: "up-to-date",
      check: checkSpy,
      install: installSpy,
    });

    renderWithProviders(<AppUpdateSettings />);

    expect(screen.getByRole("region", { name: "Application update" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));

    expect(checkSpy).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Install and restart" })).not.toBeInTheDocument();
  });

  it("shows a neutral status before the first update check", () => {
    useAppUpdateMock.mockReturnValue({
      status: "idle",
      check: checkSpy,
      install: installSpy,
    });

    renderWithProviders(<AppUpdateSettings />);

    expect(screen.getByText("Check whether a new version is available")).toBeInTheDocument();
  });

  it("installs a downloaded update", () => {
    useAppUpdateMock.mockReturnValue({
      status: "ready",
      version: "0.4.10",
      check: checkSpy,
      install: installSpy,
    });

    renderWithProviders(<AppUpdateSettings />);
    expect(
      screen.getByText(
        "Installation may take up to a minute. The application will restart automatically.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Install and restart" }));

    expect(installSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Update ready to install")).toBeInTheDocument();
    expect(consumeInstalledAppUpdate("0.4.10")).toBe("0.4.10");
  });

  it("disables repeated checks while an update is downloading", () => {
    useAppUpdateMock.mockReturnValue({
      status: "downloading",
      percent: 42,
      check: checkSpy,
      install: installSpy,
    });

    renderWithProviders(<AppUpdateSettings />);

    expect(screen.getByRole("button", { name: "Check for updates" })).toBeDisabled();
    expect(screen.getByText("Downloading update… 42%")).toBeInTheDocument();
  });
});
