import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type * as WorkspaceIamAuthModule from "~/shared/api/workspace-iam-auth";
import {
  loginWorkspaceWithPassword,
  refreshWorkspaceSession,
  removeWorkspaceSession,
} from "./workspace-auth.lib";
import { useWorkspaceAuthStore } from "./workspace-auth.model";
import type { WorkspaceAuthSession } from "./workspace-auth.model";

const getServerSettings = vi.hoisted(() => vi.fn());
const getWorkspaceMessengerAuthProfile = vi.hoisted(() => vi.fn());
const requestWorkspaceIamLoginPasswordToken = vi.hoisted(() => vi.fn());
const refreshWorkspaceIamToken = vi.hoisted(() => vi.fn());
const deleteWorkspaceMessengerOwnerCache = vi.hoisted(() => vi.fn());

const USER_UUID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";

vi.mock("~/shared/api/messenger-client", () => ({
  getServerSettings,
}));

vi.mock("~/shared/api/workspace-messenger-profile.api", () => ({
  getWorkspaceMessengerAuthProfile,
}));

vi.mock("~/shared/api/workspace-iam-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof WorkspaceIamAuthModule>();
  return {
    ...actual,
    requestWorkspaceIamLoginPasswordToken,
    refreshWorkspaceIamToken,
  };
});

vi.mock("~/shared/lib/workspace-messenger-cache-db", () => ({
  deleteWorkspaceMessengerOwnerCache,
}));

function tokenWithClaims(claims: Record<string, unknown>): string {
  const encoded = btoa(JSON.stringify(claims))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `header.${encoded}.signature`;
}

function resetStore(): void {
  localStorage.removeItem("workspace-auth-sessions");
  localStorage.removeItem("workspace-auth-current-account");
  useWorkspaceAuthStore.setState({ sessions: [], currentAccountId: null, runtimeGeneration: 0 });
}

function ownerKeyFromSession(session: WorkspaceAuthSession): string {
  return workspaceRuntimeOwnerKey(session);
}

async function loginAndGetCurrentSession(): Promise<WorkspaceAuthSession> {
  await loginWorkspaceWithPassword({
    organizationUrl: "https://workspace.example.com",
    login: "user@example.com",
    password: "secret",
    projectId: PROJECT_ID,
  });
  const session = useWorkspaceAuthStore.getState().getCurrentSession();
  if (session == null) {
    throw new Error("Expected Workspace session after login");
  }
  return session;
}

function createDeferred(): {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
} {
  let resolvePromise: () => void = () => {};
  let rejectPromise: (error: Error) => void = () => {};
  const promise = new Promise<void>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

describe("workspace-auth flow", () => {
  beforeEach(() => {
    resetStore();
    getServerSettings.mockResolvedValue({ realm_name: "Workspace" });
    getWorkspaceMessengerAuthProfile.mockResolvedValue({
      uuid: USER_UUID,
      username: "user",
      status: "active",
      first_name: "User",
      last_name: null,
      email: "user@example.com",
      last_ping_at: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    });
    requestWorkspaceIamLoginPasswordToken.mockResolvedValue({
      accessToken: tokenWithClaims({
        user_uuid: USER_UUID,
        project_id: PROJECT_ID,
        exp: 1_900_000_000,
      }),
      refreshToken: "refresh-token",
      raw: {},
    });
  });

  afterEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it("logs in with IAM token and stores a Workspace session", async () => {
    await loginWorkspaceWithPassword({
      organizationUrl: "https://workspace.example.com",
      login: "user@example.com",
      password: "secret",
      projectId: PROJECT_ID,
    });

    expect(requestWorkspaceIamLoginPasswordToken).toHaveBeenCalledWith(
      {
        login: "user@example.com",
        password: "secret",
        projectId: PROJECT_ID,
      },
      expect.objectContaining({
        tokenUrl:
          "https://workspace.example.com/api/core/v1/iam/clients/default/actions/get_token/invoke",
      }),
    );
    expect(getWorkspaceMessengerAuthProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: expect.any(String),
        baseUrl: "https://workspace.example.com/api/messenger/v1",
      }),
      USER_UUID,
    );
    expect(useWorkspaceAuthStore.getState().getCurrentSession()).toMatchObject({
      organizationId: "workspace.example.com",
      organizationOrigin: "https://workspace.example.com",
      projectId: PROJECT_ID,
      userUuid: USER_UUID,
      profile: {
        email: "user@example.com",
      },
    });
  });

  it("rejects token project mismatch without saving a session", async () => {
    requestWorkspaceIamLoginPasswordToken.mockResolvedValueOnce({
      accessToken: tokenWithClaims({
        user_uuid: USER_UUID,
        project_id: "33333333-3333-4333-8333-333333333333",
      }),
      raw: {},
    });

    await expect(
      loginWorkspaceWithPassword({
        organizationUrl: "https://workspace.example.com",
        login: "user@example.com",
        password: "secret",
        projectId: PROJECT_ID,
      }),
    ).rejects.toMatchObject({ code: "project-mismatch" });

    expect(useWorkspaceAuthStore.getState().sessions).toEqual([]);
  });

  it("uses JWT sub as user uuid and submitted project when project claim is absent", async () => {
    requestWorkspaceIamLoginPasswordToken.mockResolvedValueOnce({
      accessToken: tokenWithClaims({
        sub: USER_UUID,
        exp: 1_900_000_000,
      }),
      refreshToken: "refresh-token",
      raw: {},
    });

    await loginWorkspaceWithPassword({
      organizationUrl: "https://workspace.example.com",
      login: "user@example.com",
      password: "secret",
      projectId: PROJECT_ID,
    });

    expect(getWorkspaceMessengerAuthProfile).toHaveBeenCalledWith(expect.any(Object), USER_UUID);
    expect(useWorkspaceAuthStore.getState().getCurrentSession()).toMatchObject({
      projectId: PROJECT_ID,
      userUuid: USER_UUID,
    });
  });

  it("stores profile fields from a partial Workspace users response", async () => {
    getWorkspaceMessengerAuthProfile.mockResolvedValueOnce({
      uuid: USER_UUID,
      username: null,
      first_name: "Alice",
      last_name: "Workspace",
      email: "alice@workspace.example.com",
      status: null,
    });

    await loginWorkspaceWithPassword({
      organizationUrl: "https://workspace.example.com",
      login: "fallback@example.com",
      password: "secret",
      projectId: PROJECT_ID,
    });

    expect(useWorkspaceAuthStore.getState().getCurrentSession()).toMatchObject({
      profile: {
        uuid: USER_UUID,
        username: "Alice Workspace",
        firstName: "Alice",
        lastName: "Workspace",
        email: "alice@workspace.example.com",
      },
    });
  });

  it("stores a session with fallback profile when profile loading fails", async () => {
    getWorkspaceMessengerAuthProfile.mockRejectedValueOnce(
      new TypeError("messenger user response parse failed"),
    );

    await loginWorkspaceWithPassword({
      organizationUrl: "https://workspace.example.com",
      login: "user@example.com",
      password: "secret",
      projectId: PROJECT_ID,
    });

    expect(useWorkspaceAuthStore.getState().getCurrentSession()).toMatchObject({
      userUuid: USER_UUID,
      profile: {
        uuid: USER_UUID,
        username: "user@example.com",
        firstName: null,
        lastName: null,
        email: "user@example.com",
      },
    });
  });

  it("rejects profile responses owned by another user", async () => {
    getWorkspaceMessengerAuthProfile.mockResolvedValueOnce({
      uuid: "33333333-3333-4333-8333-333333333333",
      username: "other",
      status: "active",
      first_name: "Other",
      last_name: null,
      email: "other@example.com",
      last_ping_at: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    });

    await expect(
      loginWorkspaceWithPassword({
        organizationUrl: "https://workspace.example.com",
        login: "user@example.com",
        password: "secret",
        projectId: PROJECT_ID,
      }),
    ).rejects.toMatchObject({ code: "profile-load-failed" });

    expect(useWorkspaceAuthStore.getState().sessions).toEqual([]);
  });

  it("removes only the failed session when refresh fails", async () => {
    const session = await loginAndGetCurrentSession();
    refreshWorkspaceIamToken.mockRejectedValueOnce(new Error("expired"));

    await expect(refreshWorkspaceSession(session.accountId)).resolves.toBe(false);

    expect(deleteWorkspaceMessengerOwnerCache).toHaveBeenCalledWith(ownerKeyFromSession(session));
    expect(useWorkspaceAuthStore.getState().sessions).toHaveLength(0);
  });

  it("waits for Workspace messenger owner cache cleanup before explicit session removal", async () => {
    const session = await loginAndGetCurrentSession();
    const deferred = createDeferred();
    deleteWorkspaceMessengerOwnerCache.mockReturnValueOnce(deferred.promise);

    const removal = removeWorkspaceSession(session.accountId);

    expect(deleteWorkspaceMessengerOwnerCache).toHaveBeenCalledWith(ownerKeyFromSession(session));
    expect(useWorkspaceAuthStore.getState().sessions).toEqual([session]);

    deferred.resolve();
    await removal;

    expect(useWorkspaceAuthStore.getState().sessions).toEqual([]);
  });

  it("does not clean the Workspace messenger cache for an unknown account id", async () => {
    const session = await loginAndGetCurrentSession();

    await removeWorkspaceSession("missing-account");

    expect(deleteWorkspaceMessengerOwnerCache).not.toHaveBeenCalled();
    expect(useWorkspaceAuthStore.getState().sessions).toEqual([session]);
  });

  it("removes an explicit Workspace session even when owner cache cleanup fails", async () => {
    const session = await loginAndGetCurrentSession();
    deleteWorkspaceMessengerOwnerCache.mockRejectedValueOnce(new Error("idb failed"));

    await removeWorkspaceSession(session.accountId);

    expect(deleteWorkspaceMessengerOwnerCache).toHaveBeenCalledWith(ownerKeyFromSession(session));
    expect(useWorkspaceAuthStore.getState().sessions).toEqual([]);
  });

  it("cleans the Workspace messenger owner cache when refresh returns another user", async () => {
    const session = await loginAndGetCurrentSession();
    refreshWorkspaceIamToken.mockResolvedValueOnce({
      accessToken: tokenWithClaims({
        user_uuid: "33333333-3333-4333-8333-333333333333",
        project_id: PROJECT_ID,
      }),
      refreshToken: "refresh-token-next",
      raw: {},
    });

    await expect(refreshWorkspaceSession(session.accountId)).resolves.toBe(false);

    expect(deleteWorkspaceMessengerOwnerCache).toHaveBeenCalledWith(ownerKeyFromSession(session));
    expect(useWorkspaceAuthStore.getState().sessions).toEqual([]);
  });

  it("cleans the Workspace messenger owner cache when refresh returns another project", async () => {
    const session = await loginAndGetCurrentSession();
    refreshWorkspaceIamToken.mockResolvedValueOnce({
      accessToken: tokenWithClaims({
        user_uuid: USER_UUID,
        project_id: "33333333-3333-4333-8333-333333333333",
      }),
      refreshToken: "refresh-token-next",
      raw: {},
    });

    await expect(refreshWorkspaceSession(session.accountId)).resolves.toBe(false);

    expect(deleteWorkspaceMessengerOwnerCache).toHaveBeenCalledWith(ownerKeyFromSession(session));
    expect(useWorkspaceAuthStore.getState().sessions).toEqual([]);
  });

  it("removes a Workspace session even when owner cache cleanup fails", async () => {
    const session = await loginAndGetCurrentSession();
    refreshWorkspaceIamToken.mockRejectedValueOnce(new Error("expired"));
    deleteWorkspaceMessengerOwnerCache.mockRejectedValueOnce(new Error("idb failed"));

    await expect(refreshWorkspaceSession(session.accountId)).resolves.toBe(false);

    expect(useWorkspaceAuthStore.getState().sessions).toEqual([]);
  });
});
