import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { refreshExternalAccounts } from "~/entities/external-account/external-account-sync.lib";
import { useExternalAccountStore } from "~/entities/external-account/external-account.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import {
  createExternalAccount,
  getExternalAccount,
  reconnectExternalAccount,
} from "~/shared/api/messenger-external-accounts.api";
import { MessengerApiError } from "~/shared/api/messenger-transport.internal";
import { useConnectExternalAccount } from "./connect-external-account.hook";

vi.mock("~/entities/external-account/external-account-sync.lib", () => ({
  refreshExternalAccounts: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("~/shared/api/messenger-external-accounts.api", () => ({
  createExternalAccount: vi.fn(),
  getExternalAccount: vi.fn(),
  reconnectExternalAccount: vi.fn(),
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
  selectionMode: "explicit" | "all" = "explicit",
  historyDepth: "new" | "7_days" | "30_days" | "90_days" | "all" = "30_days",
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

describe("useConnectExternalAccount", () => {
  afterEach(() => {
    vi.clearAllMocks();
    useExternalAccountStore.getState().clear();
  });

  it("creates an explicit 30-day connection in the current project and clears the key", async () => {
    vi.mocked(createExternalAccount).mockResolvedValue(snapshot());
    const randomUuid = vi
      .spyOn(crypto, "randomUUID")
      .mockReturnValue("10000000-0000-4000-8000-000000000001");
    const onCompleted = vi.fn();
    const { result } = renderHook(() =>
      useConnectExternalAccount({
        open: true,
        runtimeContext,
        hasChatsStep: true,
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
      settings: {
        kind: "zulip",
        server_url: "https://zulip.example.com",
        email: "user@example.com",
        api_key: "test",
        selection_mode: "explicit",
        history_depth: "30_days",
        default_project_id: "project-1",
      },
    });
    await waitFor(() => expect(result.current.draft.apiKey).toBe(""));
    await waitFor(() => expect(result.current.phase).toBe("chats"));
    expect(onCompleted).not.toHaveBeenCalled();
    expect(randomUuid).toHaveBeenCalledTimes(1);
    expect(refreshExternalAccounts).toHaveBeenCalled();
  });

  it("completes the legacy explicit flow when no embedded chat step is available", async () => {
    vi.mocked(createExternalAccount).mockResolvedValue(snapshot());
    const onCompleted = vi.fn();
    const { result } = renderHook(() =>
      useConnectExternalAccount({
        open: true,
        runtimeContext,
        hasChatsStep: false,
        onCompleted,
      }),
    );

    act(() => {
      result.current.setServerUrl("https://zulip.example.com");
      result.current.setEmail("user@example.com");
      result.current.setApiKey("test");
    });
    act(() => result.current.submit());

    await waitFor(() => expect(onCompleted).toHaveBeenCalledOnce());
    expect(result.current.phase).not.toBe("chats");
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

  it("keeps checking and starts bounded polling after an unconfirmed response", async () => {
    const connecting = snapshot("external-account-1", "connecting", false);
    vi.mocked(createExternalAccount).mockResolvedValue(connecting);
    vi.mocked(getExternalAccount).mockReturnValue(
      new Promise(() => {
        // Keep polling pending for this assertion.
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

    await waitFor(() => expect(result.current.phase).toBe("checking"));
    await waitFor(() => expect(getExternalAccount).toHaveBeenCalledTimes(1));
    expect(onCompleted).not.toHaveBeenCalled();
    expect(result.current.lifecycleAccount).toMatchObject({
      status: "connecting",
      liveReady: false,
    });
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
      expect(getExternalAccount).not.toHaveBeenCalled();
    },
  );

  it.each(["new", "7_days", "30_days", "90_days", "all"] as const)(
    "sends the selected %s history depth in the create request",
    async (historyDepth) => {
      vi.mocked(createExternalAccount).mockResolvedValue(
        snapshot("external-account-1", "backfill", false, "explicit", historyDepth),
      );
      const { result } = renderHook(() =>
        useConnectExternalAccount({ open: true, runtimeContext }),
      );

      act(() => {
        result.current.setServerUrl("https://zulip.example.com");
        result.current.setEmail("user@example.com");
        result.current.setApiKey("test");
        result.current.setHistoryDepth(historyDepth);
      });
      act(() => result.current.submit());

      await waitFor(() => expect(createExternalAccount).toHaveBeenCalledOnce());
      expect(vi.mocked(createExternalAccount).mock.calls[0]?.[1].settings.history_depth).toBe(
        historyDepth,
      );
    },
  );

  it("finishes automatic onboarding without opening the catalog phase", async () => {
    vi.mocked(createExternalAccount).mockResolvedValue(
      snapshot("external-account-1", "backfill", false, "all"),
    );
    const { result } = renderHook(() => useConnectExternalAccount({ open: true, runtimeContext }));

    act(() => {
      result.current.setServerUrl("https://zulip.example.com");
      result.current.setEmail("user@example.com");
      result.current.setApiKey("test");
      result.current.setSelectionMode("all");
    });
    act(() => result.current.submit());

    await waitFor(() => expect(result.current.phase).toBe("automaticDone"));
    expect(vi.mocked(createExternalAccount).mock.calls[0]?.[1].settings.selection_mode).toBe("all");
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

  it("leaves a completed chat step when realtime reports a later account error", async () => {
    vi.mocked(createExternalAccount).mockResolvedValue(snapshot());
    const { result } = renderHook(() =>
      useConnectExternalAccount({
        open: true,
        runtimeContext,
        hasChatsStep: true,
      }),
    );
    act(() => {
      result.current.setServerUrl("https://zulip.example.com");
      result.current.setEmail("user@example.com");
      result.current.setApiKey("test");
    });
    act(() => result.current.submit());
    await waitFor(() => expect(result.current.phase).toBe("chats"));
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
          revision: connectedAccount!.revision + 1,
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
