import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type { WorkspaceAuthSession } from "~/entities/workspace-auth/workspace-auth.model";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { useLayoutWorkspaceMessengerBootstrap } from "./layout-workspace-messenger-bootstrap.hook";

const bootstrapMessengerStoreMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const refreshWorkspaceSessionMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const shouldRefreshWorkspaceSessionMock = vi.hoisted(() => vi.fn(() => false));
const WORKSPACE_AUTH_STORAGE_KEY = "workspace-auth-sessions";
const WORKSPACE_AUTH_CURRENT_ACCOUNT_KEY = "workspace-auth-current-account";

vi.mock("~/entities/messenger/messenger-bootstrap.lib", () => ({
  bootstrapMessengerStore: bootstrapMessengerStoreMock,
}));

vi.mock("~/entities/workspace-auth/workspace-auth.lib", () => ({
  refreshWorkspaceSession: refreshWorkspaceSessionMock,
  shouldRefreshWorkspaceSession: shouldRefreshWorkspaceSessionMock,
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

describe("useLayoutWorkspaceMessengerBootstrap", () => {
  beforeEach(() => {
    localStorage.removeItem(WORKSPACE_AUTH_STORAGE_KEY);
    localStorage.removeItem(WORKSPACE_AUTH_CURRENT_ACCOUNT_KEY);
    bootstrapMessengerStoreMock.mockClear();
    refreshWorkspaceSessionMock.mockClear();
    shouldRefreshWorkspaceSessionMock.mockClear();
    shouldRefreshWorkspaceSessionMock.mockReturnValue(false);
    useMessengerStore.getState().clear();
    useWorkspaceAuthStore.setState({ sessions: [], currentAccountId: null, runtimeGeneration: 0 });
  });

  afterEach(() => {
    vi.clearAllMocks();
    useMessengerStore.getState().clear();
    useWorkspaceAuthStore.setState({ sessions: [], currentAccountId: null, runtimeGeneration: 0 });
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
    expect(refreshWorkspaceSessionMock).not.toHaveBeenCalled();
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
    expect(shouldRefreshWorkspaceSessionMock).toHaveBeenCalledWith(session);
  });
});
