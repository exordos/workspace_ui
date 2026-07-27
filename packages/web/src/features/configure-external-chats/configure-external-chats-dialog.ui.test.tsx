import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ExternalAccount } from "~/entities/external-account/external-account.types";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { renderWithProviders } from "~/test/render";
import { ConfigureExternalChatsDialog } from "./configure-external-chats-dialog.ui";
import { useConfigureExternalChats } from "./configure-external-chats.hook";

vi.mock("./configure-external-chats.hook", () => ({
  useConfigureExternalChats: vi.fn(),
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

describe("ConfigureExternalChatsDialog", () => {
  it("shows the catalog request error when the temporary entry gate lets the user through", () => {
    vi.mocked(useConfigureExternalChats).mockReturnValue({
      chats: [],
      loadStatus: "error",
      loadError: "forbidden",
      query: "",
      pending: new Set(),
      failed: new Set(),
      submitting: false,
      readyCount: 0,
      selectedCount: 0,
      setQuery: vi.fn(),
      toggle: vi.fn(),
      start: vi.fn(),
      retryFailed: vi.fn(),
      refresh: vi.fn(),
    });

    renderWithProviders(
      <ConfigureExternalChatsDialog
        open
        onOpenChange={vi.fn()}
        runtimeContext={runtimeContext}
        account={account}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Could not load chats");
  });
});
