import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { refreshExternalAccounts } from "~/entities/external-account/external-account-sync.lib";
import { useExternalAccountStore } from "~/entities/external-account/external-account.model";
import type { ExternalAccount } from "~/entities/external-account/external-account.types";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import {
  createExternalAccount,
  getExternalAccount,
  reconnectExternalAccount,
  updateExternalAccount,
} from "~/shared/api/messenger-external-accounts.api";
import { MessengerApiError } from "~/shared/api/messenger-transport.internal";
import { replaceWorkspaceExternalAccountCache } from "~/shared/lib/workspace-external-account-cache-db";
import { useConnectExternalAccount } from "./connect-external-account.hook";

vi.mock("~/entities/external-account/external-account-sync.lib", () => ({
  refreshExternalAccounts: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("~/shared/api/messenger-external-accounts.api", () => ({
  createExternalAccount: vi.fn(),
  getExternalAccount: vi.fn(),
  reconnectExternalAccount: vi.fn(),
  updateExternalAccount: vi.fn(),
}));
vi.mock("~/shared/lib/workspace-external-account-cache-db", () => ({
  replaceWorkspaceExternalAccountCache: vi.fn().mockResolvedValue(undefined),
}));

const runtimeContext: WorkspaceRuntimeContext = {
  accountId: "workspace-account",
  instanceId: "instance-1",
  organizationId: "organization-1",
  projectId: "project-1",
  userUuid: "user-1",
  organizationOrigin: "https://workspace.example.com",
  accessToken: "test",
  runtimeGeneration: 1,
};

function snapshot(
  uuid = "external-account-1",
  status: "live" | "backfill" | "connecting" | "auth_required" | "degraded" = "live",
  liveReady = status === "live",
  selectionMode: "explicit" | "all" = "all",
  historyDepth: "new" | "7_days" | "30_days" | "90_days" | "all" = "all",
) {
  return {
    account: {
      uuid,
      settings: {
        kind: "zulip" as const,
        server_url: "https://zulip.example.com",
        email: "user@example.com",
        selection_mode: selectionMode,
        history_depth: historyDepth,
        default_project_id: "project-1",
      },
      credential_present: true,
      status,
      live_ready: liveReady,
      capabilities: {},
      safe_error: null,
      desired_generation: 1,
      applied_generation: 1,
      last_progress_at: null,
      revision: 1,
      created_at: "2026-07-23T10:00:00Z",
      updated_at: "2026-07-23T10:00:00Z",
    },
    etag: '"1"',
  };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
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

function publishAccountUpdate(account: ExternalAccount, patch: Partial<ExternalAccount>): void {
  const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
  const store = useExternalAccountStore.getState();
  const loadGeneration = store.startOwnerSync(ownerKey);
  store.replaceAccountsForOwner(ownerKey, [{ ...account, ...patch }], Date.now(), loadGeneration);
}

describe("useConnectExternalAccount", () => {
  afterEach(() => {
    vi.clearAllMocks();
    useExternalAccountStore.getState().clear();
  });

  it("does not send PUT after the edit form unmounts during its read", async () => {
    const pending = deferred<Awaited<ReturnType<typeof getExternalAccount>>>();
    vi.mocked(getExternalAccount).mockReturnValueOnce(pending.promise);
    const account = snapshot().account;
    const editAccount: ExternalAccount = {
      uuid: account.uuid,
      provider: "zulip",
      settings: {
        kind: "zulip",
        serverUrl: account.settings.server_url,
        email: account.settings.email,
        selectionMode: "all",
        historyDepth: "all",
        defaultProjectId: runtimeContext.projectId,
      },
      status: "new",
      safeError: null,
      revision: 1,
      etag: '"1"',
      createdAt: account.created_at,
      updatedAt: account.updated_at,
    };
    const { result, unmount } = renderHook(() =>
      useConnectExternalAccount({ open: true, runtimeContext, editAccount }),
    );
    act(() => result.current.submit());
    unmount();
    await act(async () => {
      pending.resolve(snapshot());
      await pending.promise;
    });
    expect(updateExternalAccount).not.toHaveBeenCalled();
    expect(replaceWorkspaceExternalAccountCache).not.toHaveBeenCalled();
  });

  it("rejects a delayed edit result after leaving and returning to the owner", async () => {
    const account = snapshot().account;
    const editAccount: ExternalAccount = {
      uuid: account.uuid,
      provider: "zulip",
      settings: {
        kind: "zulip",
        serverUrl: account.settings.server_url,
        email: account.settings.email,
        selectionMode: "all",
        historyDepth: "all",
        defaultProjectId: runtimeContext.projectId,
      },
      status: "new",
      safeError: null,
      revision: 1,
      etag: '"1"',
      createdAt: account.created_at,
      updatedAt: account.updated_at,
    };
    const pending = deferred<Awaited<ReturnType<typeof updateExternalAccount>>>();
    vi.mocked(getExternalAccount).mockResolvedValueOnce(snapshot());
    vi.mocked(updateExternalAccount).mockReturnValueOnce(pending.promise);
    const onCompleted = vi.fn();
    const { result, rerender } = renderHook(
      ({ context }) =>
        useConnectExternalAccount({
          open: true,
          runtimeContext: context,
          editAccount,
          onCompleted,
        }),
      { initialProps: { context: runtimeContext } },
    );
    act(() => result.current.submit());
    await waitFor(() => expect(updateExternalAccount).toHaveBeenCalledOnce());
    rerender({ context: { ...runtimeContext, accountId: "other-account", runtimeGeneration: 2 } });
    rerender({ context: { ...runtimeContext, runtimeGeneration: 3 } });
    publishAccountUpdate(editAccount, { revision: 5 });
    await act(async () => {
      pending.resolve(snapshot());
      await pending.promise;
    });
    expect(useExternalAccountStore.getState().accounts[0]?.revision).toBe(5);
    expect(replaceWorkspaceExternalAccountCache).not.toHaveBeenCalled();
    expect(onCompleted).not.toHaveBeenCalled();
    expect(result.current.submitting).toBe(false);
  });

  it("completes once after saving a new model without bridge readiness or events", async () => {
    const current = snapshot().account;
    vi.mocked(createExternalAccount).mockResolvedValue({
      account: {
        uuid: current.uuid,
        provider: "zulip",
        settings: current.settings,
        status: "new",
        error_description: null,
        revision: 1,
        created_at: current.created_at,
        updated_at: current.updated_at,
      },
      etag: '"1"',
    });
    const onCompleted = vi.fn();
    const { result } = renderHook(() =>
      useConnectExternalAccount({
        open: true,
        runtimeContext,
        onCompleted,
      }),
    );
    useExternalAccountStore.getState().startOwnerSync(workspaceRuntimeOwnerKey(runtimeContext));
    act(() => {
      result.current.setServerUrl("https://zulip.example.com");
      result.current.setEmail("user@example.com");
      result.current.setApiKey("test");
    });
    act(() => result.current.submit());
    await waitFor(() => expect(onCompleted).toHaveBeenCalledOnce());
    expect(result.current.error).toBeNull();
    expect(result.current.draft.apiKey).toBe("");
    expect(useExternalAccountStore.getState().accounts[0]).toMatchObject({
      uuid: current.uuid,
      status: "new",
    });
    expect(createExternalAccount).toHaveBeenCalledOnce();
  });

  it("connects all chats with full history in the current project and clears the key", async () => {
    vi.mocked(createExternalAccount).mockResolvedValue(snapshot());
    const randomUuid = vi
      .spyOn(crypto, "randomUUID")
      .mockReturnValue("10000000-0000-4000-8000-000000000001");
    const onCompleted = vi.fn();
    const { result } = renderHook(() =>
      useConnectExternalAccount({
        open: true,
        runtimeContext,
        onCompleted,
      }),
    );

    act(() => {
      result.current.setServerUrl("https://zulip.example.com");
      result.current.setEmail("user@example.com");
      result.current.setApiKey("test");
    });
    act(() => {
      result.current.submit();
    });

    await waitFor(() => expect(createExternalAccount).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createExternalAccount).mock.calls[0]?.[1]).toEqual({
      uuid: "10000000-0000-4000-8000-000000000001",
      provider: "zulip",
      settings: {
        kind: "zulip",
        server_url: "https://zulip.example.com",
        email: "user@example.com",
        api_key: "test",
        selection_mode: "all",
        history_depth: "all",
        default_project_id: "project-1",
      },
    });
    await waitFor(() => expect(result.current.draft.apiKey).toBe(""));
    await waitFor(() => expect(result.current.phase).toBe("automaticDone"));
    expect(onCompleted).toHaveBeenCalledOnce();
    expect(randomUuid).toHaveBeenCalledTimes(1);
    expect(refreshExternalAccounts).toHaveBeenCalledOnce();
  });

  it("finishes automatically even when the server snapshot contains legacy manual settings", async () => {
    vi.mocked(createExternalAccount).mockResolvedValue(
      snapshot("external-account-1", "live", true, "explicit", "30_days"),
    );
    const onCompleted = vi.fn();
    const { result } = renderHook(() =>
      useConnectExternalAccount({
        open: true,
        runtimeContext,
        onCompleted,
      }),
    );

    act(() => {
      result.current.setServerUrl("https://zulip.example.com");
      result.current.setEmail("user@example.com");
      result.current.setApiKey("test");
    });
    act(() => result.current.submit());

    await waitFor(() => expect(result.current.phase).toBe("automaticDone"));
    expect(onCompleted).toHaveBeenCalledOnce();
  });

  it("reconnects an existing account with its ETag", async () => {
    const reconnectAccount = {
      uuid: "external-account-1",
      provider: "zulip" as const,
      settings: {
        kind: "zulip" as const,
        serverUrl: "https://zulip.example.com",
        email: "old@example.com",
        selectionMode: "explicit" as const,
        historyDepth: "30_days" as const,
        defaultProjectId: "project-1",
      },
      credentialPresent: true,
      status: "auth_required" as const,
      liveReady: false,
      capabilities: {},
      safeError: null,
      desiredGeneration: 1,
      appliedGeneration: 0,
      lastProgressAt: null,
      revision: 3,
      etag: '"3"',
      createdAt: "2026-07-23T10:00:00Z",
      updatedAt: "2026-07-23T10:00:00Z",
    };
    vi.mocked(reconnectExternalAccount).mockResolvedValue(snapshot());
    const onCompleted = vi.fn();
    const { result } = renderHook(() =>
      useConnectExternalAccount({ open: true, runtimeContext, reconnectAccount, onCompleted }),
    );

    act(() => {
      result.current.setEmail("new@example.com");
      result.current.setApiKey("changed");
    });
    act(() => {
      result.current.submit();
    });

    await waitFor(() => expect(reconnectExternalAccount).toHaveBeenCalledTimes(1));
    expect(vi.mocked(reconnectExternalAccount).mock.calls[0]?.slice(1)).toEqual([
      "external-account-1",
      {
        settings: {
          kind: "zulip",
          server_url: "https://zulip.example.com",
          email: "new@example.com",
          api_key: "changed",
        },
      },
      '"3"',
    ]);
    await waitFor(() => expect(onCompleted).toHaveBeenCalledTimes(1));
  });

  it("refreshes the current account after a reconnect revision conflict", async () => {
    const reconnectAccount = {
      uuid: "external-account-1",
      provider: "zulip" as const,
      settings: {
        kind: "zulip" as const,
        serverUrl: "https://zulip.example.com",
        email: "old@example.com",
        selectionMode: "explicit" as const,
        historyDepth: "30_days" as const,
        defaultProjectId: "project-1",
      },
      credentialPresent: true,
      status: "auth_required" as const,
      liveReady: false,
      capabilities: {},
      safeError: null,
      desiredGeneration: 1,
      appliedGeneration: 0,
      lastProgressAt: null,
      revision: 3,
      etag: '"3"',
      createdAt: "2026-07-23T10:00:00Z",
      updatedAt: "2026-07-23T10:00:00Z",
    };
    vi.mocked(reconnectExternalAccount).mockRejectedValue(
      new MessengerApiError("Conflict", 412, {
        type: "ExternalAccountRevisionConflictError",
      }),
    );
    const { result } = renderHook(() =>
      useConnectExternalAccount({
        open: true,
        runtimeContext,
        reconnectAccount,
      }),
    );
    await waitFor(() => expect(refreshExternalAccounts).toHaveBeenCalledOnce());
    vi.mocked(refreshExternalAccounts).mockClear();

    act(() => result.current.setApiKey("changed"));
    act(() => result.current.submit());

    await waitFor(() => expect(result.current.error).toBe("conflict"));
    expect(refreshExternalAccounts).toHaveBeenCalledOnce();
    expect(reconnectExternalAccount).toHaveBeenCalledOnce();
  });

  it("maps an external resource 403 to the forbidden connection error", async () => {
    vi.mocked(createExternalAccount).mockRejectedValue(
      new MessengerApiError("Forbidden", 403, {
        type: "ExternalResourceForbiddenError",
        code: 403,
        message: "External resource access is forbidden",
      }),
    );
    const onCompleted = vi.fn();
    const { result } = renderHook(() =>
      useConnectExternalAccount({ open: true, runtimeContext, onCompleted }),
    );

    act(() => {
      result.current.setServerUrl("https://zulip.example.com");
      result.current.setEmail("user@example.com");
      result.current.setApiKey("test");
    });
    act(() => result.current.submit());

    await waitFor(() => expect(result.current.error).toBe("forbidden"));
    expect(onCompleted).not.toHaveBeenCalled();
  });

  it("maps an account conflict to a recoverable form error", async () => {
    vi.mocked(createExternalAccount).mockRejectedValue(
      new MessengerApiError("Conflict", 409, {
        type: "ExternalAccountConflictError",
      }),
    );
    const { result } = renderHook(() => useConnectExternalAccount({ open: true, runtimeContext }));

    act(() => {
      result.current.setServerUrl("https://zulip.example.com");
      result.current.setEmail("user@example.com");
      result.current.setApiKey("test");
    });
    act(() => result.current.submit());

    await waitFor(() => expect(result.current.error).toBe("conflict"));
    expect(result.current.phase).toBe("credentials");
    expect(refreshExternalAccounts).toHaveBeenCalledTimes(2);
  });

  it("reuses the client UUID when an uncertain create request is retried unchanged", async () => {
    vi.mocked(createExternalAccount)
      .mockRejectedValueOnce(new Error("network lost"))
      .mockResolvedValueOnce(snapshot());
    const randomUuid = vi
      .spyOn(crypto, "randomUUID")
      .mockReturnValue("10000000-0000-4000-8000-000000000009");
    const { result } = renderHook(() => useConnectExternalAccount({ open: true, runtimeContext }));

    act(() => {
      result.current.setServerUrl("https://zulip.example.com");
      result.current.setEmail("user@example.com");
      result.current.setApiKey("test");
    });
    act(() => result.current.submit());
    await waitFor(() => expect(result.current.error).toBe("connect"));
    act(() => result.current.submit());

    await waitFor(() => expect(createExternalAccount).toHaveBeenCalledTimes(2));
    expect(vi.mocked(createExternalAccount).mock.calls.map((call) => call[1].uuid)).toEqual([
      "10000000-0000-4000-8000-000000000009",
      "10000000-0000-4000-8000-000000000009",
    ]);
    expect(randomUuid).toHaveBeenCalledOnce();
  });

  it("completes after saving without waiting for a ready account snapshot", async () => {
    const connecting = snapshot("external-account-1", "connecting", false);
    vi.mocked(createExternalAccount).mockResolvedValue(connecting);
    const onCompleted = vi.fn();
    const { result } = renderHook(() =>
      useConnectExternalAccount({
        open: true,
        runtimeContext,
        onCompleted,
      }),
    );

    act(() => {
      result.current.setServerUrl("https://zulip.example.com");
      result.current.setEmail("user@example.com");
      result.current.setApiKey("test");
    });
    act(() => result.current.submit());

    await waitFor(() => expect(result.current.phase).toBe("checking"));
    await waitFor(() => expect(onCompleted).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(result.current.lifecycleAccount).toMatchObject({
        status: "connecting",
        liveReady: false,
      }),
    );

    act(() => {
      publishAccountUpdate(result.current.lifecycleAccount!, {
        status: "live",
        liveReady: true,
        revision: 2,
      });
    });

    await waitFor(() => expect(result.current.phase).toBe("automaticDone"));
    expect(refreshExternalAccounts).toHaveBeenCalledOnce();
  });

  it("requires the current account generation to be ready", async () => {
    vi.mocked(createExternalAccount).mockResolvedValue(
      snapshot("external-account-1", "connecting", false),
    );
    const { result } = renderHook(() =>
      useConnectExternalAccount({
        open: true,
        runtimeContext,
      }),
    );

    act(() => {
      result.current.setServerUrl("https://zulip.example.com");
      result.current.setEmail("user@example.com");
      result.current.setApiKey("test");
    });
    act(() => result.current.submit());
    await waitFor(() => expect(result.current.lifecycleAccount).not.toBeNull());

    act(() => {
      publishAccountUpdate(result.current.lifecycleAccount!, {
        status: "live",
        liveReady: true,
        desiredGeneration: 2,
        appliedGeneration: 1,
        revision: 2,
      });
    });

    await waitFor(() => expect(result.current.lifecycleAccount?.revision).toBe(2));
    expect(result.current.phase).toBe("checking");

    act(() => {
      publishAccountUpdate(result.current.lifecycleAccount!, {
        appliedGeneration: 2,
        revision: 3,
      });
    });

    await waitFor(() => expect(result.current.phase).toBe("automaticDone"));
  });

  it("ignores realtime updates for a different external account", async () => {
    vi.mocked(createExternalAccount).mockResolvedValue(
      snapshot("external-account-1", "connecting", false),
    );
    const { result } = renderHook(() =>
      useConnectExternalAccount({
        open: true,
        runtimeContext,
      }),
    );

    act(() => {
      result.current.setServerUrl("https://zulip.example.com");
      result.current.setEmail("user@example.com");
      result.current.setApiKey("test");
    });
    act(() => result.current.submit());
    await waitFor(() => expect(result.current.lifecycleAccount).not.toBeNull());

    act(() => {
      publishAccountUpdate(result.current.lifecycleAccount!, {
        uuid: "external-account-2",
        status: "live",
        liveReady: true,
        revision: 2,
      });
    });

    expect(result.current.lifecycleAccount).toMatchObject({
      uuid: "external-account-1",
      status: "connecting",
      revision: 1,
    });
    expect(result.current.phase).toBe("checking");
  });

  it.each(["auth_required", "degraded"] as const)(
    "does not advance onboarding when the bridge reports %s",
    async (status) => {
      vi.mocked(createExternalAccount).mockResolvedValue(
        snapshot("external-account-1", status, false),
      );
      const { result } = renderHook(() =>
        useConnectExternalAccount({ open: true, runtimeContext }),
      );

      act(() => {
        result.current.setServerUrl("https://zulip.example.com");
        result.current.setEmail("user@example.com");
        result.current.setApiKey("test");
      });
      act(() => result.current.submit());

      await waitFor(() => expect(result.current.lifecycleAccount?.status).toBe(status));
      expect(result.current.phase).toBe("checking");
      expect(refreshExternalAccounts).toHaveBeenCalledOnce();
    },
  );

  it("waits for realtime readiness before finishing automatic onboarding", async () => {
    vi.mocked(createExternalAccount).mockResolvedValue(
      snapshot("external-account-1", "backfill", false, "all"),
    );
    const { result } = renderHook(() => useConnectExternalAccount({ open: true, runtimeContext }));

    act(() => {
      result.current.setServerUrl("https://zulip.example.com");
      result.current.setEmail("user@example.com");
      result.current.setApiKey("test");
    });
    act(() => result.current.submit());

    await waitFor(() => expect(result.current.phase).toBe("checking"));
    await waitFor(() =>
      expect(result.current.lifecycleAccount).toMatchObject({
        status: "backfill",
        liveReady: false,
      }),
    );

    act(() => {
      publishAccountUpdate(result.current.lifecycleAccount!, {
        status: "live",
        liveReady: true,
        revision: 2,
      });
    });

    await waitFor(() => expect(result.current.phase).toBe("automaticDone"));
    expect(vi.mocked(createExternalAccount).mock.calls[0]?.[1].settings.selection_mode).toBe("all");
    expect(refreshExternalAccounts).toHaveBeenCalledOnce();
  });

  it("ignores the create response after the active runtime changes", async () => {
    const create = deferred<Awaited<ReturnType<typeof createExternalAccount>>>();
    vi.mocked(createExternalAccount).mockReturnValue(create.promise);
    const nextRuntime = { ...runtimeContext, projectId: "project-2", runtimeGeneration: 2 };
    const { result, rerender } = renderHook(
      ({ currentRuntime }: { currentRuntime: WorkspaceRuntimeContext }) =>
        useConnectExternalAccount({ open: true, runtimeContext: currentRuntime }),
      { initialProps: { currentRuntime: runtimeContext } },
    );

    act(() => {
      result.current.setServerUrl("https://zulip.example.com");
      result.current.setEmail("user@example.com");
      result.current.setApiKey("test");
    });
    act(() => result.current.submit());
    await waitFor(() => expect(createExternalAccount).toHaveBeenCalledOnce());

    rerender({ currentRuntime: nextRuntime });
    await act(async () => {
      create.resolve(snapshot());
      await create.promise;
      await Promise.resolve();
    });

    expect(result.current.lifecycleAccount).toBeNull();
    expect(result.current.phase).toBe("credentials");
  });

  it("aborts a pending create on close and reopens with an active form", async () => {
    const create = deferred<Awaited<ReturnType<typeof createExternalAccount>>>();
    vi.mocked(createExternalAccount).mockReturnValue(create.promise);
    const { result, rerender } = renderHook(
      ({ currentOpen }: { currentOpen: boolean }) =>
        useConnectExternalAccount({ open: currentOpen, runtimeContext }),
      { initialProps: { currentOpen: true } },
    );

    act(() => {
      result.current.setServerUrl("https://zulip.example.com");
      result.current.setEmail("user@example.com");
      result.current.setApiKey("test");
    });
    act(() => result.current.submit());
    await waitFor(() => expect(createExternalAccount).toHaveBeenCalledOnce());
    const requestSignal = vi.mocked(createExternalAccount).mock.calls[0]?.[0].signal;

    rerender({ currentOpen: false });
    expect(requestSignal?.aborted).toBe(true);
    rerender({ currentOpen: true });

    expect(result.current.submitting).toBe(false);
    expect(result.current.phase).toBe("credentials");
    expect(result.current.lifecycleAccount).toBeNull();
  });

  it("ignores an old response after runtime generation changes for the same owner", async () => {
    const create = deferred<Awaited<ReturnType<typeof createExternalAccount>>>();
    vi.mocked(createExternalAccount).mockReturnValue(create.promise);
    const nextRuntime = { ...runtimeContext, runtimeGeneration: 2 };
    const { result, rerender } = renderHook(
      ({ currentRuntime }: { currentRuntime: WorkspaceRuntimeContext }) =>
        useConnectExternalAccount({ open: true, runtimeContext: currentRuntime }),
      { initialProps: { currentRuntime: runtimeContext } },
    );

    act(() => {
      result.current.setServerUrl("https://zulip.example.com");
      result.current.setEmail("user@example.com");
      result.current.setApiKey("test");
    });
    act(() => result.current.submit());
    await waitFor(() => expect(createExternalAccount).toHaveBeenCalledOnce());

    rerender({ currentRuntime: nextRuntime });
    await act(async () => {
      create.resolve(snapshot());
      await create.promise;
      await Promise.resolve();
    });

    expect(result.current.submitting).toBe(false);
    expect(result.current.lifecycleAccount).toBeNull();
    expect(result.current.phase).toBe("credentials");
  });

  it("leaves automatic completion when realtime reports a later account error", async () => {
    vi.mocked(createExternalAccount).mockResolvedValue(snapshot());
    const { result } = renderHook(() =>
      useConnectExternalAccount({
        open: true,
        runtimeContext,
      }),
    );
    act(() => {
      result.current.setServerUrl("https://zulip.example.com");
      result.current.setEmail("user@example.com");
      result.current.setApiKey("test");
    });
    act(() => result.current.submit());
    await waitFor(() => expect(result.current.phase).toBe("automaticDone"));
    const connectedAccount = result.current.lifecycleAccount;
    expect(connectedAccount).not.toBeNull();

    const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
    act(() => {
      const store = useExternalAccountStore.getState();
      store.startOwnerSync(ownerKey);
      store.replaceAccountsForOwner(ownerKey, [
        {
          ...connectedAccount!,
          status: "degraded",
          safeError: "Bridge stopped",
          revision: 2,
        },
      ]);
    });

    await waitFor(() => expect(result.current.phase).toBe("checking"));
    expect(result.current.lifecycleAccount).toMatchObject({
      status: "degraded",
      safeError: "Bridge stopped",
    });
    expect(result.current.reconnecting).toBe(true);
  });
});
