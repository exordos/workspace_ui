import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type { MessengerStream } from "~/entities/messenger/messenger.types";
import { setLocale, useTranslation } from "~/i18n/i18n";
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
  RightDrawer: ({
    children,
    onBack,
    title,
    contentFlush,
  }: {
    children: ReactNode;
    onBack?: () => void;
    title?: string;
    contentFlush?: boolean;
  }) => (
    <aside data-testid="right-drawer" data-content-flush={contentFlush ? "true" : "false"}>
      {onBack != null ? <button onClick={onBack}>Back</button> : null}
      {title ? <h2>{title}</h2> : null}
      {children}
    </aside>
  ),
}));

vi.mock("~/widgets/right-panel/right-panel-shell.ui", () => ({
  RightPanelShell: ({
    onAccountScreenChange,
  }: {
    onAccountScreenChange?: (screen: "settings") => void;
  }) => {
    const { t } = useTranslation();
    return (
      <div data-testid="right-panel-shell">
        <button
          type="button"
          data-testid="open-nested-settings"
          onClick={() => onAccountScreenChange?.("settings")}
        >
          Open nested settings
        </button>
        <span data-testid="nested-settings-body-title">{t("settings.settings")}</span>
      </div>
    );
  },
}));

function buildProps(overrides: Partial<LayoutMainWorkspaceProps> = {}): LayoutMainWorkspaceProps {
  return {
    shouldShowChatShell: true,
    pathname: "/",
    sidebarOpen: true,
    rightDrawerOpen: false,
    rightDrawerMode: "info",
    rightDrawerAccountScreen: null,
    rightDrawerCanGoBack: false,
    onCloseRightDrawer: vi.fn(),
    rightDrawerTitle: "",
    rightPanelTitle: "",
    participantsCount: 0,
    onlineCount: 0,
    workspaceRightPanelInfo: null,
    onOpenSettingsDrawer: vi.fn(),
    onOpenAboutDrawer: vi.fn(),
    onAccountScreenChange: vi.fn(),
    ...overrides,
  };
}

describe("LayoutMainWorkspace", () => {
  beforeEach(() => {
    setLocale("en");
    useMessengerStore.setState({ streamsById: {} });
    window.localStorage.clear();
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 1280,
    });
  });

  it("updates controlled account drawer title and body translations after a locale switch", () => {
    render(
      <LayoutMainWorkspace
        {...buildProps({
          rightDrawerOpen: true,
          rightDrawerMode: "user-menu",
          rightDrawerAccountScreen: "settings",
          rightDrawerCanGoBack: true,
        })}
      />,
    );

    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByTestId("nested-settings-body-title")).toHaveTextContent("Settings");

    act(() => setLocale("ru"));
    expect(screen.getByRole("heading", { name: "Настройки" })).toBeInTheDocument();
    expect(screen.getByTestId("nested-settings-body-title")).toHaveTextContent("Настройки");
  });

  it.each([
    { screen: "root", title: "Account", flush: "true" },
    { screen: "settings", title: "Settings", flush: "true" },
    { screen: "appearance", title: "Appearance", flush: "true" },
    { screen: "about", title: "App version", flush: "false" },
    { screen: "personal-info", title: "Personal info", flush: "false" },
  ] as const)(
    "uses the correct drawer spacing and title for $screen",
    ({ screen: accountScreen, title, flush }) => {
      render(
        <LayoutMainWorkspace
          {...buildProps({
            rightDrawerOpen: true,
            rightDrawerMode: "user-menu",
            rightDrawerAccountScreen: accountScreen,
            rightDrawerTitle: "Account",
          })}
        />,
      );

      expect(screen.getByTestId("right-drawer")).toHaveAttribute("data-content-flush", flush);
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    },
  );

  it("keeps padding and the app-version title for the update indicator About drawer", () => {
    render(
      <LayoutMainWorkspace
        {...buildProps({
          rightDrawerOpen: true,
          rightDrawerMode: "about",
          rightDrawerTitle: "App version",
        })}
      />,
    );

    expect(screen.getByTestId("right-drawer")).toHaveAttribute("data-content-flush", "false");
    expect(screen.getByRole("heading", { name: "App version" })).toBeInTheDocument();
  });

  it("uses flush rows for encrypted chat screens and restores ordinary panel padding", () => {
    const streamUuid = "11111111-1111-4111-8111-111111111111";
    const stream: MessengerStream = {
      uuid: streamUuid,
      projectId: "project",
      ownerUuid: "user",
      userUuid: "user",
      role: "owner",
      notificationMode: "all_messages",
      name: "Protected chat",
      description: "",
      unreadCount: 0,
      sourceName: "native",
      source: { kind: "native" },
      audience: "channel",
      isPrivate: true,
      encryption: true,
      inviteOnly: false,
      announce: false,
      isArchived: false,
      directUserUuid: null,
      lastMessageUuid: null,
      createdAt: "2026-10-05T00:00:00Z",
      updatedAt: "2026-10-05T00:00:00Z",
    };
    useMessengerStore.setState({ streamsById: { [streamUuid]: stream } });
    const props = buildProps({
      rightDrawerOpen: true,
      workspaceRightPanelInfo: {
        kind: "channel",
        streamUuid,
        notificationMode: "all_messages",
        title: stream.name,
        color: null,
        description: null,
        participantsCount: 0,
        onlineCount: 0,
        members: [],
        topics: [],
      },
    });
    const { rerender } = render(<LayoutMainWorkspace {...props} />);
    expect(screen.getByTestId("right-drawer")).toHaveAttribute("data-content-flush", "true");

    rerender(
      <LayoutMainWorkspace
        {...props}
        rightDrawerChatScreen={{
          ownerKey: "owner",
          runtimeGeneration: 1,
          streamUuid,
          screen: "key",
        }}
      />,
    );
    expect(screen.getByTestId("right-drawer")).toHaveAttribute("data-content-flush", "true");

    act(() =>
      useMessengerStore.setState({
        streamsById: { [streamUuid]: { ...stream, encryption: false } },
      }),
    );
    expect(screen.getByTestId("right-drawer")).toHaveAttribute("data-content-flush", "false");

    act(() => useMessengerStore.setState({ streamsById: { [streamUuid]: stream } }));
    rerender(
      <LayoutMainWorkspace
        {...props}
        workspaceRightPanelInfo={{
          kind: "userProfile",
          userUuid: "user",
          title: "Profile",
          avatarUrl: null,
          status: null,
          isOwnProfile: false,
          details: [],
        }}
      />,
    );
    expect(screen.getByTestId("right-drawer")).toHaveAttribute("data-content-flush", "false");
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
