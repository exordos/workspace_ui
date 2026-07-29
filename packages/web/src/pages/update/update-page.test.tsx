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

  it("uses full-width layout container for update content", () => {
    useAppUpdateMock.mockReturnValue({
      status: "idle",
      check: checkSpy,
      install: installSpy,
    });

    const { container } = renderWithProviders(<UpdatePage />);
    const pageRoot = container.querySelector("header")?.parentElement;

    expect(pageRoot).not.toBeNull();
    expect(pageRoot).toHaveClass("w-full");
    expect(pageRoot).toHaveClass("flex-1");
    expect(pageRoot).not.toHaveClass("max-w-narrow-page");
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

  it("does not auto-check in force mode when update is ready", () => {
    useAppUpdateMock.mockReturnValue({
      status: "ready",
      version: "2.1.0",
      check: checkSpy,
      install: installSpy,
    });

    renderWithProviders(<UpdatePage forceMode />);

    expect(checkSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^update$/i })).toBeInTheDocument();
  });

  it("auto-checks in force mode when update is not ready yet", () => {
    useAppUpdateMock.mockReturnValue({
      status: "idle",
      check: checkSpy,
      install: installSpy,
    });

    renderWithProviders(<UpdatePage forceMode />);

    expect(checkSpy).toHaveBeenCalledTimes(1);
  });

  it("auto-checks in force mode when update is available", () => {
    useAppUpdateMock.mockReturnValue({
      status: "available",
      version: "2.1.0",
      check: checkSpy,
      install: installSpy,
    });

    renderWithProviders(<UpdatePage forceMode />);

    expect(checkSpy).toHaveBeenCalledTimes(1);
  });
});
