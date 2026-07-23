import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExternalAccount } from "~/entities/external-account/external-account.types";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import type { WorkspaceExternalChatDto } from "~/shared/api/messenger-external-accounts.types";
import { MessengerApiError } from "~/shared/api/messenger-transport.internal";
import { useExternalAccountSync } from "./manage-external-account.hook";

const apiMocks = vi.hoisted(() => ({
  getExternalAccounts: vi.fn(),
  getExternalChats: vi.fn(),
  updateExternalAccount: vi.fn(),
  selectExternalChat: vi.fn(),
  deselectExternalChat: vi.fn(),
}));
const refreshExternalAccounts = vi.hoisted(() => vi.fn());

vi.mock("~/shared/api/messenger-external-accounts.api", () => apiMocks);
vi.mock("~/entities/external-account/external-account-sync.lib", () => ({
  refreshExternalAccounts,
}));

const runtimeContext = {
  accountId: "account-1",
  instanceId: "instance-1",
  organizationId: "organization-1",
  organizationOrigin: "https://workspace.example.com",
  projectId: "22222222-2222-4222-8222-222222222222",
  userUuid: "11111111-1111-4111-8111-111111111111",
  accessToken: "access-token",
  runtimeGeneration: 1,
} satisfies WorkspaceRuntimeContext;

const account = {
  uuid: "33333333-3333-4333-8333-333333333333",
  serverUrl: "https://zulip.example.com",
  email: "user@example.com",
  accountType: "zulip",
  selectionMode: "explicit",
  historyDepth: "30_days",
  defaultProjectId: runtimeContext.projectId,
  credentialPresent: true,
  status: "live",
  liveReady: true,
  capabilities: {},
  safeError: null,
  desiredGeneration: 1,
  appliedGeneration: 1,
  lastProgressAt: null,
  revision: 4,
  createdAt: "2026-07-22T10:00:00Z",
  updatedAt: "2026-07-22T10:00:00Z",
} satisfies ExternalAccount;

const chat = {
  uuid: "44444444-4444-4444-8444-444444444444",
  external_account_uuid: account.uuid,
  source: { kind: "zulip", chat_type: "channel", original_url: null },
  display_name: "Engineering",
  selected: false,
  project_id: null,
  history_depth: "30_days",
  projection_stream_uuid: null,
  status: "available",
  capabilities: {},
  safe_error: null,
  transition_pending: false,
  revision: 1,
  created_at: "2026-07-22T10:00:00Z",
  updated_at: "2026-07-22T10:00:00Z",
} satisfies WorkspaceExternalChatDto;

describe("useExternalAccountSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.getExternalChats.mockResolvedValue([chat]);
    apiMocks.getExternalAccounts.mockResolvedValue([]);
    apiMocks.updateExternalAccount.mockResolvedValue({
      revision: 5,
    });
    apiMocks.selectExternalChat.mockResolvedValue({
      ...chat,
      selected: true,
      project_id: runtimeContext.projectId,
      status: "syncing",
      revision: 2,
    });
    refreshExternalAccounts.mockResolvedValue({ source: "network", accounts: [] });
  });

  it("loads chats and saves the account synchronization contract", async () => {
    const { result } = renderHook(() => useExternalAccountSync(runtimeContext, account));
    await waitFor(() => expect(result.current.loadingChats).toBe(false));

    act(() => {
      result.current.setSelectionMode("all");
      result.current.setHistoryDepth("7_days");
    });
    act(() => result.current.saveSettings());

    await waitFor(() => expect(result.current.saved).toBe(true));
    expect(apiMocks.updateExternalAccount).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: runtimeContext.projectId }),
      account.uuid,
      {
        settings: {
          kind: "zulip",
          selection_mode: "all",
          history_depth: "7_days",
          default_project_id: runtimeContext.projectId,
        },
      },
      account.revision,
    );
    expect(refreshExternalAccounts).toHaveBeenCalledWith({ runtimeContext });
  });

  it("selects one discovered chat into the active project", async () => {
    const { result } = renderHook(() => useExternalAccountSync(runtimeContext, account));
    await waitFor(() => expect(result.current.chats).toEqual([chat]));

    act(() => result.current.toggleChat(chat));

    await waitFor(() => expect(result.current.chats[0]?.selected).toBe(true));
    expect(apiMocks.selectExternalChat).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: runtimeContext.projectId }),
      chat.uuid,
      runtimeContext.projectId,
    );
  });

  it("retries a settings save with the latest revision after observed status changes", async () => {
    apiMocks.updateExternalAccount
      .mockRejectedValueOnce(new MessengerApiError("conflict", 412, null))
      .mockResolvedValueOnce({ revision: 9 });
    apiMocks.getExternalAccounts.mockResolvedValue([{ uuid: account.uuid, revision: 8 }]);
    const { result } = renderHook(() => useExternalAccountSync(runtimeContext, account));
    await waitFor(() => expect(result.current.loadingChats).toBe(false));

    act(() => result.current.saveSettings());

    await waitFor(() => expect(result.current.saved).toBe(true));
    expect(apiMocks.updateExternalAccount).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      account.uuid,
      expect.anything(),
      account.revision,
    );
    expect(apiMocks.updateExternalAccount).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      account.uuid,
      expect.anything(),
      8,
    );
  });
});
