import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type { MessengerConversationId } from "~/entities/messenger/messenger.types";
import type { WorkspaceAuthSession } from "~/entities/workspace-auth/workspace-auth.model";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import { useWorkspaceJitsiSettingsStore } from "~/features/jitsi-call/jitsi-call-settings.model";
import { useLayoutWorkspaceMessengerBootstrap } from "./layout-workspace-messenger-bootstrap.hook";

const bootstrapMessengerStoreMock = vi.hoisted(() =>
  vi.fn((): Promise<unknown> => Promise.resolve()),
);
const ensureFreshWorkspaceSessionMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
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
  bootstrapMessengerStore: bootstrapMessengerStoreMock,
}));

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

describe("useLayoutWorkspaceMessengerBootstrap", () => {
  beforeEach(() => {
    localStorage.removeItem(WORKSPACE_AUTH_STORAGE_KEY);
    localStorage.removeItem(WORKSPACE_AUTH_CURRENT_ACCOUNT_KEY);
    bootstrapMessengerStoreMock.mockClear();
    ensureFreshWorkspaceSessionMock.mockClear();
    ensureFreshWorkspaceSessionMock.mockResolvedValue(undefined);
    fetchWorkspaceServerSettingsForOrganizationMock.mockClear();
    fetchWorkspaceServerSettingsForOrganizationMock.mockResolvedValue({
      meet_url: "https://meet.workspace.example.com",
    });
    act(() => {
      useMessengerStore.getState().clear();
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

  it("does not start Workspace messenger bootstrap while disabled", async () => {
    setWorkspaceSession();
    useMessengerStore.getState().startBootstrap("stale-owner");

    renderHook(() => useLayoutWorkspaceMessengerBootstrap({ enabled: false }));

    await waitFor(() => {
      expect(useMessengerStore.getState().ownerKey).toBeNull();
    });
    expect(bootstrapMessengerStoreMock).not.toHaveBeenCalled();
    expect(ensureFreshWorkspaceSessionMock).not.toHaveBeenCalled();
  });

  it("starts Workspace messenger bootstrap when enabled", async () => {
    const session = createSession();
    setWorkspaceSession(session);

    renderHook(() => useLayoutWorkspaceMessengerBootstrap({ enabled: true }));

    await waitFor(() => {
      expect(bootstrapMessengerStoreMock).toHaveBeenCalledTimes(1);
    });
    expect(bootstrapMessengerStoreMock).toHaveBeenCalledWith(
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

    await waitFor(() => expect(bootstrapMessengerStoreMock).toHaveBeenCalledTimes(1));
    expect(
      useWorkspaceMessageStore.getState().conversationWindowsById[conversationId],
    ).toBeDefined();
  });

  it("clears the visible message window when the runtime owner changes", async () => {
    const firstSession = createSession();
    setWorkspaceSession(firstSession);
    const { rerender } = renderHook(() => useLayoutWorkspaceMessengerBootstrap({ enabled: true }));
    await waitFor(() => expect(bootstrapMessengerStoreMock).toHaveBeenCalledTimes(1));

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
    await waitFor(() => expect(bootstrapMessengerStoreMock).toHaveBeenCalledTimes(1));

    const conversationId = "stream:75309057-419c-4b12-a7c1-3932429ec4a6" as const;
    seedWindow(conversationId);
    act(() => setWorkspaceSession({ ...session, runtimeGeneration: 8 }));
    rerender();

    await waitFor(() => expect(bootstrapMessengerStoreMock).toHaveBeenCalledTimes(2));
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
      expect(bootstrapMessengerStoreMock).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });

      expect(bootstrapMessengerStoreMock).toHaveBeenCalledTimes(1);
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
      expect(bootstrapMessengerStoreMock).not.toHaveBeenCalled();
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
      expect(bootstrapMessengerStoreMock).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });

      expect(ensureFreshWorkspaceSessionMock).toHaveBeenCalledTimes(2);
      expect(bootstrapMessengerStoreMock).toHaveBeenCalledTimes(1);
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
      bootstrapMessengerStoreMock
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
      expect(bootstrapMessengerStoreMock).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });

      expect(ensureFreshWorkspaceSessionMock).toHaveBeenCalledTimes(2);
      expect(bootstrapMessengerStoreMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
