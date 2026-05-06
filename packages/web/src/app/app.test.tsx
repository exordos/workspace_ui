import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { renderWithProviders } from "~/test/render";
import App from "./app";

vi.mock("~/pages/inbox/inbox-page.ui", () => ({
  InboxPage: () => <div>inbox-page</div>,
}));

vi.mock("~/pages/chat/chat-page.ui", () => ({
  ChatPage: () => <div>chat-page</div>,
}));

vi.mock("~/pages/licenses/licenses-page.ui", () => ({
  LicensesPage: () => <div>licenses-page</div>,
}));

vi.mock("~/pages/settings/settings-personal-info-page.ui", () => ({
  SettingsPersonalInfoPage: () => <div>settings-personal-info-page</div>,
}));

vi.mock("~/widgets/layout/layout.ui", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    Layout: () => (
      <div data-testid="layout-shell">
        <actual.Outlet />
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
  const actual = await importOriginal<typeof import("~/shared/lib/shortcuts")>();
  return {
    ...actual,
    useShortcut: () => undefined,
  };
});

vi.mock("~/shared/lib/webview", () => ({
  isWebView: () => false,
}));

describe("App default routing", () => {
  afterEach(() => {
    useInstancesStore.setState({
      instances: [],
      currentInstanceId: null,
      unreadCountsByInstance: {},
    });
  });

  it("opens inbox when route is not specified", async () => {
    useInstancesStore.setState({
      instances: [
        {
          id: "inst-1",
          realm: "https://zulip.example.com",
          email: "user@example.com",
          apiKey: "api-key",
        },
      ],
      currentInstanceId: "inst-1",
      unreadCountsByInstance: {},
    });

    renderWithProviders(<App />, { route: "/" });

    expect(await screen.findByText("inbox-page")).toBeInTheDocument();
    expect(screen.queryByText("chat-page")).not.toBeInTheDocument();
  });

  it("renders licenses route outside layout shell", async () => {
    useInstancesStore.setState({
      instances: [
        {
          id: "inst-1",
          realm: "https://zulip.example.com",
          email: "user@example.com",
          apiKey: "api-key",
        },
      ],
      currentInstanceId: "inst-1",
      unreadCountsByInstance: {},
    });

    renderWithProviders(<App />, { route: "/licenses" });

    expect(await screen.findByText("licenses-page")).toBeInTheDocument();
    expect(screen.queryByTestId("layout-shell")).not.toBeInTheDocument();
  });

  it("opens personal info settings route instead of redirecting to inbox", async () => {
    useInstancesStore.setState({
      instances: [
        {
          id: "inst-1",
          realm: "https://zulip.example.com",
          email: "user@example.com",
          apiKey: "api-key",
        },
      ],
      currentInstanceId: "inst-1",
      unreadCountsByInstance: {},
    });

    renderWithProviders(<App />, {
      route: "/org/zulip.example.com/settings/personal-info",
    });

    expect(await screen.findByText("settings-personal-info-page")).toBeInTheDocument();
    expect(screen.queryByText("inbox-page")).not.toBeInTheDocument();
  });
});
