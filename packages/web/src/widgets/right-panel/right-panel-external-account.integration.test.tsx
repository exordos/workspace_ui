import { fireEvent, screen, waitFor } from "@testing-library/react";
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
  }: {
    open: boolean;
    runtimeContext: { accountId: string } | null;
  }) =>
    open ? (
      <div role="dialog" data-testid="external-account-runtime">
        {runtimeContext?.accountId ?? "none"}
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

  it("mounts and opens the real chat dialog for a backfill account", async () => {
    const externalChatDto = {
      uuid: "external-chat-1",
      external_account_uuid: account.uuid,
      source: {
        kind: "zulip",
        chat_type: "channel",
        original_url: "https://zulip.example.com/#narrow/channel/42-support",
        description: "Customer support",
        participants: [{ uuid: "zulip-user-1", name: "Ada" }],
        topics: [{ name: "Incidents" }],
      },
      display_name: "Support",
      selected: false,
      project_id: null,
      history_depth: "30_days",
      projection_stream_uuid: null,
      status: "available",
      capabilities: {},
      safe_error: null,
      transition_pending: false,
      revision: 1,
      created_at: "2026-07-23T10:00:00Z",
      updated_at: "2026-07-23T10:00:00Z",
    };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify([externalChatDto]), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "X-Pagination-Limit": "100",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    seedRuntime();
    seedAccounts([account]);

    renderWithProviders(<RightPanelExternalAccountsList />);

    // Card is expanded by default — action button is available immediately
    fireEvent.click(screen.getByRole("button", { name: "Add chats" }));

    expect(await screen.findByText("Support")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveTextContent("Zulip chat sync");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it("keeps account deletion available from the expanded card", () => {
    seedRuntime();
    seedAccounts([account]);

    renderWithProviders(<RightPanelExternalAccountsList />);

    const deleteButton = screen.getByRole("button", { name: "Delete" });
    expect(deleteButton).toHaveClass("bg-danger");
    fireEvent.click(deleteButton);

    expect(screen.getByRole("dialog")).toHaveTextContent("Delete connection");
  });

  it("does not show chat configuration without an external account", () => {
    seedRuntime();
    seedAccounts([]);

    renderWithProviders(<RightPanelExternalAccountsList />);

    expect(screen.queryByRole("button", { name: "Add chats" })).not.toBeInTheDocument();
  });

  it("expands connected accounts by default and still allows collapse", () => {
    seedRuntime();
    seedAccounts([account]);

    renderWithProviders(<RightPanelExternalAccountsList />);

    const card = document.querySelector("details");
    expect(card).toHaveAttribute("open");
    // Actions are visible without an extra expand click
    expect(screen.getByRole("button", { name: "Add chats" })).toBeInTheDocument();

    // Collapse via summary remains available
    fireEvent.click(screen.getByText("user@example.com"));
    expect(card).not.toHaveAttribute("open");
  });

  it("uses synchronization wording for an automatic account", () => {
    seedRuntime();
    seedAccounts([
      {
        ...account,
        settings: { ...account.settings, selectionMode: "all" },
      },
    ]);

    renderWithProviders(<RightPanelExternalAccountsList />);

    expect(screen.getByRole("button", { name: "Configure sync" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add chats" })).not.toBeInTheDocument();
  });
});
