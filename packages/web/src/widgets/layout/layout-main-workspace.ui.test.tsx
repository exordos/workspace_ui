import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LayoutMainWorkspace } from "./layout-main-workspace.ui";
import type { LayoutMainWorkspaceProps } from "./layout-main-workspace.types";
import type { ReactNode } from "react";

vi.mock("react-router-dom", () => ({
  Outlet: () => <div data-testid="layout-main-outlet" />,
}));

vi.mock("~/widgets/sidebar/sidebar-shell.ui", () => ({
  SidebarShell: () => <aside data-testid="sidebar-shell" />,
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
    sidebarOpen: true,
    rightDrawerOpen: false,
    rightDrawerMode: "info",
    onCloseRightDrawer: vi.fn(),
    rightPanelTitle: "",
    participantsCount: 0,
    onlineCount: 0,
    rightPanelUser: undefined,
    onSelectCommonGroup: vi.fn(),
    onOpenSettingsDrawer: vi.fn(),
    onOpenAboutDrawer: vi.fn(),
    ...overrides,
  };
}

describe("LayoutMainWorkspace", () => {
  it("limits main width when chat shell and right panel are both visible", () => {
    render(
      <LayoutMainWorkspace
        {...buildProps({
          shouldShowChatShell: true,
          rightDrawerOpen: true,
          rightDrawerMode: "info",
        })}
      />,
    );

    expect(screen.getByRole("main")).toHaveClass("max-w-chat-page");
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
});
