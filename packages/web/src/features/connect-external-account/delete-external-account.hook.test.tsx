import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useExternalAccountStore } from "~/entities/external-account/external-account.model";
import type { ExternalAccount } from "~/entities/external-account/external-account.types";
import { externalChatScopeKey } from "~/entities/external-chat/external-chat-loader.lib";
import { useExternalChatsStore } from "~/entities/external-chat/external-chat.model";
import type { ExternalChat } from "~/entities/external-chat/external-chat.types";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
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
const STREAM_UUID = "10000000-0000-4000-8000-000000000001";
const CHAT_UUID = "20000000-0000-4000-8000-000000000002";

const externalChat: ExternalChat = {
  uuid: CHAT_UUID,
  externalAccountUuid: account.uuid,
  type: "channel",
  displayName: "Support",
  selected: true,
  projectId: runtimeContext.projectId,
  projectionStreamUuid: STREAM_UUID,
  status: "live",
  safeError: null,
  transitionPending: false,
  revision: 1,
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
    useExternalChatsStore.getState().clear();
    useMessengerStore.getState().clear();
  });

  it("removes the account locally after DELETE without a refresh request", async () => {
    seedAccount();
    const deleteExternalAccount = vi.fn().mockResolvedValue(undefined);
    const onCompleted = vi.fn();
    const { result } = renderHook(() =>
      useDeleteExternalAccount({
        open: true,
        runtimeContext,
        accountUuid: account.uuid,
        onCompleted,
        getRuntimeContext: () => runtimeContext,
        client: { deleteExternalAccount },
      }),
    );

    act(() => result.current.remove());

    expect(useExternalAccountStore.getState().accounts).toEqual([account]);
    await waitFor(() => expect(deleteExternalAccount).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onCompleted).toHaveBeenCalledTimes(1));
    expect(useExternalAccountStore.getState().accounts).toEqual([]);
  });

  it("keeps the account and reports an error when DELETE fails", async () => {
    seedAccount();
    const deleteExternalAccount = vi.fn().mockRejectedValue(new Error("delete failed"));
    const { result } = renderHook(() =>
      useDeleteExternalAccount({
        open: true,
        runtimeContext,
        accountUuid: account.uuid,
        getRuntimeContext: () => runtimeContext,
        client: { deleteExternalAccount },
      }),
    );

    act(() => result.current.remove());

    await waitFor(() => expect(result.current.error).toBe(true));
    expect(useExternalAccountStore.getState().accounts).toEqual([account]);
  });

  it("cleans only known current-project projections after DELETE succeeds", async () => {
    seedAccount();
    const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
    const scopeKey = externalChatScopeKey(runtimeContext, account.uuid);
    const chatStore = useExternalChatsStore.getState();
    const generation = chatStore.start(scopeKey, account.uuid);
    chatStore.replace(scopeKey, account.uuid, generation, [externalChat]);
    useMessengerStore.getState().startBootstrap(ownerKey);
    useMessengerStore.getState().upsertStream(ownerKey, {
      uuid: STREAM_UUID,
      projectId: runtimeContext.projectId,
      ownerUuid: runtimeContext.userUuid,
      userUuid: runtimeContext.userUuid,
      role: "owner",
      notificationMode: "all_messages",
      name: "Support",
      description: "",
      unreadCount: 0,
      sourceName: "zulip",
      source: { kind: "zulip", server_url: "https://zulip.example.com", stream_id: 1 },
      audience: "channel",
      isPrivate: false,
      inviteOnly: false,
      announce: false,
      isArchived: false,
      directUserUuid: null,
      lastMessageUuid: null,
      createdAt: "2026-07-23T10:00:00Z",
      updatedAt: "2026-07-23T10:00:00Z",
    });
    const { result } = renderHook(() =>
      useDeleteExternalAccount({
        open: true,
        runtimeContext,
        accountUuid: account.uuid,
        getRuntimeContext: () => runtimeContext,
        client: { deleteExternalAccount: vi.fn().mockResolvedValue(undefined) },
      }),
    );

    act(() => result.current.remove());
    await waitFor(() =>
      expect(useMessengerStore.getState().streamsById[STREAM_UUID]).toBeUndefined(),
    );

    expect(useExternalChatsStore.getState().externalAccountUuid).toBeNull();
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
    const onCompleted = vi.fn();
    const { result } = renderHook(() =>
      useDeleteExternalAccount({
        open: true,
        runtimeContext,
        accountUuid: account.uuid,
        onCompleted,
        getRuntimeContext: () => currentRuntime,
        client: { deleteExternalAccount },
      }),
    );

    act(() => result.current.remove());
    await waitFor(() => expect(deleteExternalAccount).toHaveBeenCalledTimes(1));
    currentRuntime = { ...runtimeContext, projectId: "project-2", runtimeGeneration: 2 };
    await act(async () => {
      resolveDelete?.();
      await Promise.resolve();
    });

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
    const { result, rerender } = renderHook(
      ({ open }) =>
        useDeleteExternalAccount({
          open,
          runtimeContext,
          accountUuid: account.uuid,
          getRuntimeContext: () => runtimeContext,
          client: { deleteExternalAccount },
        }),
      { initialProps: { open: true } },
    );

    act(() => result.current.remove());
    await waitFor(() => expect(deleteExternalAccount).toHaveBeenCalledTimes(1));
    rerender({ open: false });

    expect(capturedSignal?.aborted).toBe(true);
  });
});
