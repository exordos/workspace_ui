import { fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "~/test/render";
import { UpdatePage } from "./update-page.ui";

const checkSpy = vi.hoisted(() => vi.fn());
const installSpy = vi.hoisted(() => vi.fn());
const useAppUpdateMock = vi.hoisted(() => vi.fn());

vi.mock("~/shared/lib/updater", () => ({
  useAppUpdate: useAppUpdateMock,
}));

describe("UpdatePage", () => {
  afterEach(() => {
    checkSpy.mockReset();
    installSpy.mockReset();
    useAppUpdateMock.mockReset();
  });

  it("checks updates on mount", () => {
    useAppUpdateMock.mockReturnValue({
      status: "idle",
      check: checkSpy,
      install: installSpy,
    });

    renderWithProviders(<UpdatePage />);

    expect(checkSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/current version/i)).toBeInTheDocument();
  });

  it("does not re-check on rerender when updater object identity changes", () => {
    useAppUpdateMock.mockImplementation(() => ({
      status: "idle",
      check: checkSpy,
      install: installSpy,
    }));

    const view = renderWithProviders(<UpdatePage />);
    view.rerender(<UpdatePage />);

    expect(checkSpy).toHaveBeenCalledTimes(1);
  });

  it("shows install action when update is ready", () => {
    useAppUpdateMock.mockReturnValue({
      status: "ready",
      version: "2.1.0",
      check: checkSpy,
      install: installSpy,
    });

    renderWithProviders(<UpdatePage />);
    fireEvent.click(screen.getByRole("button", { name: /^update$/i }));

    expect(installSpy).toHaveBeenCalledTimes(1);
  });

  it("renders force-update copy in force mode", () => {
    useAppUpdateMock.mockReturnValue({
      status: "ready",
      version: "2.1.0",
      check: checkSpy,
      install: installSpy,
    });

    renderWithProviders(<UpdatePage forceMode />);

    expect(screen.getByText("Update required")).toBeInTheDocument();
    expect(
      screen.getByText("Install the required update to continue using Workspace."),
    ).toBeInTheDocument();
  });
});
