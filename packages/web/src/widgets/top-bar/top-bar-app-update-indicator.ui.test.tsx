import { fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UpdateState } from "~/shared/lib/updater";
import { renderWithProviders } from "~/test/render";
import { useRightDrawerStore } from "~/widgets/right-panel/right-drawer.model";
import { TopBarAppUpdateIndicator } from "./top-bar-app-update-indicator.ui";

const useAppUpdateMock = vi.hoisted(() => vi.fn<() => UpdateState>());
const getElectronAPIMock = vi.hoisted(() =>
  vi.fn<() => { updater: object } | null>(() => ({ updater: {} })),
);

vi.mock("~/shared/lib/updater", () => ({
  useAppUpdate: useAppUpdateMock,
}));

vi.mock("~/shared/lib/electron", () => ({
  getElectronAPI: getElectronAPIMock,
}));

function createUpdateState(overrides: Partial<UpdateState> = {}): UpdateState {
  return {
    status: "idle",
    check: vi.fn(),
    install: vi.fn(),
    ...overrides,
  };
}

describe("TopBarAppUpdateIndicator", () => {
  afterEach(() => {
    useAppUpdateMock.mockReset();
    getElectronAPIMock.mockReset();
    getElectronAPIMock.mockReturnValue({ updater: {} });
    useRightDrawerStore.getState().close();
  });

  it.each(["idle", "checking", "up-to-date", "error"] as const)(
    "stays hidden for %s status",
    (status) => {
      useAppUpdateMock.mockReturnValue(createUpdateState({ status }));

      renderWithProviders(<TopBarAppUpdateIndicator />);

      expect(screen.queryByTestId("topbar-app-update-indicator")).not.toBeInTheDocument();
    },
  );

  it("shows the available version and opens the About panel", () => {
    useAppUpdateMock.mockReturnValue(createUpdateState({ status: "available", version: "0.4.12" }));

    renderWithProviders(<TopBarAppUpdateIndicator />);
    fireEvent.click(screen.getByRole("button", { name: "Version 0.4.12 available" }));

    expect(useRightDrawerStore.getState()).toMatchObject({ open: true, mode: "about" });
  });

  it("shows download progress with a subtle animation", () => {
    useAppUpdateMock.mockReturnValue(createUpdateState({ status: "downloading", percent: 42.4 }));

    renderWithProviders(<TopBarAppUpdateIndicator />);

    expect(screen.getByRole("button", { name: "Downloading update… 42%" })).toHaveClass(
      "animate-pulse",
    );
  });

  it("stays visible without animation when the update is ready", () => {
    useAppUpdateMock.mockReturnValue(createUpdateState({ status: "ready", version: "0.4.12" }));

    renderWithProviders(<TopBarAppUpdateIndicator />);

    const indicator = screen.getByRole("button", { name: "Update ready to install" });
    expect(indicator).not.toHaveClass("animate-pulse", "bg-indicator-orange");
    expect(indicator).toHaveClass("rounded-lg", "bg-accent-soft", "text-accent");
  });

  it("does not render outside Electron", () => {
    getElectronAPIMock.mockReturnValue(null);
    useAppUpdateMock.mockReturnValue(createUpdateState({ status: "ready", version: "0.4.12" }));

    renderWithProviders(<TopBarAppUpdateIndicator />);

    expect(screen.queryByTestId("topbar-app-update-indicator")).not.toBeInTheDocument();
  });
});
