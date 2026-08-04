import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useExternalChatsStore } from "~/entities/external-chat/external-chat.model";
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import { useMessengerBackgroundProjectionStore } from "~/entities/messenger/messenger-background-projection.model";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import { useUsersStore } from "~/entities/user/user.model";
import type { WorkspaceAuthSession } from "~/entities/workspace-auth/workspace-auth.model";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import { useWorkspaceJitsiSettingsStore } from "~/features/jitsi-call/jitsi-call-settings.model";
import { useJitsiCallStore } from "~/features/jitsi-call/jitsi-call.model";
import type * as WorkspaceExternalAccountCacheDb from "~/shared/lib/workspace-external-account-cache-db";
import { createWorkspaceRealtimeCursorStorage } from "~/shared/lib/workspace-realtime/workspace-realtime-cursor.lib";
import type { WorkspaceRealtimeCursorStorageLike } from "~/shared/lib/workspace-realtime/workspace-realtime-cursor.lib";
import { createWorkspaceRealtimeNoopApplier } from "~/shared/lib/workspace-realtime/workspace-realtime-runtime.lib";
import type {
  WorkspaceRealtimeRuntimeContext,
  WorkspaceRealtimeRuntimeOptions,
  WorkspaceRealtimeTransportCore,
} from "~/shared/lib/workspace-realtime/workspace-realtime-runtime.lib";
import {
  isLayoutWorkspaceRealtimeOwnerCurrent,
  useLayoutWorkspaceRealtime,
} from "./layout-workspace-realtime.hook";
import type { LayoutWorkspaceRealtimeRuntimeFactory } from "./layout-workspace-realtime.hook";

const ensureFreshWorkspaceSessionMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const bootstrapMessengerStoreMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const deleteExternalAccountOwnerCacheMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const loadExternalAccountsMock = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ status: "applied" as const, ownerKey: "owner-a" })),
);
const workspaceRealtimeRuntimeOptions = vi.hoisted(() => [] as unknown[]);
const createWorkspaceRealtimeTransportCoreMock = vi.hoisted(() =>
  vi.fn((options: unknown): WorkspaceRealtimeTransportCore => {
    workspaceRealtimeRuntimeOptions.push(options);
    return {
      start: vi.fn(() => Promise.resolve()),
      stop: vi.fn(() => Promise.resolve()),
      catchUp: vi.fn(() => Promise.resolve()),
      connect: vi.fn(() => Promise.resolve()),
      disconnect: vi.fn(() => Promise.resolve()),
      nudge: vi.fn(() => Promise.resolve()),
      reconnect: vi.fn(() => Promise.resolve()),
    };
  }),
);
const startWorkspacePresenceReporterMock = vi.hoisted(() => vi.fn(() => () => undefined));
const WORKSPACE_AUTH_STORAGE_KEY = "workspace-auth-sessions";
const WORKSPACE_AUTH_CURRENT_ACCOUNT_KEY = "workspace-auth-current-account";
const PROJECT_UUID = "22222222-2222-4222-8222-222222222222";
const USER_UUID = "11111111-1111-4111-8111-111111111111";
const CALLER_UUID = "99999999-9999-4999-8999-999999999999";
const STREAM_UUID = "75309057-419c-4b12-a7c1-3932429ec4a6";
const TOPIC_UUID = "4ec0b996-b778-45f8-8ef4-ef863be0c047";
const MESSAGE_UUID = "a93dca35-3061-4748-bda4-7f6f8c660ea5";
const BACKFILL_MESSAGE_UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EXTERNAL_ACCOUNT_UUID = "88888888-8888-4888-8888-888888888888";
const EXTERNAL_CHAT_UUID = "77777777-7777-4777-8777-777777777777";
const DATE = "2026-06-22T10:10:00Z";

vi.mock("~/entities/workspace-auth/workspace-auth.lib", () => ({
  ensureFreshWorkspaceSession: ensureFreshWorkspaceSessionMock,
}));

vi.mock("~/entities/messenger/messenger-bootstrap.lib", () => ({
  bootstrapMessengerStore: bootstrapMessengerStoreMock,
}));

vi.mock("~/entities/external-account/external-account-loader.lib", () => ({
  loadExternalAccounts: loadExternalAccountsMock,
}));

vi.mock("~/shared/lib/workspace-external-account-cache-db", async (importOriginal) => {
  const actual = await importOriginal<typeof WorkspaceExternalAccountCacheDb>();
  return {
    ...actual,
    deleteWorkspaceExternalAccountOwnerCache: deleteExternalAccountOwnerCacheMock,
  };
});

vi.mock("~/entities/user/user-workspace-presence-reporter.lib", () => ({
  startWorkspacePresenceReporter: startWorkspacePresenceReporterMock,
}));

vi.mock(
  "~/shared/lib/workspace-realtime/workspace-realtime-runtime.lib",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/shared/lib/workspace-realtime/workspace-realtime-runtime.lib")
      >();
    return {
      ...actual,
      createWorkspaceRealtimeTransportCore: createWorkspaceRealtimeTransportCoreMock,
    };
  },
);

class MemoryStorage implements WorkspaceRealtimeCursorStorageLike {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function createSession(overrides: Partial<WorkspaceAuthSession> = {}): WorkspaceAuthSession {
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
    ...overrides,
  };
}

function setWorkspaceSession(session = createSession()): void {
  useWorkspaceAuthStore.setState({
    sessions: [session],
    currentAccountId: session.accountId,
    runtimeGeneration: session.runtimeGeneration,
  });
}

function createRuntimeFactory() {
  const startedContexts: WorkspaceRealtimeRuntimeContext[] = [];
  const runtimes: WorkspaceRealtimeTransportCore[] = [];
  const factoryOptions: Parameters<LayoutWorkspaceRealtimeRuntimeFactory>[0][] = [];
  const runtimeFactory: LayoutWorkspaceRealtimeRuntimeFactory = (options) => {
    factoryOptions.push(options);
    const runtime: WorkspaceRealtimeTransportCore = {
      start: vi.fn((context: WorkspaceRealtimeRuntimeContext) => {
        startedContexts.push(context);
        return Promise.resolve();
      }),
      stop: vi.fn(() => Promise.resolve()),
      catchUp: vi.fn(() => Promise.resolve()),
      connect: vi.fn(() => Promise.resolve()),
      disconnect: vi.fn(() => Promise.resolve()),
      nudge: vi.fn(() => Promise.resolve()),
      reconnect: vi.fn(() => Promise.resolve()),
    };
    runtimes.push(runtime);
    return runtime;
  };

  return { runtimeFactory, runtimes, startedContexts, factoryOptions };
}

function noopPresenceReporterFactory(): () => void {
  return () => undefined;
}

describe("useLayoutWorkspaceRealtime", () => {
  beforeEach(() => {
    localStorage.removeItem(WORKSPACE_AUTH_STORAGE_KEY);
    localStorage.removeItem(WORKSPACE_AUTH_CURRENT_ACCOUNT_KEY);
    ensureFreshWorkspaceSessionMock.mockClear();
    bootstrapMessengerStoreMock.mockClear();
    deleteExternalAccountOwnerCacheMock.mockClear();
    loadExternalAccountsMock.mockClear();
    createWorkspaceRealtimeTransportCoreMock.mockClear();
    workspaceRealtimeRuntimeOptions.length = 0;
    startWorkspacePresenceReporterMock.mockClear();
    useWorkspaceAuthStore.setState({ sessions: [], currentAccountId: null, runtimeGeneration: 0 });
    useMessengerStore.getState().clear();
    useExternalChatsStore.getState().clear();
    useWorkspaceMessageStore.getState().clear();
    useMessengerBackgroundProjectionStore.getState().clear();
    useUsersStore.getState().clear();
    useWorkspaceJitsiSettingsStore.getState().clear();
    useJitsiCallStore.getState().clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
    ensureFreshWorkspaceSessionMock.mockClear();
    workspaceRealtimeRuntimeOptions.length = 0;
    useWorkspaceAuthStore.setState({ sessions: [], currentAccountId: null, runtimeGeneration: 0 });
    useMessengerStore.getState().clear();
    useExternalChatsStore.getState().clear();
    useWorkspaceMessageStore.getState().clear();
    useMessengerBackgroundProjectionStore.getState().clear();
    useUsersStore.getState().clear();
    useWorkspaceJitsiSettingsStore.getState().clear();
    useJitsiCallStore.getState().clear();
    localStorage.removeItem(WORKSPACE_AUTH_STORAGE_KEY);
    localStorage.removeItem(WORKSPACE_AUTH_CURRENT_ACCOUNT_KEY);
  });

  it("starts active realtime runtime for current Workspace project route", async () => {
    const session = createSession();
    setWorkspaceSession(session);
    const { runtimeFactory, runtimes, startedContexts } = createRuntimeFactory();
    const cursorStorage = createWorkspaceRealtimeCursorStorage(new MemoryStorage());

    renderHook(() =>
      useLayoutWorkspaceRealtime({
        enabled: true,
        pathname: "/org/org-a/project/project-a/messenger",
        runtimeFactory,
        cursorStorageFactory: () => cursorStorage,
        presenceReporterFactory: noopPresenceReporterFactory,
        applier: createWorkspaceRealtimeNoopApplier(),
      }),
    );

    await waitFor(() => {
      expect(runtimes[0]?.start).toHaveBeenCalledTimes(1);
    });
    expect(startedContexts[0]).toMatchObject({
      owner: {
        accountId: session.accountId,
        instanceId: session.instanceId,
        organizationId: session.organizationId,
        projectId: session.projectId,
        userUuid: session.userUuid,
        runtimeGeneration: session.runtimeGeneration,
      },
      surface: "active",
    });
  });

  it("uses the common Workspace API base for default realtime and presence in production", async () => {
    const originalDev = import.meta.env.DEV;
    (import.meta.env as Record<string, unknown>).DEV = false;

    try {
      const session = createSession();
      setWorkspaceSession(session);
      const cursorStorage = createWorkspaceRealtimeCursorStorage(new MemoryStorage());

      renderHook(() =>
        useLayoutWorkspaceRealtime({
          enabled: true,
          pathname: "/org/org-a/project/project-a/messenger",
          cursorStorageFactory: () => cursorStorage,
          applier: createWorkspaceRealtimeNoopApplier(),
        }),
      );

      await waitFor(() => {
        expect(createWorkspaceRealtimeTransportCoreMock).toHaveBeenCalledTimes(1);
        expect(startWorkspacePresenceReporterMock).toHaveBeenCalledTimes(1);
      });

      const runtimeOptions = workspaceRealtimeRuntimeOptions[0] as WorkspaceRealtimeRuntimeOptions;
      const expectedBaseUrl = "https://workspace.example.com/api/workspace/v1";
      expect(runtimeOptions.clientOptions.baseUrl).toBe(expectedBaseUrl);
      expect(startWorkspacePresenceReporterMock).toHaveBeenCalledWith(
        expect.objectContaining({
          clientOptions: expect.objectContaining({ baseUrl: expectedBaseUrl }),
        }),
      );
    } finally {
      (import.meta.env as Record<string, unknown>).DEV = originalDev;
    }
  });

  it("reloads the authoritative external account snapshot during cursor recovery", async () => {
    const session = createSession();
    setWorkspaceSession(session);
    const cursorStorage = createWorkspaceRealtimeCursorStorage(new MemoryStorage());

    renderHook(() =>
      useLayoutWorkspaceRealtime({
        enabled: true,
        pathname: "/org/org-a/project/project-a/messenger",
        cursorStorageFactory: () => cursorStorage,
        presenceReporterFactory: noopPresenceReporterFactory,
      }),
    );

    await waitFor(() => {
      expect(workspaceRealtimeRuntimeOptions).toHaveLength(1);
    });
    const runtimeOptions = workspaceRealtimeRuntimeOptions[0] as WorkspaceRealtimeRuntimeOptions;
    const resetAuthoritativeSnapshots = runtimeOptions.resetAuthoritativeSnapshots;
    expect(resetAuthoritativeSnapshots).toBeTypeOf("function");
    useExternalChatsStore.getState().start("stale-external-chat-scope", EXTERNAL_ACCOUNT_UUID);

    await resetAuthoritativeSnapshots?.(
      {
        owner: {
          accountId: session.accountId,
          instanceId: session.instanceId,
          organizationId: session.organizationId,
          projectId: session.projectId,
          userUuid: session.userUuid,
          runtimeGeneration: session.runtimeGeneration,
        },
        ownerKey:
          "account:org-a%3Aproject-a%3Auser-a:instance:instance-a:organization:org-a:project:project-a:user:user-a",
        surface: "active",
      },
      {
        type: "EventsCursorExpiredError",
        code: 410,
        error: "epoch_pruned",
        message: "expired",
        reason: "epoch_generation_changed",
        epoch_generation: "generation-b",
        current_epoch_version: 10,
        minimum_epoch_version: 10,
      },
    );

    expect(deleteExternalAccountOwnerCacheMock).toHaveBeenCalledOnce();
    expect(useExternalChatsStore.getState().scopeKey).toBeNull();
    expect(loadExternalAccountsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeContext: expect.objectContaining({ projectId: "project-a" }),
      }),
    );
  });

  it("routes external chat events through the default active applier", async () => {
    const session = createSession();
    setWorkspaceSession(session);
    const cursorStorage = createWorkspaceRealtimeCursorStorage(new MemoryStorage());

    renderHook(() =>
      useLayoutWorkspaceRealtime({
        enabled: true,
        pathname: "/org/org-a/project/project-a/messenger",
        cursorStorageFactory: () => cursorStorage,
        presenceReporterFactory: noopPresenceReporterFactory,
      }),
    );

    await waitFor(() => {
      expect(workspaceRealtimeRuntimeOptions).toHaveLength(1);
    });
    const ownerKey = workspaceRuntimeOwnerKey(session);
    const scopeKey = `${ownerKey}:external-account:${EXTERNAL_ACCOUNT_UUID}`;
    useExternalChatsStore.getState().start(scopeKey, EXTERNAL_ACCOUNT_UUID);
    const runtimeOptions = workspaceRealtimeRuntimeOptions[0] as WorkspaceRealtimeRuntimeOptions;

    runtimeOptions.applier.applyEvent(
      {
        epoch_version: 1,
        type: "external_chat",
        kind: "external_chat.created",
        external_chat: {
          uuid: EXTERNAL_CHAT_UUID,
          external_account_uuid: EXTERNAL_ACCOUNT_UUID,
          source: { kind: "zulip", chat_type: "channel" },
          display_name: "Support",
          selected: true,
          project_id: session.projectId,
          history_depth: "30_days",
          projection_stream_uuid: null,
          status: "syncing",
          capabilities: {},
          safe_error: null,
          transition_pending: false,
          revision: 1,
          created_at: DATE,
          updated_at: DATE,
        },
      },
      {
        owner: {
          accountId: session.accountId,
          instanceId: session.instanceId,
          organizationId: session.organizationId,
          projectId: session.projectId,
          userUuid: session.userUuid,
          runtimeGeneration: session.runtimeGeneration,
        },
        ownerKey,
        surface: "active",
        source: "websocket",
      },
    );

    expect(useExternalChatsStore.getState().chats).toEqual([
      expect.objectContaining({ uuid: EXTERNAL_CHAT_UUID, revision: 1 }),
    ]);
  });

  it("starts and cleans up Workspace presence reporter on active route", async () => {
    const session = createSession();
    setWorkspaceSession(session);
    const { runtimeFactory, runtimes } = createRuntimeFactory();
    const cursorStorage = createWorkspaceRealtimeCursorStorage(new MemoryStorage());
    const cleanupPresence = vi.fn();
    const presenceReporterFactory = vi.fn(() => cleanupPresence);

    const { rerender } = renderHook(
      ({ pathname }) =>
        useLayoutWorkspaceRealtime({
          enabled: true,
          pathname,
          runtimeFactory,
          cursorStorageFactory: () => cursorStorage,
          presenceReporterFactory,
          applier: createWorkspaceRealtimeNoopApplier(),
        }),
      {
        initialProps: { pathname: "/org/org-a/project/project-a/messenger" },
      },
    );

    await waitFor(() => {
      expect(runtimes[0]?.start).toHaveBeenCalledTimes(1);
    });
    expect(presenceReporterFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: session.projectId,
        userUuid: session.userUuid,
      }),
    );

    act(() => {
      rerender({ pathname: "/inbox" });
    });

    expect(cleanupPresence).toHaveBeenCalledTimes(1);
  });

  it("starts inactive auth sessions as background runtimes", async () => {
    const activeSession = createSession();
    const backgroundSession = createSession({
      accountId: "org-b:project-b:user-b",
      instanceId: "instance-b",
      organizationId: "org-b",
      projectId: "project-b",
      userUuid: "user-b",
      login: "user-b@example.com",
      accessToken: "access-token-b",
      refreshToken: "refresh-token-b",
      runtimeGeneration: 3,
      profile: {
        uuid: "user-b",
        username: "user-b",
        firstName: "User",
        lastName: "B",
        email: "user-b@example.com",
      },
    });
    useWorkspaceAuthStore.setState({
      sessions: [activeSession, backgroundSession],
      currentAccountId: activeSession.accountId,
      runtimeGeneration: activeSession.runtimeGeneration,
    });
    const { runtimeFactory, runtimes, startedContexts } = createRuntimeFactory();
    const cursorStorage = createWorkspaceRealtimeCursorStorage(new MemoryStorage());

    renderHook(() =>
      useLayoutWorkspaceRealtime({
        enabled: true,
        pathname: "/org/org-a/project/project-a/messenger",
        runtimeFactory,
        cursorStorageFactory: () => cursorStorage,
        presenceReporterFactory: noopPresenceReporterFactory,
        applier: createWorkspaceRealtimeNoopApplier(),
      }),
    );

    await waitFor(() => {
      expect(runtimes).toHaveLength(2);
    });
    expect(startedContexts.map((context) => [context.owner.projectId, context.surface])).toEqual([
      [activeSession.projectId, "active"],
      [backgroundSession.projectId, "background"],
    ]);
  });

  it("passes background runtime refresh through its own accountId", async () => {
    const activeSession = createSession();
    const backgroundSession = createSession({
      accountId: "org-b:project-b:user-b",
      instanceId: "instance-b",
      organizationId: "org-b",
      projectId: "project-b",
      userUuid: "user-b",
      login: "user-b@example.com",
      accessToken: "access-token-b",
      refreshToken: "refresh-token-b",
      runtimeGeneration: 3,
      profile: {
        uuid: "user-b",
        username: "user-b",
        firstName: "User",
        lastName: "B",
        email: "user-b@example.com",
      },
    });
    useWorkspaceAuthStore.setState({
      sessions: [activeSession, backgroundSession],
      currentAccountId: activeSession.accountId,
      runtimeGeneration: activeSession.runtimeGeneration,
    });
    const refreshSession = vi.fn(() => Promise.resolve());
    const { runtimeFactory, runtimes, startedContexts, factoryOptions } = createRuntimeFactory();
    const cursorStorage = createWorkspaceRealtimeCursorStorage(new MemoryStorage());

    renderHook(() =>
      useLayoutWorkspaceRealtime({
        enabled: true,
        pathname: "/org/org-a/project/project-a/messenger",
        runtimeFactory,
        cursorStorageFactory: () => cursorStorage,
        refreshSession,
        presenceReporterFactory: noopPresenceReporterFactory,
        applier: createWorkspaceRealtimeNoopApplier(),
      }),
    );

    await waitFor(() => {
      expect(runtimes).toHaveLength(2);
    });
    const backgroundIndex = startedContexts.findIndex(
      (context) => context.surface === "background",
    );

    await factoryOptions[backgroundIndex]!.refreshSession(backgroundSession.accountId, {
      force: true,
    });

    expect(refreshSession).toHaveBeenCalledWith(
      backgroundSession.accountId,
      expect.objectContaining({ force: true }),
    );
  });

  it("forces Workspace session refresh through the default realtime callback", async () => {
    const session = createSession();
    setWorkspaceSession(session);
    const { runtimeFactory, runtimes, factoryOptions } = createRuntimeFactory();
    const cursorStorage = createWorkspaceRealtimeCursorStorage(new MemoryStorage());
    const controller = new AbortController();

    renderHook(() =>
      useLayoutWorkspaceRealtime({
        enabled: true,
        pathname: "/org/org-a/project/project-a/messenger",
        runtimeFactory,
        cursorStorageFactory: () => cursorStorage,
        presenceReporterFactory: noopPresenceReporterFactory,
        applier: createWorkspaceRealtimeNoopApplier(),
      }),
    );

    await waitFor(() => {
      expect(runtimes[0]?.start).toHaveBeenCalledTimes(1);
    });

    await factoryOptions[0]!.refreshSession(session.accountId, {
      signal: controller.signal,
    });

    expect(ensureFreshWorkspaceSessionMock).toHaveBeenCalledWith(session.accountId, {
      force: true,
      signal: controller.signal,
    });
  });

  it("uses active messenger applier by default", async () => {
    setWorkspaceSession(createSession({ projectId: PROJECT_UUID, userUuid: USER_UUID }));
    const { runtimeFactory, runtimes, startedContexts, factoryOptions } = createRuntimeFactory();
    const cursorStorage = createWorkspaceRealtimeCursorStorage(new MemoryStorage());

    renderHook(() =>
      useLayoutWorkspaceRealtime({
        enabled: true,
        pathname: `/org/org-a/project/${PROJECT_UUID}/messenger`,
        runtimeFactory,
        cursorStorageFactory: () => cursorStorage,
        presenceReporterFactory: noopPresenceReporterFactory,
      }),
    );

    await waitFor(() => {
      expect(runtimes[0]?.start).toHaveBeenCalledTimes(1);
    });
    const context = startedContexts[0]!;
    useMessengerStore.getState().startBootstrap(context.ownerKey);

    factoryOptions[0]!.applier.applyEvent(
      {
        epoch_version: 8,
        type: "message",
        message: {
          uuid: MESSAGE_UUID,
          project_id: PROJECT_UUID,
          stream_uuid: STREAM_UUID,
          topic_uuid: TOPIC_UUID,
          author_uuid: USER_UUID,
          payload: { kind: "markdown", content: "Live workspace message" },
          user_uuid: USER_UUID,
          read: false,
          pinned: false,
          starred: false,
          is_own: false,
          reactions: {},
          created_at: DATE,
          updated_at: DATE,
        },
      },
      { ...context, source: "websocket", notificationsEnabled: true },
    );

    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_UUID]).toEqual(
      expect.objectContaining({ payload: { kind: "markdown", content: "Live workspace message" } }),
    );
  });

  it("opens incoming Jitsi invite from a peer Workspace DM message", async () => {
    setWorkspaceSession(
      createSession({
        projectId: PROJECT_UUID,
        userUuid: USER_UUID,
        profile: {
          uuid: USER_UUID,
          username: "current",
          firstName: "Current",
          lastName: "User",
          email: "current@example.com",
        },
      }),
    );
    const { runtimeFactory, runtimes, startedContexts, factoryOptions } = createRuntimeFactory();
    const cursorStorage = createWorkspaceRealtimeCursorStorage(new MemoryStorage());

    renderHook(() =>
      useLayoutWorkspaceRealtime({
        enabled: true,
        pathname: `/org/org-a/project/${PROJECT_UUID}/messenger`,
        runtimeFactory,
        cursorStorageFactory: () => cursorStorage,
        presenceReporterFactory: noopPresenceReporterFactory,
      }),
    );

    await waitFor(() => {
      expect(runtimes[0]?.start).toHaveBeenCalledTimes(1);
    });
    const context = startedContexts[0]!;
    useMessengerStore.getState().startBootstrap(context.ownerKey);
    useUsersStore.getState().upsertUsers([
      {
        uuid: CALLER_UUID,
        username: "alice",
        firstName: "Alice",
        lastName: "Adams",
        displayName: "Alice Adams",
        email: "alice@example.com",
        avatarUrl: "/avatars/alice.png",
        status: "active",
        statusEmoji: null,
        statusText: null,
        lastPingAt: DATE,
        createdAt: DATE,
        updatedAt: DATE,
      },
      {
        uuid: USER_UUID,
        username: "current",
        firstName: "Current",
        lastName: "User",
        displayName: "Current User",
        email: "current@example.com",
        avatarUrl: null,
        status: "active",
        statusEmoji: null,
        statusText: null,
        lastPingAt: DATE,
        createdAt: DATE,
        updatedAt: DATE,
      },
    ]);
    useWorkspaceJitsiSettingsStore
      .getState()
      .setWorkspaceMeetUrl(context.ownerKey, "https://meet.workspace.example.com");

    factoryOptions[0]!.applier.applyEvent(
      {
        epoch_version: 7,
        type: "stream",
        kind: "stream.created",
        stream: {
          uuid: STREAM_UUID,
          name: "Alice Adams",
          description: "",
          project_id: PROJECT_UUID,
          owner: USER_UUID,
          user_uuid: USER_UUID,
          role: "member",
          notification_mode: "all_messages",
          unread_count: 1,
          active_unread_count: 1,
          passive_unread_count: 0,
          source_name: "native",
          source: { kind: "native" },
          invite_only: true,
          announce: false,
          private: true,
          is_archived: false,
          direct_user_uuid: CALLER_UUID,
          created_at: DATE,
          updated_at: DATE,
        },
      },
      { ...context, source: "websocket", notificationsEnabled: true },
    );
    factoryOptions[0]!.applier.applyEvent(
      {
        epoch_version: 8,
        type: "topic",
        kind: "topic.created",
        topic: {
          uuid: TOPIC_UUID,
          project_id: PROJECT_UUID,
          name: "direct",
          stream_uuid: STREAM_UUID,
          user_uuid: USER_UUID,
          unread_count: 1,
          active_unread_count: 1,
          passive_unread_count: 0,
          is_default: true,
          is_done: false,
          notification_mode: "default",
          created_at: DATE,
          updated_at: DATE,
        },
      },
      { ...context, source: "websocket", notificationsEnabled: true },
    );
    factoryOptions[0]!.applier.applyEvent(
      {
        epoch_version: 9,
        type: "message",
        message: {
          uuid: BACKFILL_MESSAGE_UUID,
          project_id: PROJECT_UUID,
          stream_uuid: STREAM_UUID,
          topic_uuid: TOPIC_UUID,
          author_uuid: CALLER_UUID,
          payload: {
            kind: "markdown",
            content: "https://meet.workspace.example.com/old-workspace-room",
          },
          user_uuid: USER_UUID,
          read: false,
          pinned: false,
          starred: false,
          is_own: false,
          provider: {
            kind: "zulip",
            account_uuid: EXTERNAL_ACCOUNT_UUID,
            external_id: "old-call-invite",
            capabilities: {},
            delivery_class: "backfill",
            notification_eligible: false,
          },
          reactions: {},
          created_at: DATE,
          updated_at: DATE,
        },
      },
      { ...context, source: "websocket", notificationsEnabled: true },
    );

    expect(useJitsiCallStore.getState().incomingInvite).toBeNull();
    expect(useWorkspaceMessageStore.getState().messagesById[BACKFILL_MESSAGE_UUID]).toBeDefined();

    factoryOptions[0]!.applier.applyEvent(
      {
        epoch_version: 10,
        type: "message",
        message: {
          uuid: MESSAGE_UUID,
          project_id: PROJECT_UUID,
          stream_uuid: STREAM_UUID,
          topic_uuid: TOPIC_UUID,
          author_uuid: CALLER_UUID,
          payload: {
            kind: "markdown",
            content: "https://meet.workspace.example.com/workspace-room-1",
          },
          user_uuid: USER_UUID,
          read: false,
          pinned: false,
          starred: false,
          is_own: false,
          reactions: {},
          created_at: DATE,
          updated_at: DATE,
        },
      },
      { ...context, source: "websocket", notificationsEnabled: true },
    );

    expect(useJitsiCallStore.getState().incomingInvite).toEqual(
      expect.objectContaining({
        messageId: MESSAGE_UUID,
        meetingUrl: "https://meet.workspace.example.com/workspace-room-1",
        callerName: "Alice Adams",
        locationName: "Alice Adams",
        ownerKey: context.ownerKey,
        meetUrl: "https://meet.workspace.example.com",
        displayName: "Current User",
        avatarUrl: "/avatars/alice.png",
      }),
    );
  });

  it("uses active user applier by default", async () => {
    setWorkspaceSession(createSession({ projectId: PROJECT_UUID, userUuid: USER_UUID }));
    const { runtimeFactory, runtimes, startedContexts, factoryOptions } = createRuntimeFactory();
    const cursorStorage = createWorkspaceRealtimeCursorStorage(new MemoryStorage());

    renderHook(() =>
      useLayoutWorkspaceRealtime({
        enabled: true,
        pathname: `/org/org-a/project/${PROJECT_UUID}/messenger`,
        runtimeFactory,
        cursorStorageFactory: () => cursorStorage,
        presenceReporterFactory: noopPresenceReporterFactory,
      }),
    );

    await waitFor(() => {
      expect(runtimes[0]?.start).toHaveBeenCalledTimes(1);
    });
    const context = startedContexts[0]!;
    useUsersStore.getState().startOwnerSync(context.ownerKey);

    factoryOptions[0]!.applier.applyEvent(
      {
        epoch_version: 9,
        type: "user",
        kind: "user.updated",
        user: {
          uuid: USER_UUID,
          username: "alice",
          source: "iam",
          avatar: `urn:gavatar:${USER_UUID}`,
          status: "idle",
          status_emoji: null,
          status_text: "Focus",
          first_name: "Alice",
          last_name: null,
          email: "alice@example.com",
          last_ping_at: DATE,
          created_at: DATE,
          updated_at: DATE,
        },
      },
      { ...context, source: "websocket", notificationsEnabled: true },
    );

    expect(useUsersStore.getState().getUser(USER_UUID)).toEqual(
      expect.objectContaining({
        username: "alice",
        status: "idle",
        statusText: "Focus",
      }),
    );
  });

  it("routes background realtime events to projection without writing messengerStore", async () => {
    const activeSession = createSession({ projectId: PROJECT_UUID, userUuid: USER_UUID });
    const backgroundSession = createSession({
      accountId: "org-b:project-b:user-b",
      instanceId: "instance-b",
      organizationId: "org-b",
      projectId: "project-b",
      userUuid: "user-b",
      login: "user-b@example.com",
      accessToken: "access-token-b",
      runtimeGeneration: 3,
      profile: {
        uuid: "user-b",
        username: "user-b",
        firstName: "User",
        lastName: "B",
        email: "user-b@example.com",
      },
    });
    useWorkspaceAuthStore.setState({
      sessions: [activeSession, backgroundSession],
      currentAccountId: activeSession.accountId,
      runtimeGeneration: activeSession.runtimeGeneration,
    });
    const { runtimeFactory, runtimes, startedContexts, factoryOptions } = createRuntimeFactory();
    const cursorStorage = createWorkspaceRealtimeCursorStorage(new MemoryStorage());

    renderHook(() =>
      useLayoutWorkspaceRealtime({
        enabled: true,
        pathname: `/org/org-a/project/${PROJECT_UUID}/messenger`,
        runtimeFactory,
        cursorStorageFactory: () => cursorStorage,
        presenceReporterFactory: noopPresenceReporterFactory,
      }),
    );

    await waitFor(() => {
      expect(runtimes).toHaveLength(2);
    });
    const backgroundIndex = startedContexts.findIndex(
      (context) => context.surface === "background",
    );
    const backgroundContext = startedContexts[backgroundIndex]!;
    useMessengerStore.getState().startBootstrap(backgroundContext.ownerKey);

    factoryOptions[backgroundIndex]!.applier.applyEvent(
      {
        epoch_version: 8,
        type: "message",
        message: {
          uuid: MESSAGE_UUID,
          project_id: PROJECT_UUID,
          stream_uuid: STREAM_UUID,
          topic_uuid: TOPIC_UUID,
          author_uuid: USER_UUID,
          payload: { kind: "markdown", content: "Background workspace message" },
          user_uuid: USER_UUID,
          read: false,
          pinned: false,
          starred: false,
          is_own: false,
          reactions: {},
          created_at: DATE,
          updated_at: DATE,
        },
      },
      { ...backgroundContext, source: "websocket", notificationsEnabled: true },
    );

    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_UUID]).toBeUndefined();
    expect(
      useMessengerBackgroundProjectionStore.getState().projectionsByOwnerKey[
        backgroundContext.ownerKey
      ]?.notificationCandidates,
    ).toEqual([
      expect.objectContaining({
        ownerKey: backgroundContext.ownerKey,
        epochVersion: 8,
        messageUuid: MESSAGE_UUID,
        streamUuid: STREAM_UUID,
        topicUuid: TOPIC_UUID,
      }),
    ]);
  });

  it("does not start runtime outside current Workspace project route", () => {
    setWorkspaceSession(createSession());
    const { runtimeFactory, runtimes } = createRuntimeFactory();
    const cursorStorage = createWorkspaceRealtimeCursorStorage(new MemoryStorage());

    renderHook(() =>
      useLayoutWorkspaceRealtime({
        enabled: true,
        pathname: "/org/org-a/project/project-b/messenger",
        runtimeFactory,
        cursorStorageFactory: () => cursorStorage,
        presenceReporterFactory: noopPresenceReporterFactory,
        applier: createWorkspaceRealtimeNoopApplier(),
      }),
    );

    expect(runtimes).toHaveLength(0);
  });

  it("stops old runtime on route or owner cleanup", async () => {
    const session = createSession();
    setWorkspaceSession(session);
    const { runtimeFactory, runtimes } = createRuntimeFactory();
    const cursorStorage = createWorkspaceRealtimeCursorStorage(new MemoryStorage());
    const cursorStorageFactory = () => cursorStorage;
    const applier = createWorkspaceRealtimeNoopApplier();

    const { rerender } = renderHook(
      ({ pathname }) =>
        useLayoutWorkspaceRealtime({
          enabled: true,
          pathname,
          runtimeFactory,
          cursorStorageFactory,
          presenceReporterFactory: noopPresenceReporterFactory,
          applier,
        }),
      {
        initialProps: { pathname: "/org/org-a/project/project-a/messenger" },
      },
    );

    await waitFor(() => {
      expect(runtimes[0]?.start).toHaveBeenCalledTimes(1);
    });
    act(() => {
      rerender({ pathname: "/inbox" });
    });

    await waitFor(() => {
      expect(runtimes[0]?.stop).toHaveBeenCalledWith("layout_inactive");
    });
  });

  it("rejects stale owner callbacks when runtimeGeneration changes", () => {
    const session = createSession();
    setWorkspaceSession(session);

    expect(
      isLayoutWorkspaceRealtimeOwnerCurrent(
        {
          accountId: session.accountId,
          instanceId: session.instanceId,
          organizationId: session.organizationId,
          projectId: session.projectId,
          userUuid: session.userUuid,
          runtimeGeneration: session.runtimeGeneration,
        },
        () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
      ),
    ).toBe(true);

    expect(
      isLayoutWorkspaceRealtimeOwnerCurrent(
        {
          accountId: session.accountId,
          instanceId: session.instanceId,
          organizationId: session.organizationId,
          projectId: session.projectId,
          userUuid: session.userUuid,
          runtimeGeneration: session.runtimeGeneration - 1,
        },
        () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
      ),
    ).toBe(false);
  });
});
