import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useExternalAccountStore } from "~/entities/external-account/external-account.model";
import type { ExternalAccount } from "~/entities/external-account/external-account.types";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { useDeleteExternalAccount } from "./delete-external-account.hook";

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
  status: "live",
  liveReady: true,
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

function seedAccount(): void {
  const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
  useExternalAccountStore.getState().startOwnerSync(ownerKey);
  useExternalAccountStore.getState().replaceAccountsForOwner(ownerKey, [account]);
}

describe("useDeleteExternalAccount", () => {
  afterEach(() => {
    vi.clearAllMocks();
    useExternalAccountStore.getState().clear();
  });

  it("unlocks creation only after DELETE and authoritative refresh remove the account", async () => {
    seedAccount();
    const deleteExternalAccount = vi.fn().mockResolvedValue(undefined);
    const refreshExternalAccounts = vi.fn().mockImplementation(() => {
      useExternalAccountStore
        .getState()
        .replaceAccountsForOwner(workspaceRuntimeOwnerKey(runtimeContext), []);
      return Promise.resolve();
    });
    const onCompleted = vi.fn();
    const { result } = renderHook(() =>
      useDeleteExternalAccount({
        open: true,
        runtimeContext,
        accountUuid: account.uuid,
        onCompleted,
        getRuntimeContext: () => runtimeContext,
        client: { deleteExternalAccount, refreshExternalAccounts },
      }),
    );

    act(() => result.current.remove());

    expect(useExternalAccountStore.getState().accounts).toEqual([account]);
    await waitFor(() => expect(deleteExternalAccount).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(refreshExternalAccounts).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onCompleted).toHaveBeenCalledTimes(1));
    expect(useExternalAccountStore.getState().accounts).toEqual([]);
  });

  it("keeps the account and reports an error when DELETE fails", async () => {
    seedAccount();
    const deleteExternalAccount = vi.fn().mockRejectedValue(new Error("delete failed"));
    const refreshExternalAccounts = vi.fn();
    const { result } = renderHook(() =>
      useDeleteExternalAccount({
        open: true,
        runtimeContext,
        accountUuid: account.uuid,
        getRuntimeContext: () => runtimeContext,
        client: { deleteExternalAccount, refreshExternalAccounts },
      }),
    );

    act(() => result.current.remove());

    await waitFor(() => expect(result.current.error).toBe(true));
    expect(useExternalAccountStore.getState().accounts).toEqual([account]);
    expect(refreshExternalAccounts).not.toHaveBeenCalled();
  });

  it("ignores completion after the runtime becomes stale", async () => {
    seedAccount();
    let resolveDelete: (() => void) | undefined;
    const deleteExternalAccount = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        }),
    );
    let currentRuntime: WorkspaceRuntimeContext | null = runtimeContext;
    const refreshExternalAccounts = vi.fn();
    const onCompleted = vi.fn();
    const { result } = renderHook(() =>
      useDeleteExternalAccount({
        open: true,
        runtimeContext,
        accountUuid: account.uuid,
        onCompleted,
        getRuntimeContext: () => currentRuntime,
        client: { deleteExternalAccount, refreshExternalAccounts },
      }),
    );

    act(() => result.current.remove());
    await waitFor(() => expect(deleteExternalAccount).toHaveBeenCalledTimes(1));
    currentRuntime = { ...runtimeContext, projectId: "project-2", runtimeGeneration: 2 };
    await act(async () => {
      resolveDelete?.();
      await Promise.resolve();
    });

    expect(refreshExternalAccounts).not.toHaveBeenCalled();
    expect(onCompleted).not.toHaveBeenCalled();
    expect(result.current.error).toBe(false);
  });

  it("aborts safely when the confirmation closes", async () => {
    seedAccount();
    let capturedSignal: AbortSignal | undefined;
    const deleteExternalAccount = vi.fn((options: { signal?: AbortSignal }) => {
      capturedSignal = options.signal;
      return new Promise<void>(() => {
        // The request remains pending until closing the dialog aborts its signal.
      });
    });
    const refreshExternalAccounts = vi.fn();
    const { result, rerender } = renderHook(
      ({ open }) =>
        useDeleteExternalAccount({
          open,
          runtimeContext,
          accountUuid: account.uuid,
          getRuntimeContext: () => runtimeContext,
          client: { deleteExternalAccount, refreshExternalAccounts },
        }),
      { initialProps: { open: true } },
    );

    act(() => result.current.remove());
    await waitFor(() => expect(deleteExternalAccount).toHaveBeenCalledTimes(1));
    rerender({ open: false });

    expect(capturedSignal?.aborted).toBe(true);
    expect(refreshExternalAccounts).not.toHaveBeenCalled();
  });
});
