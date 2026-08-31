import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceAuthSession } from "~/entities/workspace-auth/workspace-auth.model";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { useWorkspaceIamCapabilitiesStore } from "~/entities/workspace-auth/workspace-iam-capabilities.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type * as WorkspaceIamIntrospectionModule from "~/shared/api/workspace-iam-introspection.api";
import {
  WorkspaceIamIntrospectionError,
  type WorkspaceIamIntrospection,
} from "~/shared/api/workspace-iam-introspection.api";
import {
  useLayoutWorkspaceIamCapabilities,
  WORKSPACE_IAM_CAPABILITIES_STALE_MS,
} from "./layout-workspace-iam-capabilities.hook";

const mocks = vi.hoisted(() => ({
  ensureFreshWorkspaceSession: vi.fn(),
  getWorkspaceIamIntrospection: vi.fn(),
  reportUnexpectedError: vi.fn(),
  reconnectCallback: null as (() => void) | null,
  resumeCallback: null as ((hiddenDurationMs: number) => void) | null,
  visibilityCallback: null as ((visible: boolean) => void) | null,
}));

vi.mock("~/entities/workspace-auth/workspace-auth.lib", () => ({
  ensureFreshWorkspaceSession: mocks.ensureFreshWorkspaceSession,
}));

vi.mock("~/shared/api/workspace-iam-introspection.api", async (importOriginal) => {
  const actual = await importOriginal<typeof WorkspaceIamIntrospectionModule>();
  return {
    ...actual,
    getWorkspaceIamIntrospection: mocks.getWorkspaceIamIntrospection,
  };
});

vi.mock("~/shared/lib/network", () => ({
  onReconnect: (callback: () => void) => {
    mocks.reconnectCallback = callback;
    return () => {
      if (mocks.reconnectCallback === callback) mocks.reconnectCallback = null;
    };
  },
}));

vi.mock("~/shared/lib/unexpected-error.lib", () => ({
  reportUnexpectedError: mocks.reportUnexpectedError,
}));

vi.mock("~/shared/lib/visibility", () => ({
  onTabResume: (callback: (hiddenDurationMs: number) => void) => {
    mocks.resumeCallback = callback;
    return () => {
      if (mocks.resumeCallback === callback) mocks.resumeCallback = null;
    };
  },
  onVisibilityChange: (callback: (visible: boolean) => void) => {
    mocks.visibilityCallback = callback;
    return () => {
      if (mocks.visibilityCallback === callback) mocks.visibilityCallback = null;
    };
  },
}));

function createSession(overrides: Partial<WorkspaceAuthSession> = {}): WorkspaceAuthSession {
  return {
    accountId: "account-1",
    instanceId: "instance-1",
    organizationId: "organization-1",
    organizationOrigin: "https://workspace.example.com",
    projectId: "project-1",
    userUuid: "user-1",
    login: "user@example.com",
    accessToken: "token-1",
    refreshToken: "refresh-1",
    runtimeGeneration: 7,
    profile: {
      uuid: "user-1",
      username: "user",
      firstName: "User",
      lastName: null,
      email: "user@example.com",
    },
    ...overrides,
  };
}

function introspectionFor(
  session: WorkspaceAuthSession,
  permissions: readonly string[],
): WorkspaceIamIntrospection {
  return {
    userInfo: { uuid: session.userUuid },
    projectId: session.projectId,
    otpVerified: false,
    permissions,
  };
}

function setActiveSession(session: WorkspaceAuthSession): void {
  useWorkspaceAuthStore.setState({
    sessions: [session],
    currentAccountId: session.accountId,
    runtimeGeneration: session.runtimeGeneration,
  });
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
    resolve: (value) => resolvePromise?.(value),
  };
}

async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    for (let index = 0; index < 8; index += 1) {
      await Promise.resolve();
    }
  });
}

beforeEach(() => {
  mocks.ensureFreshWorkspaceSession.mockReset();
  mocks.getWorkspaceIamIntrospection.mockReset();
  mocks.reportUnexpectedError.mockReset();
  mocks.reconnectCallback = null;
  mocks.resumeCallback = null;
  mocks.visibilityCallback = null;
  useWorkspaceIamCapabilitiesStore.getState().clear();
  useWorkspaceAuthStore.setState({ sessions: [], currentAccountId: null, runtimeGeneration: 0 });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  useWorkspaceIamCapabilitiesStore.getState().clear();
  useWorkspaceAuthStore.setState({ sessions: [], currentAccountId: null, runtimeGeneration: 0 });
});

describe("useLayoutWorkspaceIamCapabilities", () => {
  it("loads effective permissions for the active runtime owner", async () => {
    const session = createSession();
    const permissions = ["workspace.topic_summary_settings.manage"];
    setActiveSession(session);
    mocks.ensureFreshWorkspaceSession.mockResolvedValue(session);
    mocks.getWorkspaceIamIntrospection.mockResolvedValue(introspectionFor(session, permissions));

    renderHook(() => useLayoutWorkspaceIamCapabilities(session));

    await waitFor(() => {
      expect(useWorkspaceIamCapabilitiesStore.getState().status).toBe("ready");
    });
    expect(mocks.ensureFreshWorkspaceSession).toHaveBeenCalledWith(session.accountId, {
      signal: expect.any(AbortSignal),
    });
    expect(mocks.getWorkspaceIamIntrospection).toHaveBeenCalledWith({
      accessToken: session.accessToken,
      baseUrl: session.organizationOrigin,
      signal: expect.any(AbortSignal),
    });
    expect(useWorkspaceIamCapabilitiesStore.getState()).toMatchObject({
      ownerKey: workspaceRuntimeOwnerKey(session),
      runtimeGeneration: session.runtimeGeneration,
      permissions,
      status: "ready",
      error: null,
    });
  });

  it("rejects a stale response after the active runtime owner changes", async () => {
    const firstSession = createSession();
    const secondSession = createSession({
      accountId: "account-2",
      instanceId: "instance-2",
      organizationId: "organization-2",
      projectId: "project-2",
      userUuid: "user-2",
      accessToken: "token-2",
      runtimeGeneration: 8,
      profile: {
        uuid: "user-2",
        username: "second-user",
        firstName: "Second",
        lastName: null,
        email: "second@example.com",
      },
    });
    const firstResponse = deferred<WorkspaceIamIntrospection>();
    setActiveSession(firstSession);
    mocks.ensureFreshWorkspaceSession.mockImplementation((accountId: string) =>
      Promise.resolve(accountId === firstSession.accountId ? firstSession : secondSession),
    );
    mocks.getWorkspaceIamIntrospection
      .mockReturnValueOnce(firstResponse.promise)
      .mockResolvedValueOnce(
        introspectionFor(secondSession, ["workspace.topic_summary_endpoint.manage"]),
      );

    const { rerender } = renderHook(
      ({ session }: { session: WorkspaceAuthSession }) =>
        useLayoutWorkspaceIamCapabilities(session),
      { initialProps: { session: firstSession } },
    );
    await waitFor(() => expect(mocks.getWorkspaceIamIntrospection).toHaveBeenCalledTimes(1));

    setActiveSession(secondSession);
    rerender({ session: secondSession });

    await waitFor(() => {
      expect(useWorkspaceIamCapabilitiesStore.getState()).toMatchObject({
        ownerKey: workspaceRuntimeOwnerKey(secondSession),
        permissions: ["workspace.topic_summary_endpoint.manage"],
        status: "ready",
      });
    });

    firstResponse.resolve(
      introspectionFor(firstSession, ["workspace.topic_summary_settings.manage"]),
    );
    await flushMicrotasks();

    expect(useWorkspaceIamCapabilitiesStore.getState()).toMatchObject({
      ownerKey: workspaceRuntimeOwnerKey(secondSession),
      permissions: ["workspace.topic_summary_endpoint.manage"],
      status: "ready",
    });
  });

  it("fails closed when introspection belongs to another project or user", async () => {
    const session = createSession();
    setActiveSession(session);
    mocks.ensureFreshWorkspaceSession.mockResolvedValue(session);
    mocks.getWorkspaceIamIntrospection.mockResolvedValue({
      ...introspectionFor(session, ["workspace.topic_summary_settings.manage"]),
      projectId: "another-project",
    });

    renderHook(() => useLayoutWorkspaceIamCapabilities(session));

    await waitFor(() => {
      expect(useWorkspaceIamCapabilitiesStore.getState().status).toBe("error");
    });
    expect(useWorkspaceIamCapabilitiesStore.getState()).toMatchObject({
      ownerKey: workspaceRuntimeOwnerKey(session),
      permissions: null,
      error: "Workspace IAM introspection owner mismatch",
    });
    expect(mocks.reportUnexpectedError).toHaveBeenCalledWith(
      "workspace-iam:capabilities",
      expect.any(TypeError),
    );
  });

  it("refreshes the token once and retries introspection after 401", async () => {
    const session = createSession();
    const refreshedSession = createSession({
      accessToken: "token-2",
      runtimeGeneration: 8,
    });
    setActiveSession(session);
    mocks.ensureFreshWorkspaceSession.mockImplementation(
      (_accountId: string, options?: { force?: boolean }) => {
        if (options?.force === true) setActiveSession(refreshedSession);
        return Promise.resolve(options?.force === true ? refreshedSession : session);
      },
    );
    mocks.getWorkspaceIamIntrospection
      .mockRejectedValueOnce(
        new WorkspaceIamIntrospectionError("expired", 401, { message: "expired" }),
      )
      .mockResolvedValueOnce(introspectionFor(refreshedSession, ["permission.refreshed"]));

    renderHook(() => useLayoutWorkspaceIamCapabilities(session));

    await waitFor(() => {
      expect(useWorkspaceIamCapabilitiesStore.getState().status).toBe("ready");
    });
    expect(mocks.ensureFreshWorkspaceSession).toHaveBeenLastCalledWith(session.accountId, {
      force: true,
      signal: expect.any(AbortSignal),
    });
    expect(mocks.getWorkspaceIamIntrospection).toHaveBeenLastCalledWith({
      accessToken: refreshedSession.accessToken,
      baseUrl: refreshedSession.organizationOrigin,
      signal: expect.any(AbortSignal),
    });
    expect(useWorkspaceIamCapabilitiesStore.getState()).toMatchObject({
      runtimeGeneration: refreshedSession.runtimeGeneration,
      permissions: ["permission.refreshed"],
      status: "ready",
    });
  });

  it("revalidates on visibility only after the cached permissions become stale", async () => {
    vi.useFakeTimers();
    const session = createSession();
    setActiveSession(session);
    mocks.ensureFreshWorkspaceSession.mockResolvedValue(session);
    mocks.getWorkspaceIamIntrospection
      .mockResolvedValueOnce(introspectionFor(session, ["permission.initial"]))
      .mockResolvedValueOnce(introspectionFor(session, ["permission.refreshed"]));

    const { unmount } = renderHook(() => useLayoutWorkspaceIamCapabilities(session));
    await flushMicrotasks();
    expect(useWorkspaceIamCapabilitiesStore.getState()).toMatchObject({
      status: "ready",
      permissions: ["permission.initial"],
    });

    act(() => {
      mocks.visibilityCallback?.(true);
      vi.advanceTimersByTime(500);
    });
    await flushMicrotasks();
    expect(mocks.getWorkspaceIamIntrospection).toHaveBeenCalledTimes(1);

    act(() => {
      useWorkspaceIamCapabilitiesStore.setState({
        lastLoadedAtMs: Date.now() - WORKSPACE_IAM_CAPABILITIES_STALE_MS - 1,
      });
      mocks.visibilityCallback?.(true);
      vi.advanceTimersByTime(500);
    });
    await flushMicrotasks();

    expect(mocks.getWorkspaceIamIntrospection).toHaveBeenCalledTimes(2);
    expect(useWorkspaceIamCapabilitiesStore.getState()).toMatchObject({
      status: "ready",
      permissions: ["permission.refreshed"],
    });

    unmount();
  });

  it("clears permissions when background revalidation fails", async () => {
    vi.useFakeTimers();
    const session = createSession();
    setActiveSession(session);
    mocks.ensureFreshWorkspaceSession.mockResolvedValue(session);
    mocks.getWorkspaceIamIntrospection
      .mockResolvedValueOnce(introspectionFor(session, ["permission.initial"]))
      .mockRejectedValueOnce(new Error("network failure"));

    renderHook(() => useLayoutWorkspaceIamCapabilities(session));
    await flushMicrotasks();
    expect(useWorkspaceIamCapabilitiesStore.getState()).toMatchObject({
      status: "ready",
      permissions: ["permission.initial"],
    });

    act(() => {
      useWorkspaceIamCapabilitiesStore.setState({
        lastLoadedAtMs: Date.now() - WORKSPACE_IAM_CAPABILITIES_STALE_MS - 1,
      });
      mocks.visibilityCallback?.(true);
      vi.advanceTimersByTime(500);
    });
    await flushMicrotasks();

    expect(useWorkspaceIamCapabilitiesStore.getState()).toMatchObject({
      status: "error",
      permissions: null,
      lastLoadedAtMs: null,
      error: "network failure",
    });
  });
});
