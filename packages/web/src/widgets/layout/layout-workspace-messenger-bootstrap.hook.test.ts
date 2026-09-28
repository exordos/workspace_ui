import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useActivityStore, type ActivityUnreadMention } from "~/entities/activity/activity.model";
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import type { BootstrapMessengerStoreOptions } from "~/entities/messenger/messenger-bootstrap.lib";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type { MessengerConversationId } from "~/entities/messenger/messenger.types";
import type { WorkspaceAuthSession } from "~/entities/workspace-auth/workspace-auth.model";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import {
  isWorkspaceRuntimeRequestInvalidated,
  workspaceRuntimeOwnerKey,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import { useWorkspaceJitsiSettingsStore } from "~/features/jitsi-call/jitsi-call-settings.model";
import type { WorkspaceMessengerEpochDto } from "~/shared/api/messenger.types";
import type * as WorkspaceClient from "~/shared/api/workspace-client";
import { createWorkspaceRealtimeCursorStorage } from "~/shared/lib/workspace-realtime/workspace-realtime-cursor.lib";
import {
  createWorkspaceRealtimeNoopApplier,
  createWorkspaceRealtimeTransportCore,
} from "~/shared/lib/workspace-realtime/workspace-realtime-runtime.lib";
import { useLayoutUnreadMentionsBootstrap } from "./layout-unread-mentions-bootstrap.hook";
import { useLayoutWorkspaceMessengerBootstrap } from "./layout-workspace-messenger-bootstrap.hook";
import {
  useLayoutWorkspaceRealtime,
  type LayoutWorkspaceRealtimeRuntimeFactory,
} from "./layout-workspace-realtime.hook";

const bootstrapSnapshotMock = vi.hoisted(() =>
  vi.fn((_options: BootstrapMessengerStoreOptions): Promise<unknown> => Promise.resolve()),
);
const fetchUnreadMentionsMock = vi.hoisted(() => vi.fn<() => Promise<ActivityUnreadMention[]>>());

vi.mock("~/entities/activity/activity-mentions.api", () => ({
  fetchUnreadMentions: fetchUnreadMentionsMock,
}));

const ensureFreshWorkspaceSessionMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const getEpochMock = vi.hoisted(() => vi.fn<() => Promise<WorkspaceMessengerEpochDto>>());
const fetchWorkspaceServerSettingsForOrganizationMock = vi.hoisted(() =>
  vi.fn(() =>
    Promise.resolve({
      meet_url: "https://meet.workspace.example.com",
    }),
  ),
);
const WORKSPACE_AUTH_STORAGE_KEY = "workspace-auth-sessions";
const WORKSPACE_AUTH_CURRENT_ACCOUNT_KEY = "workspace-auth-current-account";

vi.mock("~/entities/messenger/messenger-bootstrap.lib", () => ({
  bootstrapMessengerStore: async (options: BootstrapMessengerStoreOptions) => {
    await options.beforeServerRefresh?.();
    if (
      isWorkspaceRuntimeRequestInvalidated(
        options.runtimeContext,
        options.getRuntimeContext ?? (() => options.runtimeContext),
        options.signal,
      )
    )
      return { status: "skipped", ownerKey: null, reason: "stale-owner" };
    return bootstrapSnapshotMock(options);
  },
}));

vi.mock("~/shared/api/workspace-client", async (importOriginal) => ({
  ...(await importOriginal<typeof WorkspaceClient>()),
  getEpoch: getEpochMock,
}));

function epoch(version: number): WorkspaceMessengerEpochDto {
  return {
    epoch_generation: "generation-a",
    epoch_version: version,
    current_epoch_version: version,
    minimum_epoch_version: 1,
  };
}

vi.mock("~/entities/workspace-auth/workspace-auth.lib", () => ({
  classifyWorkspaceAuthRefreshError: (error: unknown) => {
    if (error instanceof Error && error.message === "owner-mismatch") {
      return { reason: "owner-mismatch", error };
    }
    if (error instanceof Error && error.message === "refresh-expired") {
      return { reason: "refresh-expired", error };
    }
    return { reason: "unknown-transient", error };
  },
  ensureFreshWorkspaceSession: ensureFreshWorkspaceSessionMock,
  fetchWorkspaceServerSettingsForOrganization: fetchWorkspaceServerSettingsForOrganizationMock,
}));

function createSession(): WorkspaceAuthSession {
  return {
    accountId: "org-a:project-a:user-a",
    instanceId: "instance-a",
    organizationId: "org-a",
    organizationOrigin: "https://workspace.example.com",
    projectId: "project-a",
    userUuid: "user-a",
    login: "user@example.com",
    accessToken: "access-token",
    refreshToken: "refresh-token",
    runtimeGeneration: 7,
    profile: {
      uuid: "user-a",
      username: "user",
      firstName: "User",
      lastName: null,
      email: "user@example.com",
    },
  };
}

function setWorkspaceSession(session = createSession()): void {
  useWorkspaceAuthStore.setState({
    sessions: [session],
    currentAccountId: session.accountId,
    runtimeGeneration: session.runtimeGeneration,
  });
}

function seedWindow(conversationId: MessengerConversationId): void {
  const store = useWorkspaceMessageStore.getState();
  store.replaceConversationWindow({
    conversationId,
    expectedRevision: store.conversationWindowsById[conversationId]?.revision ?? null,
    capturedMutationRevision: store.messageMutationRevision,
    mode: "tail",
    anchorMessageUuid: null,
    messages: [],
    markers: { beforePageMarker: "stale-before", afterPageMarker: "stale-after" },
  });
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe("useLayoutWorkspaceMessengerBootstrap", () => {
  beforeEach(() => {
    localStorage.removeItem(WORKSPACE_AUTH_STORAGE_KEY);
    localStorage.removeItem(WORKSPACE_AUTH_CURRENT_ACCOUNT_KEY);
    bootstrapSnapshotMock.mockReset();
    fetchUnreadMentionsMock.mockReset();
    fetchUnreadMentionsMock.mockResolvedValue([]);
    getEpochMock.mockReset();
    getEpochMock.mockResolvedValue(epoch(10));
    ensureFreshWorkspaceSessionMock.mockClear();
    ensureFreshWorkspaceSessionMock.mockResolvedValue(undefined);
    fetchWorkspaceServerSettingsForOrganizationMock.mockClear();
    fetchWorkspaceServerSettingsForOrganizationMock.mockResolvedValue({
      meet_url: "https://meet.workspace.example.com",
    });
    act(() => {
      useMessengerStore.getState().clear();
      useActivityStore.getState().clear();
      useWorkspaceMessageStore.getState().clear();
      useWorkspaceMessageStore.getState().setOwner(null, false);
      useWorkspaceJitsiSettingsStore.getState().clear();
      useWorkspaceAuthStore.setState({
        sessions: [],
        currentAccountId: null,
        runtimeGeneration: 0,
      });
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    act(() => {
      useMessengerStore.getState().clear();
      useActivityStore.getState().clear();
      useWorkspaceMessageStore.getState().clear();
      useWorkspaceMessageStore.getState().setOwner(null, false);
      useWorkspaceJitsiSettingsStore.getState().clear();
      useWorkspaceAuthStore.setState({
        sessions: [],
        currentAccountId: null,
        runtimeGeneration: 0,
      });
    });
    localStorage.removeItem(WORKSPACE_AUTH_STORAGE_KEY);
    localStorage.removeItem(WORKSPACE_AUTH_CURRENT_ACCOUNT_KEY);
  });

  it("runs both hooks through epoch, bootstrap, catch-up and websocket with the real transport", async () => {
    const session = createSession();
    setWorkspaceSession(session);
    const values = new Map<string, string>();
    const cursorStorage = createWorkspaceRealtimeCursorStorage({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
      removeItem: (key) => {
        values.delete(key);
      },
    });
    const storedCursor = { epochGeneration: "generation-a", epochVersion: 3 };
    cursorStorage.write(session, storedCursor);
    const order: string[] = [];
    const bootstrapRequest = deferred<unknown>();
    getEpochMock.mockImplementationOnce(() => {
      order.push("epoch");
      return Promise.resolve(epoch(100));
    });
    bootstrapSnapshotMock.mockImplementationOnce(() => {
      order.push("bootstrap");
      return bootstrapRequest.promise;
    });
    const getEventsPage = vi.fn(() => {
      order.push("events");
      return Promise.resolve({ items: [], nextPageMarker: null, pageLimit: 100 });
    });
    const socketUrls: string[] = [];
    const runtimeFactory: LayoutWorkspaceRealtimeRuntimeFactory = (options) =>
      createWorkspaceRealtimeTransportCore({
        clientOptions: { accessToken: session.accessToken, projectId: session.projectId },
        cursorStorage: options.cursorStorage,
        applier: options.applier,
        isOwnerCurrent: options.isOwnerCurrent,
        getEventsPage,
        webSocketFactory: (url) => {
          order.push("socket");
          socketUrls.push(url);
          return {
            onopen: null,
            onmessage: null,
            onerror: null,
            onclose: null,
            send: () => undefined,
            close: () => undefined,
          };
        },
      });
    const cursorStorageFactory = () => cursorStorage;
    const applier = createWorkspaceRealtimeNoopApplier();
    const presenceReporterFactory = () => () => undefined;
    const { unmount } = renderHook(() => {
      const bootstrapBoundary = useLayoutWorkspaceMessengerBootstrap({ enabled: true });
      useLayoutWorkspaceRealtime({
        enabled: true,
        pathname: "/org/org-a/project/project-a/messenger",
        bootstrapBoundary,
        runtimeFactory,
        cursorStorageFactory,
        applier,
        presenceReporterFactory,
      });
    });
    await waitFor(() => expect(order).toEqual(["epoch", "bootstrap"]));
    expect(cursorStorage.read(session)).toEqual(storedCursor);
    expect(socketUrls).toEqual([]);
    await act(async () => {
      bootstrapRequest.resolve({ status: "applied", ownerKey: workspaceRuntimeOwnerKey(session) });
      await bootstrapRequest.promise;
    });
    await waitFor(() => expect(order).toEqual(["epoch", "bootstrap", "events", "socket"]));
    expect(getEventsPage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ afterEpochVersion: 100, epochGeneration: "generation-a" }),
    );
    expect(socketUrls[0]).toContain("last_epoch_version=100");
    expect(cursorStorage.read(session)).toEqual({
      epochGeneration: "generation-a",
      epochVersion: 100,
    });
    unmount();
  });

  it("captures epoch before the server snapshot and exposes its boundary only after success", async () => {
    const session = createSession();
    const ownerKey = workspaceRuntimeOwnerKey(session);
    setWorkspaceSession(session);
    const epochRequest = deferred<WorkspaceMessengerEpochDto>();
    const bootstrapRequest = deferred<unknown>();
    getEpochMock.mockReturnValueOnce(epochRequest.promise);
    bootstrapSnapshotMock.mockReturnValueOnce(bootstrapRequest.promise);
    const { result } = renderHook(() => useLayoutWorkspaceMessengerBootstrap({ enabled: true }));

    await waitFor(() => expect(getEpochMock).toHaveBeenCalledOnce());
    expect(bootstrapSnapshotMock).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
    await act(async () => {
      epochRequest.resolve(epoch(100));
      await epochRequest.promise;
    });
    await waitFor(() => expect(bootstrapSnapshotMock).toHaveBeenCalledOnce());
    expect(result.current).toBeNull();
    expect(bootstrapSnapshotMock).toHaveBeenCalledWith(
      expect.objectContaining({ requireCompleteSnapshot: true }),
    );
    await act(async () => {
      bootstrapRequest.resolve({ status: "applied", ownerKey });
      await bootstrapRequest.promise;
    });
    expect(result.current?.cursor).toEqual({ epochGeneration: "generation-a", epochVersion: 100 });
    expect(result.current?.runtimeContext.projectId).toBe(session.projectId);
  });

  it.each(["ready", "pending"] as const)(
    "refreshes a %s early mentions snapshot and merges concurrent events",
    async (earlyStatus) => {
      const session = createSession();
      const ownerKey = workspaceRuntimeOwnerKey(session);
      setWorkspaceSession(session);
      const epochRequest = deferred<WorkspaceMessengerEpochDto>();
      const earlyMentions = deferred<ActivityUnreadMention[]>();
      const refreshedMentions = deferred<ActivityUnreadMention[]>();
      getEpochMock.mockReturnValueOnce(epochRequest.promise);
      bootstrapSnapshotMock.mockResolvedValue({ status: "applied", ownerKey });
      fetchUnreadMentionsMock
        .mockReturnValueOnce(earlyMentions.promise)
        .mockReturnValueOnce(refreshedMentions.promise);
      const { result } = renderHook(() => {
        useLayoutUnreadMentionsBootstrap(session);
        return useLayoutWorkspaceMessengerBootstrap({ enabled: true });
      });
      await waitFor(() => expect(fetchUnreadMentionsMock).toHaveBeenCalledOnce());
      if (earlyStatus === "ready") {
        await act(async () => {
          earlyMentions.resolve([]);
          await earlyMentions.promise;
        });
        expect(useActivityStore.getState().unreadMentionsCount).toBe(0);
      }
      expect(result.current).toBeNull();

      // This mention appeared after the early snapshot but before the captured epoch.
      const missedMention: ActivityUnreadMention = {
        uuid: "message-before-epoch",
        streamUuid: "stream-a",
        topicUuid: "topic-a",
        createdAt: "2026-09-25T10:00:00Z",
      };
      await act(async () => {
        epochRequest.resolve(epoch(100));
        await epochRequest.promise;
      });
      await waitFor(() => expect(fetchUnreadMentionsMock).toHaveBeenCalledTimes(2));
      expect(result.current?.cursor.epochVersion).toBe(100);
      expect(useActivityStore.getState().unreadMentionsStatus).toBe("loading");
      if (earlyStatus === "pending") {
        await act(async () => {
          earlyMentions.resolve([]);
          await earlyMentions.promise;
        });
        expect(useActivityStore.getState().unreadMentionsStatus).toBe("loading");
      }

      await act(async () => {
        useActivityStore
          .getState()
          .applyUnreadMentionMutation(ownerKey, session.runtimeGeneration, {
            kind: "upsert",
            epochVersion: 101,
            mention: { ...missedMention, uuid: "message-after-epoch" },
          });
        refreshedMentions.resolve([missedMention]);
        await refreshedMentions.promise;
      });
      expect(useActivityStore.getState().unreadMentionsStatus).toBe("ready");
      expect(useActivityStore.getState().unreadMentionsCount).toBe(2);
      expect(Object.keys(useActivityStore.getState().unreadMentionsByUuid)).toEqual(
        expect.arrayContaining(["message-after-epoch", "message-before-epoch"]),
      );
    },
  );

  it("does not expose a boundary after a failed snapshot", async () => {
    setWorkspaceSession();
    bootstrapSnapshotMock.mockResolvedValue({
      status: "failed",
      ownerKey: workspaceRuntimeOwnerKey(createSession()),
      error: "Folders unavailable",
    });
    const { result } = renderHook(() => useLayoutWorkspaceMessengerBootstrap({ enabled: true }));
    await waitFor(() => expect(bootstrapSnapshotMock).toHaveBeenCalledOnce());
    expect(result.current).toBeNull();
  });

  it("retries a failed epoch request before loading the server snapshot", async () => {
    vi.useFakeTimers();
    try {
      const session = createSession();
      setWorkspaceSession(session);
      getEpochMock
        .mockRejectedValueOnce(new Error("Epoch unavailable"))
        .mockResolvedValue(epoch(20));
      bootstrapSnapshotMock.mockResolvedValue({
        status: "applied",
        ownerKey: workspaceRuntimeOwnerKey(session),
      });
      const { result } = renderHook(() => useLayoutWorkspaceMessengerBootstrap({ enabled: true }));
      await act(async () => {
        await Promise.resolve();
      });
      expect(bootstrapSnapshotMock).not.toHaveBeenCalled();
      expect(result.current).toBeNull();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });
      expect(result.current?.cursor.epochVersion).toBe(20);
      expect(bootstrapSnapshotMock).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("discards a previous owner's late epoch response", async () => {
    const session = createSession();
    setWorkspaceSession(session);
    const previousEpoch = deferred<WorkspaceMessengerEpochDto>();
    getEpochMock.mockReturnValueOnce(previousEpoch.promise).mockResolvedValue(epoch(20));
    const { result } = renderHook(() => useLayoutWorkspaceMessengerBootstrap({ enabled: true }));
    await waitFor(() => expect(getEpochMock).toHaveBeenCalledOnce());

    const nextSession = {
      ...session,
      accountId: "other-account",
      projectId: "other-project",
      runtimeGeneration: 8,
    };
    bootstrapSnapshotMock.mockResolvedValue({
      status: "applied",
      ownerKey: workspaceRuntimeOwnerKey(nextSession),
    });
    act(() => setWorkspaceSession(nextSession));
    await waitFor(() => expect(result.current?.cursor.epochVersion).toBe(20));
    await act(async () => {
      previousEpoch.resolve(epoch(10));
      await previousEpoch.promise;
    });
    expect(bootstrapSnapshotMock).toHaveBeenCalledOnce();
    expect(result.current?.runtimeContext.projectId).toBe("other-project");
  });

  it("invalidates a completed boundary on manual retry before the next epoch resolves", async () => {
    const session = createSession();
    setWorkspaceSession(session);
    bootstrapSnapshotMock.mockResolvedValue({
      status: "applied",
      ownerKey: workspaceRuntimeOwnerKey(session),
    });
    const { result, rerender } = renderHook(
      ({ retryNonce }) => useLayoutWorkspaceMessengerBootstrap({ enabled: true, retryNonce }),
      { initialProps: { retryNonce: 0 } },
    );
    await waitFor(() => expect(result.current?.cursor.epochVersion).toBe(10));
    const previous = result.current;
    const nextEpoch = deferred<WorkspaceMessengerEpochDto>();
    getEpochMock.mockReturnValueOnce(nextEpoch.promise);
    rerender({ retryNonce: 1 });
    expect(result.current).toBeNull();
    expect(previous?.signal.aborted).toBe(true);
    await act(async () => {
      nextEpoch.resolve(epoch(20));
      await nextEpoch.promise;
    });
    await waitFor(() => expect(result.current?.cursor.epochVersion).toBe(20));
  });

  it("does not start Workspace messenger bootstrap while disabled", async () => {
    setWorkspaceSession();
    useMessengerStore.getState().startBootstrap("stale-owner");

    renderHook(() => useLayoutWorkspaceMessengerBootstrap({ enabled: false }));

    await waitFor(() => {
      expect(useMessengerStore.getState().ownerKey).toBeNull();
    });
    expect(bootstrapSnapshotMock).not.toHaveBeenCalled();
    expect(ensureFreshWorkspaceSessionMock).not.toHaveBeenCalled();
  });

  it("starts Workspace messenger bootstrap when enabled", async () => {
    const session = createSession();
    setWorkspaceSession(session);

    renderHook(() => useLayoutWorkspaceMessengerBootstrap({ enabled: true }));

    await waitFor(() => {
      expect(bootstrapSnapshotMock).toHaveBeenCalledTimes(1);
    });
    expect(bootstrapSnapshotMock).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeContext: expect.objectContaining({
          accountId: session.accountId,
          instanceId: session.instanceId,
          organizationId: session.organizationId,
          organizationOrigin: session.organizationOrigin,
          projectId: session.projectId,
          userUuid: session.userUuid,
          runtimeGeneration: session.runtimeGeneration,
        }),
      }),
    );
    expect(ensureFreshWorkspaceSessionMock).toHaveBeenCalledWith(
      session.accountId,
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("preserves a preloaded warm window on first mount for the canonical owner", async () => {
    const session = createSession();
    const ownerKey = workspaceRuntimeOwnerKey(session);
    const conversationId = "stream:75309057-419c-4b12-a7c1-3932429ec4a6" as const;
    setWorkspaceSession(session);
    useMessengerStore.getState().startBootstrap(ownerKey);
    seedWindow(conversationId);

    renderHook(() => useLayoutWorkspaceMessengerBootstrap({ enabled: true }));

    await waitFor(() => expect(bootstrapSnapshotMock).toHaveBeenCalledTimes(1));
    expect(
      useWorkspaceMessageStore.getState().conversationWindowsById[conversationId],
    ).toBeDefined();
  });

  it("clears the visible message window when the runtime owner changes", async () => {
    const firstSession = createSession();
    setWorkspaceSession(firstSession);
    const { rerender } = renderHook(() => useLayoutWorkspaceMessengerBootstrap({ enabled: true }));
    await waitFor(() => expect(bootstrapSnapshotMock).toHaveBeenCalledTimes(1));

    const conversationId = "stream:75309057-419c-4b12-a7c1-3932429ec4a6" as const;
    seedWindow(conversationId);

    const secondSession: WorkspaceAuthSession = {
      ...firstSession,
      accountId: "org-b:project-b:user-b",
      organizationId: "org-b",
      projectId: "project-b",
      userUuid: "user-b",
      runtimeGeneration: 8,
    };
    act(() => setWorkspaceSession(secondSession));
    rerender();

    await waitFor(() => {
      expect(
        useWorkspaceMessageStore.getState().conversationWindowsById[conversationId],
      ).toBeUndefined();
    });
  });

  it("keeps the visible cache-first window when only runtime generation changes", async () => {
    const session = createSession();
    setWorkspaceSession(session);
    const { rerender } = renderHook(() => useLayoutWorkspaceMessengerBootstrap({ enabled: true }));
    await waitFor(() => expect(bootstrapSnapshotMock).toHaveBeenCalledTimes(1));

    const conversationId = "stream:75309057-419c-4b12-a7c1-3932429ec4a6" as const;
    seedWindow(conversationId);
    act(() => setWorkspaceSession({ ...session, runtimeGeneration: 8 }));
    rerender();

    await waitFor(() => expect(bootstrapSnapshotMock).toHaveBeenCalledTimes(2));
    expect(
      useWorkspaceMessageStore.getState().conversationWindowsById[conversationId],
    ).toBeDefined();
  });

  it("stores Workspace Jitsi meet_url from server settings", async () => {
    const session = createSession();
    setWorkspaceSession(session);

    renderHook(() => useLayoutWorkspaceMessengerBootstrap({ enabled: true }));

    await waitFor(() => {
      expect(
        useWorkspaceJitsiSettingsStore
          .getState()
          .getWorkspaceMeetUrl(workspaceRuntimeOwnerKey(session)),
      ).toBe("https://meet.workspace.example.com");
    });
    expect(fetchWorkspaceServerSettingsForOrganizationMock).toHaveBeenCalledWith(
      session.organizationOrigin,
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("retries Workspace messenger bootstrap after a transient refresh failure", async () => {
    vi.useFakeTimers();
    try {
      const session = createSession();
      setWorkspaceSession(session);
      ensureFreshWorkspaceSessionMock
        .mockRejectedValueOnce(new TypeError("Failed to fetch"))
        .mockResolvedValueOnce(undefined);

      renderHook(() => useLayoutWorkspaceMessengerBootstrap({ enabled: true }));

      await act(async () => {
        await Promise.resolve();
      });
      expect(ensureFreshWorkspaceSessionMock).toHaveBeenCalledTimes(1);
      expect(bootstrapSnapshotMock).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });

      expect(bootstrapSnapshotMock).toHaveBeenCalledTimes(1);
      expect(ensureFreshWorkspaceSessionMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not retry Workspace messenger bootstrap after terminal refresh failure", async () => {
    vi.useFakeTimers();
    try {
      const session = createSession();
      setWorkspaceSession(session);
      ensureFreshWorkspaceSessionMock.mockRejectedValueOnce(new Error("owner-mismatch"));

      renderHook(() => useLayoutWorkspaceMessengerBootstrap({ enabled: true }));

      await act(async () => {
        await Promise.resolve();
      });
      expect(ensureFreshWorkspaceSessionMock).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });

      expect(ensureFreshWorkspaceSessionMock).toHaveBeenCalledTimes(1);
      expect(bootstrapSnapshotMock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("retries refresh-expired failures while the Workspace session is still present", async () => {
    vi.useFakeTimers();
    try {
      const session = createSession();
      setWorkspaceSession(session);
      ensureFreshWorkspaceSessionMock
        .mockRejectedValueOnce(new Error("refresh-expired"))
        .mockResolvedValueOnce(undefined);

      renderHook(() => useLayoutWorkspaceMessengerBootstrap({ enabled: true }));

      await act(async () => {
        await Promise.resolve();
      });
      expect(ensureFreshWorkspaceSessionMock).toHaveBeenCalledTimes(1);
      expect(bootstrapSnapshotMock).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });

      expect(ensureFreshWorkspaceSessionMock).toHaveBeenCalledTimes(2);
      expect(bootstrapSnapshotMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("soft-retries failed Workspace messenger catalog bootstrap", async () => {
    vi.useFakeTimers();
    try {
      const session = createSession();
      const ownerKey = workspaceRuntimeOwnerKey(session);
      setWorkspaceSession(session);
      bootstrapSnapshotMock
        .mockResolvedValueOnce({
          status: "failed",
          ownerKey,
          error: "Messenger API GET /streams/ failed",
        })
        .mockResolvedValueOnce({ status: "applied", ownerKey });

      renderHook(() => useLayoutWorkspaceMessengerBootstrap({ enabled: true }));

      await act(async () => {
        await Promise.resolve();
      });
      expect(bootstrapSnapshotMock).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });

      expect(ensureFreshWorkspaceSessionMock).toHaveBeenCalledTimes(2);
      expect(bootstrapSnapshotMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
