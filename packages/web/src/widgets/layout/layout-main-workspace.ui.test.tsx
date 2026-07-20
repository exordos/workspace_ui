import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LayoutMainWorkspace } from "./layout-main-workspace.ui";
import {
  LAYOUT_SIDEBAR_WIDTH_STORAGE_KEY,
  getLayoutSidebarWidthBounds,
} from "./layout-sidebar-width.lib";
import type { LayoutMainWorkspaceProps } from "./layout-main-workspace.types";
import type { CSSProperties, ReactNode } from "react";

vi.mock("react-router-dom", () => ({
  Outlet: () => <div data-testid="layout-main-outlet" />,
}));

vi.mock("~/widgets/sidebar/sidebar-shell.ui", () => ({
  SidebarShell: ({
    sidebarStyle,
    sidebarResizeControl,
  }: {
    sidebarStyle?: CSSProperties;
    sidebarResizeControl?: ReactNode;
  }) => (
    <div data-testid="sidebar-shell-frame" style={sidebarStyle}>
      <aside data-testid="sidebar-shell" />
      {sidebarResizeControl}
    </div>
  ),
}));

vi.mock("~/widgets/right-panel/right-drawer.ui", () => ({
  RightDrawer: ({ children }: { children: ReactNode }) => (
    <aside data-testid="right-drawer">{children}</aside>
  ),
}));

vi.mock("~/widgets/right-panel/right-panel-shell.ui", () => ({
  RightPanelShell: () => <div data-testid="right-panel-shell" />,
}));

function buildProps(overrides: Partial<LayoutMainWorkspaceProps> = {}): LayoutMainWorkspaceProps {
  return {
    shouldShowChatShell: true,
    pathname: "/",
    sidebarOpen: true,
    rightDrawerOpen: false,
    rightDrawerMode: "info",
    onCloseRightDrawer: vi.fn(),
    rightPanelTitle: "",
    participantsCount: 0,
    onlineCount: 0,
    workspaceRightPanelInfo: null,
    onOpenSettingsDrawer: vi.fn(),
    onOpenAboutDrawer: vi.fn(),
    ...overrides,
  };
}

describe("LayoutMainWorkspace", () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 1280,
    });
  });

  it("does not limit the workspace row width", () => {
    render(<LayoutMainWorkspace {...buildProps()} />);

    expect(screen.getByRole("main").parentElement).not.toHaveClass("max-w-main-workspace");
  });

  it("does not limit main width when chat shell and right panel are both visible", () => {
    render(
      <LayoutMainWorkspace
        {...buildProps({
          shouldShowChatShell: true,
          rightDrawerOpen: true,
          rightDrawerMode: "info",
        })}
      />,
    );

    expect(screen.getByRole("main")).not.toHaveClass("max-w-chat-page");
  });

  it("does not limit main width when right panel is closed", () => {
    render(
      <LayoutMainWorkspace
        {...buildProps({
          shouldShowChatShell: true,
          rightDrawerOpen: false,
          rightDrawerMode: "info",
        })}
      />,
    );

    expect(screen.getByRole("main")).not.toHaveClass("max-w-chat-page");
  });

  it("does not limit main width for non-chat shell drawers", () => {
    render(
      <LayoutMainWorkspace
        {...buildProps({
          shouldShowChatShell: false,
          rightDrawerOpen: true,
          rightDrawerMode: "settings",
        })}
      />,
    );

    expect(screen.getByRole("main")).not.toHaveClass("max-w-chat-page");
  });

  it("restores persisted sidebar width from localStorage", () => {
    window.localStorage.setItem(LAYOUT_SIDEBAR_WIDTH_STORAGE_KEY, "360");

    render(<LayoutMainWorkspace {...buildProps()} />);

    const shellWrapper = screen.getByTestId("sidebar-shell-frame");
    expect(shellWrapper).toHaveStyle({ width: "360px" });
    expect(screen.getByRole("slider", { name: "Resize chat list" })).toHaveAttribute(
      "aria-valuenow",
      "360",
    );
  });

  it("resizes and persists sidebar width with max clamp", () => {
    render(<LayoutMainWorkspace {...buildProps()} />);

    const separator = screen.getByRole("slider", { name: "Resize chat list" });
    fireEvent.pointerDown(separator, { button: 0, clientX: 0 });
    fireEvent.pointerMove(window, { clientX: 1000 });
    fireEvent.pointerUp(window);

    const bounds = getLayoutSidebarWidthBounds();
    expect(separator).toHaveAttribute("aria-valuenow", String(bounds.max));
    expect(window.localStorage.getItem(LAYOUT_SIDEBAR_WIDTH_STORAGE_KEY)).toBe(String(bounds.max));
  });

  it("supports keyboard resizing with min and max bounds", () => {
    render(<LayoutMainWorkspace {...buildProps()} />);

    const separator = screen.getByRole("slider", { name: "Resize chat list" });
    const bounds = getLayoutSidebarWidthBounds();
    fireEvent.keyDown(separator, { key: "End" });
    expect(separator).toHaveAttribute("aria-valuenow", String(bounds.max));

    fireEvent.keyDown(separator, { key: "Home" });
    expect(separator).toHaveAttribute("aria-valuenow", String(bounds.min));
    expect(window.localStorage.getItem(LAYOUT_SIDEBAR_WIDTH_STORAGE_KEY)).toBe(String(bounds.min));
  });

  it("clamps rendered width to viewport ratio without overwriting saved width on resize", () => {
    window.localStorage.setItem(LAYOUT_SIDEBAR_WIDTH_STORAGE_KEY, "500");

    render(<LayoutMainWorkspace {...buildProps()} />);

    const shellWrapper = screen.getByTestId("sidebar-shell-frame");
    expect(shellWrapper).toHaveStyle({ width: "500px" });

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 900,
    });
    fireEvent.resize(window);

    expect(shellWrapper).toHaveStyle({ width: `${getLayoutSidebarWidthBounds().max}px` });
    expect(window.localStorage.getItem(LAYOUT_SIDEBAR_WIDTH_STORAGE_KEY)).toBe("500");
  });
});
