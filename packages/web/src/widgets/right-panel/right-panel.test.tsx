import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUsersStore } from "~/entities/user/user.model";
import {
  useWorkspaceAuthStore,
  type WorkspaceAuthSession,
} from "~/entities/workspace-auth/workspace-auth.model";
import { useSettingsStore } from "~/features/settings/settings.model";
import { setLocale, t } from "~/i18n/i18n";
import { renderWithProviders } from "~/test/render";
import { RightPanelShell } from "./right-panel-shell.ui";

const updateWorkspaceOwnStatusMock = vi.hoisted(() => vi.fn());

vi.mock("./right-panel-external-account.integration", () => ({
  RightPanelConnectExternalAccountDialog: ({ open }: { open: boolean }) =>
    open ? <div role="dialog">Connect external account</div> : null,
  RightPanelExternalAccountsList: () => (
    <div data-testid="connected-external-accounts-list">Zulip · https://zulip.example.com</div>
  ),
}));

vi.mock("~/entities/user/user-workspace-status-actions.lib", () => ({
  updateWorkspaceOwnStatus: (...args: unknown[]) => updateWorkspaceOwnStatusMock(...args),
}));

function LocationProbe() {
  return <span data-testid="location-path">{useLocation().pathname}</span>;
}

describe("RightPanelShell", () => {
  const workspaceUserUuid = "a225223c-637c-4afa-918f-5f2798b9305f";

  function createWorkspaceUserMenuSession(
    overrides: Partial<WorkspaceAuthSession> = {},
  ): WorkspaceAuthSession {
    const userUuid = overrides.userUuid ?? workspaceUserUuid;
    return {
      accountId: "account-a",
      instanceId: "instance-a",
      organizationId: "workspace.example.com",
      organizationOrigin: "https://workspace.example.com",
      projectId: "project-a",
      userUuid,
      login: "alice@example.com",
      accessToken: "access-token",
      runtimeGeneration: 1,
      profile: {
        uuid: userUuid,
        username: "alice",
        firstName: "Alice",
        lastName: "Workspace",
        email: "alice@example.com",
        status: "active",
      },
      ...overrides,
    };
  }

  function setWorkspaceUserMenuSession() {
    const session = createWorkspaceUserMenuSession();
    useWorkspaceAuthStore.setState({
      currentAccountId: session.accountId,
      runtimeGeneration: 1,
      sessions: [session],
    });
    useUsersStore.getState().upsertUser({
      uuid: workspaceUserUuid,
      username: "alice",
      firstName: "Alice",
      lastName: "Workspace",
      displayName: "Alice Workspace",
      email: "alice@example.com",
      avatarUrl: null,
      status: "active",
      statusEmoji: null,
      statusText: null,
      lastPingAt: "2026-07-01T10:00:00Z",
      createdAt: "2026-07-01T10:00:00Z",
      updatedAt: "2026-07-01T10:00:00Z",
    });
  }

  beforeEach(() => {
    updateWorkspaceOwnStatusMock.mockReset();
    updateWorkspaceOwnStatusMock.mockResolvedValue({ ok: true, user: null });
  });

  afterEach(() => {
    useWorkspaceAuthStore.setState({
      sessions: [],
      currentAccountId: null,
      runtimeGeneration: 0,
    });
    useUsersStore.getState().clear();
    useSettingsStore.getState().resetToDefaults();
    act(() => {
      setLocale("en");
    });
    vi.restoreAllMocks();
  });

  it("renders explicit unsupported info state without Workspace info", () => {
    renderWithProviders(<RightPanelShell title="Legacy channel" />);

    expect(screen.getByText(t("workspaceMessenger.rightPanelUnsupported"))).toBeInTheDocument();
    expect(screen.queryByText("Legacy channel")).not.toBeInTheDocument();
  });

  it("renders settings mode without legacy chat info fallback", () => {
    renderWithProviders(<RightPanelShell mode="settings" title="Settings" />);

    expect(screen.getByRole("heading", { name: /^settings$/i })).toBeInTheDocument();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /notification sound/i }));
    });
    expect(screen.getByRole("button", { name: /^digital$/i })).toBeInTheDocument();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /^digital$/i }));
    });

    expect(useSettingsStore.getState().notificationSound).toBe("digital");
  });

  it("renders current Workspace session in user menu", () => {
    setWorkspaceUserMenuSession();

    renderWithProviders(<RightPanelShell mode="user-menu" title="Profile" />);

    const currentServerItem = screen.getByTestId("user-menu-current-server-item");
    expect(within(currentServerItem).getByText(/workspace.example.com/i)).toBeInTheDocument();
    expect(within(currentServerItem).getByText("alice@example.com")).toBeInTheDocument();
  });

  it("opens the external-account feature from the profile and renders its compact list", () => {
    setWorkspaceUserMenuSession();

    renderWithProviders(<RightPanelShell mode="user-menu" title="Profile" />);

    expect(screen.queryByTestId("connected-external-accounts-list")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /connected external accounts/i }));
    expect(screen.getByTestId("connected-external-accounts-list")).toHaveTextContent(
      "Zulip · https://zulip.example.com",
    );
    fireEvent.click(screen.getByTestId("connect-external-account-trigger"));
    expect(screen.getByRole("dialog", { name: "" })).toHaveTextContent("Connect external account");
  });

  it("navigates to the next Workspace inbox after user-menu logout from current account", async () => {
    const firstSession = createWorkspaceUserMenuSession();
    const secondSession = createWorkspaceUserMenuSession({
      accountId: "account-b",
      instanceId: "instance-b",
      organizationId: "next.example.com",
      organizationOrigin: "https://next.example.com",
      projectId: "project-b",
      userUuid: "b225223c-637c-4afa-918f-5f2798b9305f",
      login: "bob@example.com",
      runtimeGeneration: 1,
      profile: {
        uuid: "b225223c-637c-4afa-918f-5f2798b9305f",
        username: "bob",
        firstName: "Bob",
        lastName: "Workspace",
        email: "bob@example.com",
        status: "active",
      },
    });
    useWorkspaceAuthStore.setState({
      currentAccountId: firstSession.accountId,
      runtimeGeneration: 1,
      sessions: [firstSession, secondSession],
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderWithProviders(
      <>
        <LocationProbe />
        <RightPanelShell mode="user-menu" title="Profile" />
      </>,
      { route: "/org/workspace.example.com/project/project-a/message/old-message" },
    );

    fireEvent.click(screen.getByRole("button", { name: t("auth.logoutFromOrg") }));

    await waitFor(() => {
      expect(screen.getByTestId("location-path")).toHaveTextContent(
        "/org/next.example.com/project/project-b/inbox",
      );
    });
    expect(useWorkspaceAuthStore.getState().currentAccountId).toBe(secondSession.accountId);
  });

  it("saves Workspace status from the user menu", async () => {
    setWorkspaceUserMenuSession();
    renderWithProviders(<RightPanelShell mode="user-menu" title="Profile" />);

    fireEvent.click(screen.getByRole("button", { name: /^status/i }));
    const statusDialog = screen.getByRole("dialog", { name: /^status$/i });
    fireEvent.change(within(statusDialog).getByRole("textbox", { name: /^status$/i }), {
      target: { value: "Booting" },
    });
    fireEvent.click(within(statusDialog).getByRole("checkbox", { name: /away/i }));
    fireEvent.click(within(statusDialog).getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(updateWorkspaceOwnStatusMock).toHaveBeenCalledWith(
        expect.objectContaining({
          statusText: "Booting",
          away: true,
        }),
      );
    });
    expect(screen.queryByRole("dialog", { name: /^status$/i })).not.toBeInTheDocument();
  });
});
