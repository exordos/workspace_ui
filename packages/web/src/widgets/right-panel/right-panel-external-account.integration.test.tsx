import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useExternalAccountStore } from "~/entities/external-account/external-account.model";
import type { ExternalAccount } from "~/entities/external-account/external-account.types";
import { useExternalChatsStore } from "~/entities/external-chat/external-chat.model";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { renderWithProviders } from "~/test/render";
import {
  RightPanelConnectExternalAccountDialog,
  RightPanelExternalAccountsList,
} from "./right-panel-external-account.integration";

vi.mock("~/entities/external-account/external-account-sync.lib", () => ({
  refreshExternalAccounts: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("~/features/connect-external-account/connect-external-account-dialog.ui", () => ({
  ConnectExternalAccountDialog: ({
    open,
    runtimeContext,
    editAccount,
  }: {
    open: boolean;
    runtimeContext: { accountId: string } | null;
    editAccount?: ExternalAccount | null;
  }) =>
    open ? (
      <div role="dialog" data-testid="external-account-runtime">
        {runtimeContext?.accountId ?? "none"}
        {editAccount != null ? <span data-testid="editing-account">{editAccount.uuid}</span> : null}
      </div>
    ) : null,
}));

const runtimeContext: WorkspaceRuntimeContext = {
  accountId: "account-a",
  instanceId: "instance-a",
  organizationId: "organization-a",
  organizationOrigin: "https://organization-a.example.com",
  projectId: "project-a",
  userUuid: "user-a",
  accessToken: "access-token-a",
  runtimeGeneration: 1,
};

const account: ExternalAccount = {
  uuid: "external-account-1",
  provider: "zulip",
  settings: {
    kind: "zulip",
    serverUrl: "https://zulip.example.com",
    email: "user@example.com",
    selectionMode: "explicit",
    historyDepth: "30_days",
    defaultProjectId: "project-a",
  },
  credentialPresent: true,
  status: "backfill",
  liveReady: false,
  capabilities: {},
  safeError: null,
  desiredGeneration: 1,
  appliedGeneration: 1,
  lastProgressAt: null,
  revision: 1,
  etag: '"1"',
  createdAt: "2026-07-23T10:00:00Z",
  updatedAt: "2026-07-23T10:00:00Z",
};

function seedRuntime(): void {
  useWorkspaceAuthStore.setState({
    currentAccountId: runtimeContext.accountId,
    runtimeGeneration: runtimeContext.runtimeGeneration,
    sessions: [
      {
        ...runtimeContext,
        login: "user-a@example.com",
        profile: {
          uuid: "user-a",
          username: "user-a",
          firstName: "User",
          lastName: "A",
          email: "user-a@example.com",
        },
      },
    ],
  });
}

function seedAccounts(accounts: ExternalAccount[]): void {
  const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
  useExternalAccountStore.getState().startOwnerSync(ownerKey);
  useExternalAccountStore.getState().replaceAccountsForOwner(ownerKey, accounts);
}

describe("RightPanelConnectExternalAccountDialog", () => {
  afterEach(() => {
    useWorkspaceAuthStore.setState({
      sessions: [],
      currentAccountId: null,
      runtimeGeneration: 0,
    });
    useExternalAccountStore.getState().clear();
    useExternalChatsStore.getState().clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps the subscribed runtime context snapshot stable", () => {
    useWorkspaceAuthStore.setState({
      currentAccountId: "account-a",
      runtimeGeneration: 1,
      sessions: [
        {
          accountId: "account-a",
          instanceId: "instance-a",
          organizationId: "organization-a",
          organizationOrigin: "https://organization-a.example.com",
          projectId: "project-a",
          userUuid: "user-a",
          login: "user-a@example.com",
          accessToken: "access-token-a",
          runtimeGeneration: 1,
          profile: {
            uuid: "user-a",
            username: "user-a",
            firstName: "User",
            lastName: "A",
            email: "user-a@example.com",
          },
        },
      ],
    });

    renderWithProviders(<RightPanelConnectExternalAccountDialog open onOpenChange={vi.fn()} />);

    expect(document.querySelector('[data-testid="external-account-runtime"]')).toHaveTextContent(
      "account-a",
    );
  });

  it("does not offer manual chat configuration for a connected account", () => {
    seedRuntime();
    seedAccounts([account]);

    renderWithProviders(<RightPanelExternalAccountsList onConnect={vi.fn()} />);

    fireEvent.pointerDown(screen.getByRole("button", { name: "External account actions" }));
    expect(screen.queryByRole("menuitem", { name: "Configure chats" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Disconnect account" })).toBeInTheDocument();
  });

  it("keeps account deletion available from the account actions menu", () => {
    seedRuntime();
    seedAccounts([account]);

    renderWithProviders(<RightPanelExternalAccountsList onConnect={vi.fn()} />);

    fireEvent.pointerDown(screen.getByRole("button", { name: "External account actions" }));
    const deleteItem = screen.getByRole("menuitem", { name: "Disconnect account" });
    expect(deleteItem).toHaveClass("!text-notice-base");
    fireEvent.click(deleteItem);

    expect(screen.getByRole("dialog")).toHaveTextContent("Disconnect account");
  });

  it("does not show chat configuration without an external account", () => {
    seedRuntime();
    seedAccounts([]);

    renderWithProviders(<RightPanelExternalAccountsList onConnect={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Add chats" })).not.toBeInTheDocument();
    expect(screen.getByTestId("connected-external-accounts-list")).toHaveTextContent(
      "No external accounts connected yet.",
    );
    expect(screen.queryByText("Connected", { exact: true })).not.toBeInTheDocument();
  });

  it("renders account identity and status without a nested accordion", () => {
    seedRuntime();
    seedAccounts([account]);

    renderWithProviders(<RightPanelExternalAccountsList onConnect={vi.fn()} />);

    expect(document.querySelector("details")).toBeNull();
    expect(screen.getByTestId("external-account-row")).toHaveTextContent("user@example.com");
    expect(screen.getByTestId("external-account-row")).toHaveTextContent("Zulip");
    expect(screen.getByTestId("external-account-row")).toHaveTextContent("Loading history…");
    expect(screen.getByText("Connected", { exact: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect service" })).toBeInTheDocument();
  });

  it("does not offer manual chat configuration for an automatic account", () => {
    seedRuntime();
    seedAccounts([
      {
        ...account,
        settings: { ...account.settings, selectionMode: "all" },
      },
    ]);

    renderWithProviders(<RightPanelExternalAccountsList onConnect={vi.fn()} />);

    fireEvent.pointerDown(screen.getByRole("button", { name: "External account actions" }));
    expect(screen.queryByRole("menuitem", { name: "Configure chats" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Configure" })).not.toBeInTheDocument();
  });

  it("opens the existing account for editing from its menu", async () => {
    seedRuntime();
    seedAccounts([{ ...account, status: "new" }]);
    renderWithProviders(<RightPanelExternalAccountsList onConnect={vi.fn()} />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "External account actions" }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));
    expect(screen.getByTestId("editing-account")).toHaveTextContent(account.uuid);
    act(() => {
      useExternalAccountStore
        .getState()
        .setLoadStatusForOwner(workspaceRuntimeOwnerKey(runtimeContext), "loading");
    });
    expect(screen.getByTestId("editing-account")).toHaveTextContent(account.uuid);
  });

  it("shows a loading error instead of claiming no accounts exist", () => {
    seedRuntime();
    seedAccounts([]);
    useExternalAccountStore
      .getState()
      .setErrorForOwner(workspaceRuntimeOwnerKey(runtimeContext), "Forbidden");
    renderWithProviders(<RightPanelExternalAccountsList onConnect={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load external accounts");
    expect(screen.queryByText("No external accounts connected yet.")).not.toBeInTheDocument();
  });
});
