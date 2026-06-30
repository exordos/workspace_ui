import { screen } from "@testing-library/react";
import { Outlet } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceAuthSession } from "~/entities/workspace-auth/workspace-auth.model";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import type * as ShortcutsModule from "~/shared/lib/shortcuts";
import { renderWithProviders } from "~/test/render";
import App from "./app";
import { WebViewShell } from "./webview-shell";

vi.mock("~/pages/inbox/inbox-page.ui", () => ({
  InboxPage: () => <div>inbox-page</div>,
}));

vi.mock("~/pages/licenses/licenses-page.ui", () => ({
  LicensesPage: () => <div>licenses-page</div>,
}));

vi.mock("~/pages/settings/settings-personal-info-page.ui", () => ({
  SettingsPersonalInfoPage: () => <div>settings-personal-info-page</div>,
}));

vi.mock("~/widgets/layout/layout.ui", () => {
  return {
    Layout: () => (
      <div data-testid="layout-shell">
        <Outlet />
      </div>
    ),
  };
});

vi.mock("~/shared/lib/updater", () => ({
  useAppUpdate: () => ({
    status: "checked",
    check: vi.fn(),
  }),
}));

vi.mock("~/shared/lib/analytics/usePageView", () => ({
  usePageView: () => undefined,
}));

vi.mock("~/shared/lib/electron", () => ({
  getElectronAPI: () => null,
}));

vi.mock("~/shared/lib/focus", () => ({
  initFocusManagement: () => undefined,
  focusMainContent: () => undefined,
}));

vi.mock("~/shared/lib/gestures", () => ({
  useSwipe: () => undefined,
}));

vi.mock("~/shared/lib/navigation-history", () => ({
  useNavigationHistory: () => ({ goBack: vi.fn(), goForward: vi.fn() }),
  initMouseNavigation: () => undefined,
}));

vi.mock("~/shared/lib/plugins", () => ({
  setPluginNavigate: () => undefined,
}));

vi.mock("~/shared/lib/shortcuts", async (importOriginal) => {
  const actual = await importOriginal<typeof ShortcutsModule>();
  return {
    ...actual,
    useShortcut: () => undefined,
  };
});

vi.mock("~/shared/lib/webview", () => ({
  isWebView: () => false,
  getNativeBridge: () => ({
    setTitle: vi.fn(),
  }),
  onAuthFromNative: () => vi.fn(),
  onNativeMessage: () => vi.fn(),
}));

describe("App default routing", () => {
  afterEach(() => {
    useWorkspaceAuthStore.setState({ sessions: [], currentAccountId: null, runtimeGeneration: 0 });
  });

  function createSession(): WorkspaceAuthSession {
    return {
      accountId: "zulip.example.com:project-a:user-a",
      instanceId: "inst-1",
      organizationId: "zulip.example.com",
      organizationOrigin: "https://zulip.example.com",
      projectId: "project-a",
      userUuid: "user-a",
      login: "user@example.com",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      runtimeGeneration: 1,
      profile: {
        uuid: "user-a",
        username: "user",
        firstName: "User",
        lastName: null,
        email: "user@example.com",
      },
    };
  }

  function setAuthorizedSession(): void {
    const session = createSession();
    useWorkspaceAuthStore.setState({
      sessions: [session],
      currentAccountId: session.accountId,
      runtimeGeneration: 1,
    });
  }

  it("opens project Inbox when route is not specified", async () => {
    setAuthorizedSession();

    renderWithProviders(<App />, { route: "/" });

    expect(await screen.findByText("inbox-page")).toBeInTheDocument();
  });

  it("renders licenses route outside layout shell", async () => {
    setAuthorizedSession();

    renderWithProviders(<App />, { route: "/licenses" });

    expect(await screen.findByText("licenses-page")).toBeInTheDocument();
    expect(screen.queryByTestId("layout-shell")).not.toBeInTheDocument();
  });

  it("opens personal info settings route instead of redirecting to inbox", async () => {
    setAuthorizedSession();

    renderWithProviders(<App />, {
      route: "/org/zulip.example.com/settings/personal-info",
    });

    expect(await screen.findByText("settings-personal-info-page")).toBeInTheDocument();
    expect(screen.queryByText("inbox-page")).not.toBeInTheDocument();
  });

  it("redirects unknown org routes to project Inbox", async () => {
    setAuthorizedSession();

    renderWithProviders(<App />, {
      route: "/org/zulip.example.com/stream/general",
    });

    expect(await screen.findByText("inbox-page")).toBeInTheDocument();
  });

  it("redirects workspace messenger root to project Inbox", async () => {
    setAuthorizedSession();

    renderWithProviders(<App />, {
      route: "/org/zulip.example.com/project/project-a/messenger",
    });

    expect(await screen.findByText("inbox-page")).toBeInTheDocument();
  });

  it("renders workspace stream routes with WorkspaceMessengerPage", async () => {
    setAuthorizedSession();

    renderWithProviders(<App />, {
      route: "/org/zulip.example.com/project/project-a/stream/stream-uuid",
    });

    expect(await screen.findByTestId("workspace-messenger-page")).toBeInTheDocument();
  });

  it("redirects unknown webview org routes to project Inbox", async () => {
    setAuthorizedSession();

    renderWithProviders(<WebViewShell />, {
      route: "/org/zulip.example.com/message/legacy-message",
    });

    expect(await screen.findByText("inbox-page")).toBeInTheDocument();
  });

  it("renders workspace webview routes with WorkspaceMessengerPage", async () => {
    setAuthorizedSession();

    renderWithProviders(<WebViewShell />, {
      route: "/org/zulip.example.com/project/project-a/message/message-uuid",
    });

    expect(await screen.findByTestId("workspace-messenger-page")).toBeInTheDocument();
  });
});
