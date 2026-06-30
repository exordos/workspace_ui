import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceAuthSession } from "~/entities/workspace-auth/workspace-auth.model";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { createWorkspaceRealtimeCursorStorage } from "~/shared/lib/workspace-realtime/workspace-realtime-cursor.lib";
import type { WorkspaceRealtimeCursorStorageLike } from "~/shared/lib/workspace-realtime/workspace-realtime-cursor.lib";
import { createWorkspaceRealtimeNoopApplier } from "~/shared/lib/workspace-realtime/workspace-realtime-runtime.lib";
import type {
  WorkspaceRealtimeRuntimeContext,
  WorkspaceRealtimeTransportCore,
} from "~/shared/lib/workspace-realtime/workspace-realtime-runtime.lib";
import {
  isLayoutWorkspaceRealtimeOwnerCurrent,
  useLayoutWorkspaceRealtime,
} from "./layout-workspace-realtime.hook";
import type { LayoutWorkspaceRealtimeRuntimeFactory } from "./layout-workspace-realtime.hook";

const WORKSPACE_AUTH_STORAGE_KEY = "workspace-auth-sessions";
const WORKSPACE_AUTH_CURRENT_ACCOUNT_KEY = "workspace-auth-current-account";

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
  const runtimeFactory: LayoutWorkspaceRealtimeRuntimeFactory = () => {
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

  return { runtimeFactory, runtimes, startedContexts };
}

describe("useLayoutWorkspaceRealtime", () => {
  beforeEach(() => {
    localStorage.removeItem(WORKSPACE_AUTH_STORAGE_KEY);
    localStorage.removeItem(WORKSPACE_AUTH_CURRENT_ACCOUNT_KEY);
    useWorkspaceAuthStore.setState({ sessions: [], currentAccountId: null, runtimeGeneration: 0 });
  });

  afterEach(() => {
    vi.clearAllMocks();
    useWorkspaceAuthStore.setState({ sessions: [], currentAccountId: null, runtimeGeneration: 0 });
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
    const applier = createWorkspaceRealtimeNoopApplier();

    const { rerender } = renderHook(
      ({ pathname }) =>
        useLayoutWorkspaceRealtime({
          enabled: true,
          pathname,
          runtimeFactory,
          cursorStorageFactory: () => cursorStorage,
          applier,
        }),
      {
        initialProps: { pathname: "/org/org-a/project/project-a/messenger" },
      },
    );

    await waitFor(() => {
      expect(runtimes[0]?.start).toHaveBeenCalledTimes(1);
    });
    rerender({ pathname: "/inbox" });

    await waitFor(() => {
      expect(runtimes[0]?.stop).toHaveBeenCalledWith("layout_cleanup");
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
