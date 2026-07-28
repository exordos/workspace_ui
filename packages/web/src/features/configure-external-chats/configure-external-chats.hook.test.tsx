import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useExternalAccountsStore } from "~/entities/external-account/external-account.model";
import type { ExternalAccount } from "~/entities/external-account/external-account.types";
import { useExternalChatsStore } from "~/entities/external-chat/external-chat.model";
import type { WorkspaceAuthSession } from "~/entities/workspace-auth/workspace-auth.model";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import {
  getExternalAccount,
  updateExternalAccount,
} from "~/shared/api/messenger-external-accounts.api";
import type {
  WorkspaceExternalAccountDto,
  WorkspaceExternalAccountHistoryDepth,
  WorkspaceExternalAccountSelectionMode,
} from "~/shared/api/messenger-external-accounts.types";
import { getExternalChats, selectExternalChat } from "~/shared/api/messenger-external-chats.api";
import type { WorkspaceExternalChatDto } from "~/shared/api/messenger-external-chats.types";
import { MessengerApiError } from "~/shared/api/messenger-transport.internal";
import { useConfigureExternalChats } from "./configure-external-chats.hook";

vi.mock("~/shared/api/messenger-external-accounts.api", () => ({
  getExternalAccount: vi.fn(),
  updateExternalAccount: vi.fn(),
}));

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
const OWNER_KEY = workspaceRuntimeOwnerKey(runtimeContext);

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

function accountDto(
  options: {
    historyDepth?: WorkspaceExternalAccountHistoryDepth;
    selectionMode?: WorkspaceExternalAccountSelectionMode;
    revision?: number;
  } = {},
): WorkspaceExternalAccountDto {
  const revision = options.revision ?? 2;
  return {
    uuid: ACCOUNT_UUID,
    settings: {
      kind: "zulip",
      server_url: "https://zulip.example.com",
      email: "user@example.com",
      selection_mode: options.selectionMode ?? "explicit",
      history_depth: options.historyDepth ?? "90_days",
      default_project_id: PROJECT_UUID,
    },
    credential_present: true,
    status: "live",
    live_ready: true,
    capabilities: {},
    safe_error: null,
    desired_generation: 2,
    applied_generation: 2,
    last_progress_at: null,
    revision,
    created_at: "2026-07-24T10:00:00Z",
    updated_at: "2026-07-24T11:00:00Z",
  };
}

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

function replaceAccount(current: ExternalAccount = account): void {
  const store = useExternalAccountsStore.getState();
  store.startOwnerSync(OWNER_KEY);
  store.replaceAccountsForOwner(OWNER_KEY, [current]);
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve(value) {
      resolvePromise?.(value);
    },
  };
}

describe("useConfigureExternalChats", () => {
  beforeEach(() => {
    vi.mocked(getExternalAccount).mockReset();
    vi.mocked(updateExternalAccount).mockReset();
    vi.mocked(getExternalChats).mockReset();
    vi.mocked(selectExternalChat).mockReset();
    useExternalAccountsStore.getState().clear();
    useExternalChatsStore.getState().clear();
    setRuntime();
    replaceAccount();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    useExternalAccountsStore.getState().clear();
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

  it("selects and clears all available chats visible through the current search", async () => {
    const secondChatUuid = "50000000-0000-4000-8000-000000000005";
    vi.mocked(getExternalChats).mockResolvedValue([
      chatSnapshot({
        selected: false,
        project_id: null,
        status: "available",
      }),
      chatSnapshot({
        uuid: secondChatUuid,
        display_name: "Development",
        selected: false,
        project_id: null,
        status: "available",
      }),
    ]);
    const { result } = renderHook(() =>
      useConfigureExternalChats({ open: true, runtimeContext, account }),
    );

    await waitFor(() => expect(result.current.loadStatus).toBe("ready"));
    expect(result.current.selectAllState).toBe("none");

    act(() => result.current.toggleAllVisible());

    expect(result.current.pending).toEqual(new Set([CHAT_UUID, secondChatUuid]));
    expect(result.current.selectAllState).toBe("all");

    act(() => result.current.setQuery("Support"));
    expect(result.current.selectableVisibleCount).toBe(1);
    expect(result.current.selectAllState).toBe("all");

    act(() => result.current.toggleAllVisible());

    expect(result.current.pending).toEqual(new Set([secondChatUuid]));
    expect(result.current.selectAllState).toBe("none");
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

  it("does not start chat selection while account settings are dirty", async () => {
    vi.mocked(getExternalChats).mockResolvedValue([
      chatSnapshot({ selected: false, project_id: null, status: "available" }),
    ]);
    const { result } = renderHook(() =>
      useConfigureExternalChats({ open: true, runtimeContext, account }),
    );

    await waitFor(() => expect(result.current.loadStatus).toBe("ready"));
    act(() => result.current.toggle(CHAT_UUID));
    act(() => result.current.changeHistoryDepth("90_days"));
    act(() => result.current.start());

    expect(result.current.selectionBlockedBySettings).toBe(true);
    expect(selectExternalChat).not.toHaveBeenCalled();
  });

  it("does not change manual selection or settings while a chat request is submitting", async () => {
    const secondChatUuid = "50000000-0000-4000-8000-000000000005";
    const selection = deferred<WorkspaceExternalChatDto>();
    vi.mocked(getExternalChats).mockResolvedValue([
      chatSnapshot({ selected: false, project_id: null, status: "available" }),
      chatSnapshot({
        uuid: secondChatUuid,
        display_name: "Development",
        selected: false,
        project_id: null,
        status: "available",
      }),
    ]);
    vi.mocked(selectExternalChat).mockReturnValue(selection.promise);
    const { result } = renderHook(() =>
      useConfigureExternalChats({ open: true, runtimeContext, account }),
    );

    await waitFor(() => expect(result.current.loadStatus).toBe("ready"));
    act(() => result.current.toggle(CHAT_UUID));
    act(() => result.current.start());
    await waitFor(() => expect(result.current.submitting).toBe(true));
    act(() => {
      result.current.toggle(secondChatUuid);
      result.current.toggleAllVisible();
      result.current.changeHistoryDepth("90_days");
      result.current.changeSelectionMode("all");
    });

    expect(result.current.pending).toEqual(new Set([CHAT_UUID]));
    expect(result.current.historyDepth).toBe("30_days");
    expect(result.current.selectionMode).toBe("explicit");

    await act(async () => {
      selection.resolve(chatSnapshot({ revision: 2, selected: true, status: "syncing" }));
      await selection.promise;
    });
  });

  it("saves the complete explicit settings and refreshes the catalog", async () => {
    vi.mocked(getExternalChats)
      .mockResolvedValueOnce([chatSnapshot()])
      .mockResolvedValueOnce([chatSnapshot({ history_depth: "90_days", revision: 2 })]);
    vi.mocked(updateExternalAccount).mockResolvedValue({
      account: accountDto({ historyDepth: "90_days" }),
      etag: '"2"',
    });
    const { result } = renderHook(() =>
      useConfigureExternalChats({ open: true, runtimeContext, account }),
    );

    await waitFor(() => expect(result.current.loadStatus).toBe("ready"));
    act(() => result.current.changeHistoryDepth("90_days"));
    await waitFor(() => expect(result.current.historyDepthDirty).toBe(true));
    act(() => result.current.saveSettings());

    await waitFor(() => expect(result.current.saveStatus).toBe("success"));
    expect(updateExternalAccount).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: PROJECT_UUID }),
      ACCOUNT_UUID,
      {
        settings: {
          kind: "zulip",
          selection_mode: "explicit",
          history_depth: "90_days",
          default_project_id: PROJECT_UUID,
        },
      },
      '"1"',
    );
    expect(getExternalChats).toHaveBeenCalledTimes(2);
    expect(useExternalAccountsStore.getState().accounts[0]).toMatchObject({
      revision: 2,
      etag: '"2"',
      settings: { historyDepth: "90_days", defaultProjectId: PROJECT_UUID },
    });
    expect(result.current.historyDepthDirty).toBe(false);
  });

  it("keeps the draft and does not retry automatically after a 412 conflict", async () => {
    vi.mocked(getExternalChats).mockResolvedValue([chatSnapshot()]);
    vi.mocked(updateExternalAccount).mockRejectedValue(
      new MessengerApiError("conflict", 412, {
        type: "ExternalAccountRevisionConflictError",
      }),
    );
    const { result } = renderHook(() =>
      useConfigureExternalChats({ open: true, runtimeContext, account }),
    );

    await waitFor(() => expect(result.current.loadStatus).toBe("ready"));
    act(() => result.current.changeHistoryDepth("90_days"));
    act(() => result.current.saveSettings());

    await waitFor(() => expect(result.current.saveStatus).toBe("conflict"));
    expect(result.current.historyDepth).toBe("90_days");
    expect(result.current.historyDepthDirty).toBe(true);
    expect(updateExternalAccount).toHaveBeenCalledTimes(1);
    expect(getExternalAccount).not.toHaveBeenCalled();
    expect(getExternalChats).toHaveBeenCalledTimes(1);
  });

  it("keeps the draft after a settings request error", async () => {
    vi.mocked(getExternalChats).mockResolvedValue([chatSnapshot()]);
    vi.mocked(updateExternalAccount).mockRejectedValue(
      new MessengerApiError("unavailable", 503, null),
    );
    const { result } = renderHook(() =>
      useConfigureExternalChats({ open: true, runtimeContext, account }),
    );

    await waitFor(() => expect(result.current.loadStatus).toBe("ready"));
    act(() => result.current.changeHistoryDepth("90_days"));
    act(() => result.current.saveSettings());

    await waitFor(() => expect(result.current.saveStatus).toBe("error"));
    expect(result.current.historyDepth).toBe("90_days");
    expect(result.current.historyDepthDirty).toBe(true);
    expect(getExternalChats).toHaveBeenCalledTimes(1);

    vi.mocked(updateExternalAccount).mockResolvedValue({
      account: accountDto({ historyDepth: "90_days" }),
      etag: '"2"',
    });
    act(() => result.current.saveSettings());
    await waitFor(() => expect(result.current.saveStatus).toBe("success"));
    expect(updateExternalAccount).toHaveBeenCalledTimes(2);
  });

  it("loads the current account explicitly after conflict and preserves the draft", async () => {
    vi.mocked(getExternalChats).mockResolvedValue([chatSnapshot()]);
    vi.mocked(getExternalAccount).mockResolvedValue({
      account: accountDto({ historyDepth: "7_days", revision: 3 }),
      etag: '"3"',
    });
    const { result } = renderHook(() =>
      useConfigureExternalChats({ open: true, runtimeContext, account }),
    );

    await waitFor(() => expect(result.current.loadStatus).toBe("ready"));
    act(() => result.current.changeHistoryDepth("90_days"));
    act(() => result.current.reloadAccountSettings());

    await waitFor(() => expect(getExternalAccount).toHaveBeenCalledOnce());
    await waitFor(() => expect(result.current.settingsBusy).toBe(false));
    expect(result.current.historyDepth).toBe("90_days");
    expect(result.current.historyDepthDirty).toBe(true);
    expect(useExternalAccountsStore.getState().accounts[0]).toMatchObject({
      revision: 3,
      etag: '"3"',
      settings: { historyDepth: "7_days" },
    });
  });

  it("reloads both current fields after conflict and retries with the new ETag", async () => {
    vi.mocked(getExternalChats).mockResolvedValue([chatSnapshot()]);
    vi.mocked(getExternalAccount).mockResolvedValue({
      account: accountDto({
        historyDepth: "7_days",
        selectionMode: "explicit",
        revision: 3,
      }),
      etag: '"3"',
    });
    vi.mocked(updateExternalAccount)
      .mockRejectedValueOnce(
        new MessengerApiError("conflict", 412, {
          type: "ExternalAccountRevisionConflictError",
        }),
      )
      .mockResolvedValueOnce({
        account: accountDto({
          historyDepth: "90_days",
          selectionMode: "all",
          revision: 4,
        }),
        etag: '"4"',
      });
    const { result } = renderHook(() =>
      useConfigureExternalChats({ open: true, runtimeContext, account }),
    );

    await waitFor(() => expect(result.current.loadStatus).toBe("ready"));
    act(() => {
      result.current.changeHistoryDepth("90_days");
      result.current.changeSelectionMode("all");
    });
    act(() => result.current.saveSettings());
    await waitFor(() => expect(result.current.saveStatus).toBe("conflict"));
    act(() => result.current.reloadAccountSettings());
    await waitFor(() => expect(result.current.settingsBusy).toBe(false));

    expect(result.current.historyDepth).toBe("90_days");
    expect(result.current.selectionMode).toBe("all");
    expect(result.current.settingsDirty).toBe(true);
    act(() => result.current.saveSettings());
    await waitFor(() => expect(updateExternalAccount).toHaveBeenCalledTimes(2));
    expect(vi.mocked(updateExternalAccount).mock.calls[1]?.[3]).toBe('"3"');
  });

  it("uses a newer realtime account when the conflict reload response is stale", async () => {
    vi.mocked(getExternalChats).mockResolvedValue([
      chatSnapshot({ selected: false, project_id: null, status: "available" }),
    ]);
    const reload = deferred<Awaited<ReturnType<typeof getExternalAccount>>>();
    vi.mocked(getExternalAccount).mockReturnValue(reload.promise);
    const { result } = renderHook(() =>
      useConfigureExternalChats({ open: true, runtimeContext, account }),
    );

    await waitFor(() => expect(result.current.loadStatus).toBe("ready"));
    act(() => result.current.toggle(CHAT_UUID));
    act(() => result.current.changeHistoryDepth("90_days"));
    act(() => result.current.reloadAccountSettings());
    await waitFor(() => expect(getExternalAccount).toHaveBeenCalledOnce());

    act(() => {
      useExternalAccountsStore.getState().upsertAccountForOwner(OWNER_KEY, {
        ...account,
        revision: 4,
        etag: '"4"',
        settings: {
          ...account.settings,
          historyDepth: "7_days",
          selectionMode: "all",
        },
      });
    });
    await act(async () => {
      reload.resolve({
        account: accountDto({
          historyDepth: "30_days",
          selectionMode: "explicit",
          revision: 3,
        }),
        etag: '"3"',
      });
      await reload.promise;
    });

    await waitFor(() => expect(result.current.settingsBusy).toBe(false));
    expect(result.current.historyDepth).toBe("90_days");
    expect(result.current.selectionMode).toBe("all");
    expect(result.current.pending.size).toBe(0);
    expect(result.current.manualSelectionEnabled).toBe(false);
    expect(result.current.settingsDirty).toBe(true);
  });

  it("tracks realtime account settings when clean and preserves a dirty draft", async () => {
    vi.mocked(getExternalChats).mockResolvedValue([chatSnapshot()]);
    const { result, rerender } = renderHook(
      ({ currentAccount }: { currentAccount: ExternalAccount }) =>
        useConfigureExternalChats({ open: true, runtimeContext, account: currentAccount }),
      { initialProps: { currentAccount: account } },
    );
    await waitFor(() => expect(result.current.loadStatus).toBe("ready"));

    rerender({
      currentAccount: {
        ...account,
        revision: 2,
        settings: { ...account.settings, historyDepth: "7_days" },
      },
    });
    await waitFor(() => expect(result.current.historyDepth).toBe("7_days"));
    expect(result.current.historyDepthDirty).toBe(false);

    act(() => result.current.changeHistoryDepth("90_days"));
    rerender({
      currentAccount: {
        ...account,
        revision: 3,
        settings: { ...account.settings, historyDepth: "all" },
      },
    });
    expect(result.current.historyDepth).toBe("90_days");
    expect(result.current.historyDepthDirty).toBe(true);
  });

  it("keeps a newer realtime account snapshot when an older PUT response arrives", async () => {
    vi.mocked(getExternalChats).mockResolvedValue([chatSnapshot()]);
    const update = deferred<Awaited<ReturnType<typeof updateExternalAccount>>>();
    vi.mocked(updateExternalAccount).mockReturnValue(update.promise);
    const { result } = renderHook(() =>
      useConfigureExternalChats({ open: true, runtimeContext, account }),
    );

    await waitFor(() => expect(result.current.loadStatus).toBe("ready"));
    act(() => result.current.changeHistoryDepth("90_days"));
    act(() => result.current.saveSettings());
    await waitFor(() => expect(updateExternalAccount).toHaveBeenCalledOnce());

    act(() => {
      useExternalAccountsStore.getState().upsertAccountForOwner(OWNER_KEY, {
        ...account,
        revision: 3,
        etag: '"3"',
        settings: { ...account.settings, historyDepth: "7_days" },
      });
    });
    await act(async () => {
      update.resolve({
        account: accountDto({ historyDepth: "90_days", revision: 2 }),
        etag: '"2"',
      });
      await update.promise;
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.settingsBusy).toBe(false));
    expect(result.current.saveStatus).toBe("dirty");
    expect(result.current.historyDepth).toBe("90_days");
    expect(result.current.historyDepthDirty).toBe(true);
    expect(useExternalAccountsStore.getState().accounts[0]).toMatchObject({
      revision: 3,
      etag: '"3"',
      settings: { historyDepth: "7_days" },
    });
  });

  it("keeps a newer realtime depth when a stale mode-only PUT response arrives", async () => {
    vi.mocked(getExternalChats).mockResolvedValue([chatSnapshot()]);
    const update = deferred<Awaited<ReturnType<typeof updateExternalAccount>>>();
    vi.mocked(updateExternalAccount).mockReturnValue(update.promise);
    const { result } = renderHook(() =>
      useConfigureExternalChats({ open: true, runtimeContext, account }),
    );

    await waitFor(() => expect(result.current.loadStatus).toBe("ready"));
    act(() => result.current.changeSelectionMode("all"));
    act(() => result.current.saveSettings());
    await waitFor(() => expect(updateExternalAccount).toHaveBeenCalledOnce());

    act(() => {
      useExternalAccountsStore.getState().upsertAccountForOwner(OWNER_KEY, {
        ...account,
        revision: 3,
        etag: '"3"',
        settings: { ...account.settings, historyDepth: "7_days" },
      });
    });
    await act(async () => {
      update.resolve({
        account: accountDto({
          historyDepth: "30_days",
          selectionMode: "all",
          revision: 2,
        }),
        etag: '"2"',
      });
      await update.promise;
    });

    await waitFor(() => expect(result.current.settingsBusy).toBe(false));
    expect(result.current.selectionMode).toBe("all");
    expect(result.current.selectionModeDirty).toBe(true);
    expect(result.current.historyDepth).toBe("7_days");
    expect(result.current.historyDepthDirty).toBe(false);
    expect(useExternalAccountsStore.getState().accounts[0]).toMatchObject({
      revision: 3,
      settings: { historyDepth: "7_days", selectionMode: "explicit" },
    });
  });

  it("switches from explicit to all without per-chat requests and clears manual state", async () => {
    vi.mocked(getExternalChats).mockResolvedValue([
      chatSnapshot({ selected: false, project_id: null, status: "available" }),
    ]);
    const { result } = renderHook(() =>
      useConfigureExternalChats({ open: true, runtimeContext, account }),
    );
    vi.mocked(updateExternalAccount).mockResolvedValue({
      account: accountDto({ historyDepth: "90_days", selectionMode: "all" }),
      etag: '"2"',
    });

    await waitFor(() => expect(result.current.loadStatus).toBe("ready"));
    act(() => result.current.toggle(CHAT_UUID));
    act(() => result.current.changeHistoryDepth("90_days"));
    act(() => result.current.changeSelectionMode("all"));
    expect(result.current.settingsDirty).toBe(true);
    expect(result.current.selectionModeDirty).toBe(true);
    expect(result.current.selectionBlockedBySettings).toBe(true);
    act(() => result.current.start());
    expect(selectExternalChat).not.toHaveBeenCalled();
    act(() => result.current.saveSettings());

    await waitFor(() => expect(result.current.saveStatus).toBe("success"));
    expect(result.current.manualSelectionEnabled).toBe(false);
    expect(result.current.pending.size).toBe(0);
    expect(result.current.failed.size).toBe(0);
    expect(updateExternalAccount).toHaveBeenCalledWith(
      expect.anything(),
      ACCOUNT_UUID,
      {
        settings: {
          kind: "zulip",
          selection_mode: "all",
          history_depth: "90_days",
          default_project_id: PROJECT_UUID,
        },
      },
      '"1"',
    );
    expect(selectExternalChat).not.toHaveBeenCalled();
  });

  it("switches from all to explicit without changing existing selected chats", async () => {
    const allAccount: ExternalAccount = {
      ...account,
      settings: { ...account.settings, selectionMode: "all" },
    };
    vi.mocked(getExternalChats).mockResolvedValue([chatSnapshot({ selected: true })]);
    vi.mocked(updateExternalAccount).mockResolvedValue({
      account: accountDto({
        historyDepth: "30_days",
        selectionMode: "explicit",
      }),
      etag: '"2"',
    });
    const { result } = renderHook(() =>
      useConfigureExternalChats({ open: true, runtimeContext, account: allAccount }),
    );

    await waitFor(() => expect(result.current.loadStatus).toBe("ready"));
    act(() => result.current.changeSelectionMode("explicit"));
    expect(result.current.settingsDirty).toBe(true);
    act(() => result.current.saveSettings());

    await waitFor(() => expect(result.current.saveStatus).toBe("success"));
    expect(updateExternalAccount).toHaveBeenCalledWith(
      expect.anything(),
      ACCOUNT_UUID,
      {
        settings: {
          kind: "zulip",
          selection_mode: "explicit",
          history_depth: "30_days",
          default_project_id: PROJECT_UUID,
        },
      },
      '"1"',
    );
    expect(result.current.manualSelectionEnabled).toBe(true);
    expect(useExternalChatsStore.getState().chats[0]?.selected).toBe(true);
    expect(selectExternalChat).not.toHaveBeenCalled();
  });

  it("merges a realtime depth update into a locally dirty mode draft", async () => {
    vi.mocked(getExternalChats).mockResolvedValue([chatSnapshot()]);
    vi.mocked(updateExternalAccount).mockResolvedValue({
      account: accountDto({
        historyDepth: "7_days",
        selectionMode: "all",
        revision: 4,
      }),
      etag: '"4"',
    });
    const { result, rerender } = renderHook(
      ({ currentAccount }: { currentAccount: ExternalAccount }) =>
        useConfigureExternalChats({ open: true, runtimeContext, account: currentAccount }),
      { initialProps: { currentAccount: account } },
    );

    await waitFor(() => expect(result.current.loadStatus).toBe("ready"));
    act(() => result.current.changeSelectionMode("all"));
    rerender({
      currentAccount: {
        ...account,
        revision: 3,
        etag: '"3"',
        settings: { ...account.settings, historyDepth: "7_days" },
      },
    });

    expect(result.current.selectionMode).toBe("all");
    expect(result.current.historyDepth).toBe("7_days");
    expect(result.current.selectionModeDirty).toBe(true);
    expect(result.current.historyDepthDirty).toBe(false);
    act(() => result.current.saveSettings());

    await waitFor(() => expect(updateExternalAccount).toHaveBeenCalledOnce());
    expect(updateExternalAccount).toHaveBeenCalledWith(
      expect.anything(),
      ACCOUNT_UUID,
      {
        settings: {
          kind: "zulip",
          selection_mode: "all",
          history_depth: "7_days",
          default_project_id: PROJECT_UUID,
        },
      },
      '"3"',
    );
  });

  it("clears failed manual state when realtime switches the saved mode to all", async () => {
    vi.mocked(getExternalChats).mockResolvedValue([
      chatSnapshot({ selected: false, project_id: null, status: "available" }),
    ]);
    vi.mocked(selectExternalChat).mockRejectedValue(new Error("failed"));
    const { result, rerender } = renderHook(
      ({ currentAccount }: { currentAccount: ExternalAccount }) =>
        useConfigureExternalChats({ open: true, runtimeContext, account: currentAccount }),
      { initialProps: { currentAccount: account } },
    );

    await waitFor(() => expect(result.current.loadStatus).toBe("ready"));
    act(() => result.current.toggle(CHAT_UUID));
    act(() => result.current.start());
    await waitFor(() => expect(result.current.failed.has(CHAT_UUID)).toBe(true));

    rerender({
      currentAccount: {
        ...account,
        revision: 2,
        etag: '"2"',
        settings: { ...account.settings, selectionMode: "all" },
      },
    });
    await waitFor(() => expect(result.current.manualSelectionEnabled).toBe(false));
    expect(result.current.pending.size).toBe(0);
    expect(result.current.failed.size).toBe(0);
  });

  it("keeps a successful settings save when catalog refresh fails", async () => {
    vi.mocked(getExternalChats)
      .mockResolvedValueOnce([chatSnapshot()])
      .mockRejectedValueOnce(new Error("catalog unavailable"));
    vi.mocked(updateExternalAccount).mockResolvedValue({
      account: accountDto({ historyDepth: "90_days" }),
      etag: '"2"',
    });
    const { result } = renderHook(() =>
      useConfigureExternalChats({ open: true, runtimeContext, account }),
    );

    await waitFor(() => expect(result.current.loadStatus).toBe("ready"));
    act(() => result.current.changeHistoryDepth("90_days"));
    act(() => result.current.saveSettings());

    await waitFor(() => expect(result.current.saveStatus).toBe("success"));
    await waitFor(() => expect(result.current.loadStatus).toBe("error"));
    expect(result.current.historyDepthDirty).toBe(false);
  });

  it("ignores a save response after the active project changes", async () => {
    vi.mocked(getExternalChats).mockResolvedValue([chatSnapshot()]);
    const update = deferred<Awaited<ReturnType<typeof updateExternalAccount>>>();
    vi.mocked(updateExternalAccount).mockReturnValue(update.promise);
    const { result } = renderHook(() =>
      useConfigureExternalChats({ open: true, runtimeContext, account }),
    );

    await waitFor(() => expect(result.current.loadStatus).toBe("ready"));
    act(() => result.current.changeHistoryDepth("90_days"));
    act(() => result.current.saveSettings());
    await waitFor(() => expect(updateExternalAccount).toHaveBeenCalledOnce());

    await act(async () => {
      useWorkspaceAuthStore.setState({
        sessions: [],
        currentAccountId: null,
        runtimeGeneration: 2,
      });
      update.resolve({
        account: accountDto({ historyDepth: "90_days", revision: 4 }),
        etag: '"4"',
      });
      await update.promise;
      await Promise.resolve();
    });

    expect(useExternalAccountsStore.getState().accounts[0]).toMatchObject({
      revision: 1,
      settings: { historyDepth: "30_days" },
    });
    expect(getExternalChats).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.settingsBusy).toBe(false));
    expect(result.current.saveStatus).toBe("dirty");
  });

  it("aborts a settings request and resets its state when the project scope changes", async () => {
    vi.mocked(getExternalChats).mockResolvedValue([chatSnapshot()]);
    const update = deferred<Awaited<ReturnType<typeof updateExternalAccount>>>();
    vi.mocked(updateExternalAccount).mockReturnValue(update.promise);
    const nextRuntimeContext: WorkspaceRuntimeContext = {
      ...runtimeContext,
      projectId: "60000000-0000-4000-8000-000000000006",
    };
    const { result, rerender } = renderHook(
      ({ currentRuntimeContext }: { currentRuntimeContext: WorkspaceRuntimeContext }) =>
        useConfigureExternalChats({
          open: true,
          runtimeContext: currentRuntimeContext,
          account,
        }),
      { initialProps: { currentRuntimeContext: runtimeContext } },
    );

    await waitFor(() => expect(result.current.loadStatus).toBe("ready"));
    act(() => result.current.changeHistoryDepth("90_days"));
    act(() => result.current.saveSettings());
    await waitFor(() => expect(updateExternalAccount).toHaveBeenCalledOnce());
    const requestSignal = vi.mocked(updateExternalAccount).mock.calls[0]?.[0].signal;

    rerender({ currentRuntimeContext: nextRuntimeContext });

    await waitFor(() => expect(requestSignal?.aborted).toBe(true));
    await waitFor(() => expect(result.current.settingsBusy).toBe(false));
    expect(result.current.saveStatus).toBe("clean");
    expect(result.current.historyDepth).toBe("30_days");
  });

  it("aborts and ignores a save response after unmount", async () => {
    vi.mocked(getExternalChats).mockResolvedValue([chatSnapshot()]);
    const update = deferred<Awaited<ReturnType<typeof updateExternalAccount>>>();
    vi.mocked(updateExternalAccount).mockReturnValue(update.promise);
    const { result, unmount } = renderHook(() =>
      useConfigureExternalChats({ open: true, runtimeContext, account }),
    );

    await waitFor(() => expect(result.current.loadStatus).toBe("ready"));
    act(() => result.current.changeHistoryDepth("90_days"));
    act(() => result.current.saveSettings());
    await waitFor(() => expect(updateExternalAccount).toHaveBeenCalledOnce());
    const requestOptions = vi.mocked(updateExternalAccount).mock.calls[0]?.[0];

    unmount();
    expect(requestOptions?.signal?.aborted).toBe(true);
    update.resolve({
      account: accountDto({ historyDepth: "90_days", revision: 4 }),
      etag: '"4"',
    });
    await update.promise;
    await Promise.resolve();

    expect(useExternalAccountsStore.getState().accounts[0]).toMatchObject({
      revision: 1,
      settings: { historyDepth: "30_days" },
    });
  });
});
