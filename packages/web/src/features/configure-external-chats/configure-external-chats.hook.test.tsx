import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExternalAccount } from "~/entities/external-account/external-account.types";
import { useExternalChatsStore } from "~/entities/external-chat/external-chat.model";
import type { WorkspaceAuthSession } from "~/entities/workspace-auth/workspace-auth.model";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { getExternalChats, selectExternalChat } from "~/shared/api/messenger-external-chats.api";
import type { WorkspaceExternalChatDto } from "~/shared/api/messenger-external-chats.types";
import { useConfigureExternalChats } from "./configure-external-chats.hook";

vi.mock("~/shared/api/messenger-external-chats.api", () => ({
  getExternalChats: vi.fn(),
  selectExternalChat: vi.fn(),
}));

const ACCOUNT_UUID = "20000000-0000-4000-8000-000000000002";
const CHAT_UUID = "10000000-0000-4000-8000-000000000001";
const PROJECT_UUID = "30000000-0000-4000-8000-000000000003";

const runtimeContext: WorkspaceRuntimeContext = {
  accountId: "account-a",
  instanceId: "instance-a",
  organizationId: "organization-a",
  organizationOrigin: "https://workspace.example.com",
  projectId: PROJECT_UUID,
  userUuid: "40000000-0000-4000-8000-000000000004",
  accessToken: "access-token",
  refreshToken: "refresh-token",
  runtimeGeneration: 1,
};

const account: ExternalAccount = {
  uuid: ACCOUNT_UUID,
  provider: "zulip",
  settings: {
    kind: "zulip",
    serverUrl: "https://zulip.example.com",
    email: "user@example.com",
    selectionMode: "explicit",
    historyDepth: "30_days",
    defaultProjectId: PROJECT_UUID,
  },
  credentialPresent: true,
  status: "live",
  liveReady: true,
  capabilities: {},
  safeError: null,
  desiredGeneration: 1,
  appliedGeneration: 1,
  lastProgressAt: null,
  revision: 1,
  createdAt: "2026-07-24T10:00:00Z",
  updatedAt: "2026-07-24T10:00:00Z",
  etag: '"1"',
};

function chatSnapshot(overrides: Partial<WorkspaceExternalChatDto> = {}): WorkspaceExternalChatDto {
  return {
    uuid: CHAT_UUID,
    external_account_uuid: ACCOUNT_UUID,
    source: { kind: "zulip", chat_type: "channel" },
    display_name: "Support",
    selected: true,
    project_id: PROJECT_UUID,
    history_depth: "30_days",
    projection_stream_uuid: null,
    status: "syncing",
    capabilities: {},
    safe_error: null,
    transition_pending: false,
    revision: 1,
    created_at: "2026-07-24T10:00:00Z",
    updated_at: "2026-07-24T10:00:00Z",
    ...overrides,
  };
}

function setRuntime(): void {
  const session: WorkspaceAuthSession = {
    ...runtimeContext,
    login: "user@example.com",
    profile: {
      uuid: runtimeContext.userUuid,
      username: "user",
      firstName: "User",
      lastName: null,
      email: "user@example.com",
    },
  };
  useWorkspaceAuthStore.setState({
    sessions: [session],
    currentAccountId: session.accountId,
    runtimeGeneration: session.runtimeGeneration,
  });
}

describe("useConfigureExternalChats", () => {
  beforeEach(() => {
    vi.mocked(getExternalChats).mockReset();
    vi.mocked(selectExternalChat).mockReset();
    useExternalChatsStore.getState().clear();
    setRuntime();
  });

  afterEach(() => {
    vi.useRealTimers();
    useExternalChatsStore.getState().clear();
    useWorkspaceAuthStore.setState({
      sessions: [],
      currentAccountId: null,
      runtimeGeneration: 0,
    });
  });

  it("does one initial GET and does not poll while a chat is syncing", async () => {
    vi.useFakeTimers();
    vi.mocked(getExternalChats).mockResolvedValue([chatSnapshot()]);

    renderHook(() => useConfigureExternalChats({ open: true, runtimeContext, account }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(getExternalChats).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(getExternalChats).toHaveBeenCalledTimes(1);
  });

  it("applies the successful POST snapshot without a reconciliation GET", async () => {
    vi.mocked(getExternalChats).mockResolvedValue([
      chatSnapshot({ selected: false, project_id: null, status: "available" }),
    ]);
    vi.mocked(selectExternalChat).mockResolvedValue(
      chatSnapshot({ revision: 2, selected: true, status: "syncing" }),
    );
    const { result } = renderHook(() =>
      useConfigureExternalChats({ open: true, runtimeContext, account }),
    );

    await waitFor(() => expect(result.current.loadStatus).toBe("ready"));
    act(() => result.current.toggle(CHAT_UUID));
    await waitFor(() => expect(result.current.pending.has(CHAT_UUID)).toBe(true));
    act(() => result.current.start());

    await waitFor(() => expect(selectExternalChat).toHaveBeenCalledOnce());
    await waitFor(() => expect(result.current.submitting).toBe(false));

    expect(getExternalChats).toHaveBeenCalledTimes(1);
    expect(useExternalChatsStore.getState().chats[0]).toMatchObject({
      uuid: CHAT_UUID,
      selected: true,
      status: "syncing",
      revision: 2,
    });
  });

  it("rehydrates exactly once when authoritative realtime state is reset", async () => {
    vi.mocked(getExternalChats).mockResolvedValue([chatSnapshot()]);
    renderHook(() => useConfigureExternalChats({ open: true, runtimeContext, account }));

    await waitFor(() => expect(getExternalChats).toHaveBeenCalledTimes(1));
    act(() => useExternalChatsStore.getState().clear());
    await waitFor(() => expect(getExternalChats).toHaveBeenCalledTimes(2));

    await new Promise((resolve) => {
      window.setTimeout(resolve, 20);
    });
    expect(getExternalChats).toHaveBeenCalledTimes(2);
  });

  it("uses only one reconciliation GET for a partially failed batch", async () => {
    const secondChatUuid = "50000000-0000-4000-8000-000000000005";
    const firstChat = chatSnapshot({
      selected: false,
      project_id: null,
      status: "available",
    });
    const secondChat = chatSnapshot({
      uuid: secondChatUuid,
      display_name: "Development",
      selected: false,
      project_id: null,
      status: "available",
    });
    vi.mocked(getExternalChats).mockResolvedValue([firstChat, secondChat]);
    vi.mocked(selectExternalChat).mockImplementation((_options, chatUuid) => {
      if (chatUuid === secondChatUuid) return Promise.reject(new Error("failed"));
      return Promise.resolve(chatSnapshot({ revision: 2, selected: true, status: "syncing" }));
    });
    const { result } = renderHook(() =>
      useConfigureExternalChats({ open: true, runtimeContext, account }),
    );

    await waitFor(() => expect(result.current.loadStatus).toBe("ready"));
    act(() => {
      result.current.toggle(CHAT_UUID);
      result.current.toggle(secondChatUuid);
    });
    await waitFor(() => expect(result.current.pending.size).toBe(2));
    act(() => result.current.start());

    await waitFor(() => expect(result.current.submitting).toBe(false));

    expect(selectExternalChat).toHaveBeenCalledTimes(2);
    expect(getExternalChats).toHaveBeenCalledTimes(2);
    expect(
      useExternalChatsStore.getState().chats.find((chat) => chat.uuid === CHAT_UUID),
    ).toMatchObject({ selected: true, revision: 2 });
  });
});
