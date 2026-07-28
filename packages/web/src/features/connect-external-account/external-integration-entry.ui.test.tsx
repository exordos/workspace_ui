import { fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useExternalAccountStore } from "~/entities/external-account/external-account.model";
import type { ExternalAccount } from "~/entities/external-account/external-account.types";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { renderWithProviders } from "~/test/render";
import { ExternalIntegrationEntry } from "./external-integration-entry.ui";

vi.mock("~/entities/external-account/external-account-sync.lib", () => ({
  refreshExternalAccounts: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./connect-external-account-dialog.ui", () => ({
  ConnectExternalAccountDialog: () => null,
}));

vi.mock("./delete-external-account-dialog.ui", () => ({
  DeleteExternalAccountDialog: () => null,
}));

vi.mock("~/features/configure-external-chats/configure-external-chats-dialog.ui", () => ({
  ConfigureExternalChatsDialog: ({ open }: { open: boolean }) =>
    open ? <div role="dialog">External chat catalog</div> : null,
}));

const runtimeContext: WorkspaceRuntimeContext = {
  accountId: "workspace-account",
  instanceId: "instance-1",
  organizationId: "organization-1",
  projectId: "project-1",
  userUuid: "user-1",
  organizationOrigin: "https://workspace.example.com",
  accessToken: "access-token",
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
    defaultProjectId: "project-1",
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

function seedAccounts(accounts: ExternalAccount[]): void {
  const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
  useExternalAccountStore.getState().startOwnerSync(ownerKey);
  useExternalAccountStore.getState().replaceAccountsForOwner(ownerKey, accounts);
}

describe("ExternalIntegrationEntry", () => {
  afterEach(() => {
    useExternalAccountStore.getState().clear();
    vi.clearAllMocks();
  });

  it("allows opening chats while a backfill account has a stale empty capability snapshot", () => {
    seedAccounts([account]);
    renderWithProviders(<ExternalIntegrationEntry runtimeContext={runtimeContext} />);

    fireEvent.click(screen.getByRole("button", { name: "Configure chats" }));

    expect(screen.getByRole("dialog")).toHaveTextContent("External chat catalog");
  });

  it("does not show chat configuration without an external account", () => {
    seedAccounts([]);
    renderWithProviders(<ExternalIntegrationEntry runtimeContext={runtimeContext} />);

    expect(screen.queryByRole("button", { name: "Configure chats" })).not.toBeInTheDocument();
  });

  it("uses synchronization wording for an automatic account", () => {
    seedAccounts([
      {
        ...account,
        settings: { ...account.settings, selectionMode: "all" },
      },
    ]);
    renderWithProviders(<ExternalIntegrationEntry runtimeContext={runtimeContext} />);

    expect(screen.getByRole("button", { name: "Configure" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Configure chats" })).not.toBeInTheDocument();
  });
});
