import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type * as WorkspaceIamAuthModule from "~/shared/api/workspace-iam-auth";
import { WorkspaceIamAuthError } from "~/shared/api/workspace-iam-auth";
import {
  classifyWorkspaceAuthRefreshError,
  ensureFreshWorkspaceSession,
  loginWorkspaceWithPassword,
  removeWorkspaceSession,
} from "./workspace-auth.lib";
import { useWorkspaceAuthStore } from "./workspace-auth.model";
import type { WorkspaceAuthSession } from "./workspace-auth.model";

const getServerSettings = vi.hoisted(() => vi.fn());
const getWorkspaceMessengerAuthProfile = vi.hoisted(() => vi.fn());
const requestWorkspaceIamLoginPasswordToken = vi.hoisted(() => vi.fn());
const refreshWorkspaceIamToken = vi.hoisted(() => vi.fn());
const deleteWorkspaceExternalAccountOwnerCache = vi.hoisted(() => vi.fn());
const deleteWorkspaceMessengerOwnerCache = vi.hoisted(() => vi.fn());
const deleteWorkspaceUserOwnerCache = vi.hoisted(() => vi.fn());
const disposeWorkspaceComposerDraftOwner = vi.hoisted(() => vi.fn());

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

vi.mock("~/shared/lib/workspace-external-account-cache-db", () => ({
  deleteWorkspaceExternalAccountOwnerCache,
}));

vi.mock("~/shared/lib/workspace-user-cache-db", () => ({
  deleteWorkspaceUserOwnerCache,
}));

vi.mock("~/entities/composer-draft/composer-draft.model", () => ({
  useWorkspaceComposerDraftStore: {
    getState: () => ({ disposeOwner: disposeWorkspaceComposerDraftOwner }),
  },
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

function createWorkspaceSession(
  overrides: Partial<WorkspaceAuthSession> = {},
): WorkspaceAuthSession {
  const userUuid = overrides.userUuid ?? USER_UUID;
  const projectId = overrides.projectId ?? PROJECT_ID;
  return {
    accountId: overrides.accountId ?? `workspace.example.com:${projectId}:${userUuid}`,
    instanceId: overrides.instanceId ?? `instance-${userUuid}`,
    organizationId: overrides.organizationId ?? "workspace.example.com",
    organizationOrigin: overrides.organizationOrigin ?? "https://workspace.example.com",
    projectId,
    userUuid,
    login: overrides.login ?? "user@example.com",
    accessToken:
      overrides.accessToken ??
      tokenWithClaims({
        user_uuid: userUuid,
        project_id: projectId,
        exp: 1_900_000_000,
      }),
    refreshToken: overrides.refreshToken ?? `refresh-${userUuid}`,
    expiresAtMs: overrides.expiresAtMs ?? Date.now() - 1000,
    profile: overrides.profile ?? {
      uuid: userUuid,
      username: userUuid,
      firstName: null,
      lastName: null,
      email: null,
    },
    runtimeGeneration: overrides.runtimeGeneration ?? 0,
  };
}

function storeWorkspaceSession(session: WorkspaceAuthSession): WorkspaceAuthSession {
  useWorkspaceAuthStore.getState().setSession(session);
  const stored = useWorkspaceAuthStore
    .getState()
    .sessions.find((item) => item.accountId === session.accountId);
  if (stored == null) {
    throw new Error("Expected Workspace session to be stored");
  }
  return stored;
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

function createDeferredValue<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
} {
  let resolvePromise: (value: T) => void = () => {};
  let rejectPromise: (error: Error) => void = () => {};
  const promise = new Promise<T>((resolve, reject) => {
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
        baseUrl: "https://workspace.example.com/api/workspace/v1",
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

  it("keeps a Workspace session when refresh fails transiently", async () => {
    const session = await loginAndGetCurrentSession();
    refreshWorkspaceIamToken.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(
      ensureFreshWorkspaceSession(session.accountId, { force: true }),
    ).rejects.toBeInstanceOf(TypeError);

    expect(deleteWorkspaceMessengerOwnerCache).not.toHaveBeenCalled();
    expect(deleteWorkspaceUserOwnerCache).not.toHaveBeenCalled();
    expect(useWorkspaceAuthStore.getState().sessions).toEqual([session]);
  });

  it("shares one refresh request between parallel ensureFreshWorkspaceSession calls", async () => {
    const session = await loginAndGetCurrentSession();
    const deferred = createDeferredValue<WorkspaceIamAuthModule.WorkspaceIamTokenResponse>();
    refreshWorkspaceIamToken.mockReturnValueOnce(deferred.promise);

    const first = ensureFreshWorkspaceSession(session.accountId, { force: true });
    const second = ensureFreshWorkspaceSession(session.accountId, { force: true });

    expect(refreshWorkspaceIamToken).toHaveBeenCalledTimes(1);

    deferred.resolve({
      accessToken: tokenWithClaims({
        user_uuid: USER_UUID,
        project_id: PROJECT_ID,
        exp: 1_900_000_100,
      }),
      refreshToken: "refresh-token-next",
      raw: {},
    });

    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult.accessToken).toBe(secondResult.accessToken);
    expect(useWorkspaceAuthStore.getState().getCurrentSession()).toMatchObject({
      accountId: session.accountId,
      refreshToken: "refresh-token-next",
    });
  });

  it("keeps shared refresh alive when one waiting caller is aborted", async () => {
    const session = await loginAndGetCurrentSession();
    const deferred = createDeferredValue<WorkspaceIamAuthModule.WorkspaceIamTokenResponse>();
    refreshWorkspaceIamToken.mockReturnValueOnce(deferred.promise);
    const firstController = new AbortController();

    const first = ensureFreshWorkspaceSession(session.accountId, {
      force: true,
      signal: firstController.signal,
    });
    const second = ensureFreshWorkspaceSession(session.accountId, { force: true });

    expect(refreshWorkspaceIamToken).toHaveBeenCalledTimes(1);
    firstController.abort();

    await expect(first).rejects.toMatchObject({ name: "AbortError" });

    deferred.resolve({
      accessToken: tokenWithClaims({
        user_uuid: USER_UUID,
        project_id: PROJECT_ID,
        exp: 1_900_000_100,
      }),
      refreshToken: "refresh-token-after-abort",
      raw: {},
    });

    await expect(second).resolves.toMatchObject({
      accountId: session.accountId,
      refreshToken: "refresh-token-after-abort",
    });
    expect(useWorkspaceAuthStore.getState().getCurrentSession()).toMatchObject({
      accountId: session.accountId,
      refreshToken: "refresh-token-after-abort",
    });
  });

  it("refreshes only the requested Workspace account id", async () => {
    const firstSession = storeWorkspaceSession(
      createWorkspaceSession({
        accountId: "workspace.example.com:project-a:user-a",
        projectId: "project-a",
        userUuid: "user-a",
        accessToken: tokenWithClaims({
          user_uuid: "user-a",
          project_id: "project-a",
          exp: 1,
        }),
        refreshToken: "refresh-token-a",
      }),
    );
    const secondSession = storeWorkspaceSession(
      createWorkspaceSession({
        accountId: "workspace.example.com:project-b:user-b",
        projectId: "project-b",
        userUuid: "user-b",
        accessToken: tokenWithClaims({
          user_uuid: "user-b",
          project_id: "project-b",
          exp: 1,
        }),
        refreshToken: "refresh-token-b",
      }),
    );
    refreshWorkspaceIamToken.mockResolvedValueOnce({
      accessToken: tokenWithClaims({
        user_uuid: "user-a",
        project_id: "project-a",
        exp: 1_900_000_100,
      }),
      refreshToken: "refresh-token-a-next",
      raw: {},
    });

    const refreshedSession = await ensureFreshWorkspaceSession(firstSession.accountId, {
      force: true,
    });

    expect(refreshWorkspaceIamToken).toHaveBeenCalledWith(
      { refreshToken: "refresh-token-a" },
      expect.objectContaining({
        tokenUrl:
          "https://workspace.example.com/api/core/v1/iam/clients/default/actions/get_token/invoke",
      }),
    );
    expect(useWorkspaceAuthStore.getState().sessions).toEqual([
      expect.objectContaining({
        accountId: firstSession.accountId,
        refreshToken: "refresh-token-a-next",
      }),
      secondSession,
    ]);
    expect(refreshedSession).toBe(
      useWorkspaceAuthStore
        .getState()
        .sessions.find((session) => session.accountId === firstSession.accountId),
    );
  });

  it("keeps the previous refresh token when IAM refresh omits a new one", async () => {
    const session = await loginAndGetCurrentSession();
    refreshWorkspaceIamToken.mockResolvedValueOnce({
      accessToken: tokenWithClaims({
        user_uuid: USER_UUID,
        project_id: PROJECT_ID,
        exp: 1_900_000_100,
      }),
      raw: {},
    });

    await ensureFreshWorkspaceSession(session.accountId, { force: true });

    expect(useWorkspaceAuthStore.getState().getCurrentSession()).toMatchObject({
      accessToken: expect.any(String),
      refreshToken: "refresh-token",
    });
  });

  it("refreshes the Workspace session when IAM refresh omits the project claim", async () => {
    const session = await loginAndGetCurrentSession();
    refreshWorkspaceIamToken.mockResolvedValueOnce({
      accessToken: tokenWithClaims({
        user_uuid: USER_UUID,
        exp: 1_900_000_100,
      }),
      refreshToken: "refresh-token-without-project",
      raw: {},
    });

    await expect(ensureFreshWorkspaceSession(session.accountId, { force: true })).resolves.toEqual(
      expect.objectContaining({
        accountId: session.accountId,
        projectId: PROJECT_ID,
        userUuid: USER_UUID,
        refreshToken: "refresh-token-without-project",
      }),
    );

    expect(deleteWorkspaceMessengerOwnerCache).not.toHaveBeenCalled();
    expect(deleteWorkspaceUserOwnerCache).not.toHaveBeenCalled();
    expect(useWorkspaceAuthStore.getState().sessions).toEqual([
      expect.objectContaining({
        accountId: session.accountId,
        projectId: PROJECT_ID,
        userUuid: USER_UUID,
        refreshToken: "refresh-token-without-project",
      }),
    ]);
  });

  it("classifies IAM refresh rejection as refresh-expired", () => {
    const failure = classifyWorkspaceAuthRefreshError(
      new WorkspaceIamAuthError("Workspace IAM token request failed", 400, {
        error: "invalid_grant",
      }),
    );

    expect(failure).toMatchObject({ reason: "refresh-expired", status: 400 });
  });

  it("keeps generic IAM 400 refresh wording transient", () => {
    const failure = classifyWorkspaceAuthRefreshError(
      new WorkspaceIamAuthError("Workspace IAM token request failed", 400, {
        message: "refresh token expired unauthorized forbidden",
      }),
    );

    expect(failure).toMatchObject({ reason: "transient-failed" });
  });

  it("keeps the Workspace session after the first invalid_grant refresh rejection", async () => {
    const session = await loginAndGetCurrentSession();
    refreshWorkspaceIamToken.mockRejectedValueOnce(
      new WorkspaceIamAuthError("Workspace IAM token request failed", 400, {
        error: "invalid_grant",
      }),
    );

    await expect(
      ensureFreshWorkspaceSession(session.accountId, { force: true }),
    ).rejects.toBeInstanceOf(WorkspaceIamAuthError);

    expect(deleteWorkspaceMessengerOwnerCache).not.toHaveBeenCalled();
    expect(deleteWorkspaceUserOwnerCache).not.toHaveBeenCalled();
    expect(useWorkspaceAuthStore.getState().sessions).toEqual([session]);
  });

  it("removes the Workspace session after repeated invalid_grant refresh rejections", async () => {
    const session = await loginAndGetCurrentSession();
    refreshWorkspaceIamToken.mockRejectedValue(
      new WorkspaceIamAuthError("Workspace IAM token request failed", 400, {
        error: "invalid_grant",
      }),
    );

    await expect(
      ensureFreshWorkspaceSession(session.accountId, { force: true }),
    ).rejects.toBeInstanceOf(WorkspaceIamAuthError);
    await expect(
      ensureFreshWorkspaceSession(session.accountId, { force: true }),
    ).rejects.toBeInstanceOf(WorkspaceIamAuthError);
    await expect(
      ensureFreshWorkspaceSession(session.accountId, { force: true }),
    ).rejects.toBeInstanceOf(WorkspaceIamAuthError);

    expect(deleteWorkspaceMessengerOwnerCache).toHaveBeenCalledWith(ownerKeyFromSession(session));
    expect(deleteWorkspaceUserOwnerCache).toHaveBeenCalledWith(ownerKeyFromSession(session));
    expect(useWorkspaceAuthStore.getState().sessions).toEqual([]);
  });

  it("resets refresh-expired attempts after a transient IAM 400", async () => {
    const session = await loginAndGetCurrentSession();
    refreshWorkspaceIamToken
      .mockRejectedValueOnce(
        new WorkspaceIamAuthError("Workspace IAM token request failed", 400, {
          error: "invalid_grant",
        }),
      )
      .mockRejectedValueOnce(
        new WorkspaceIamAuthError("Workspace IAM token request failed", 400, {
          message: "refresh token expired unauthorized forbidden",
        }),
      )
      .mockRejectedValueOnce(
        new WorkspaceIamAuthError("Workspace IAM token request failed", 400, {
          error: "invalid_grant",
        }),
      )
      .mockRejectedValueOnce(
        new WorkspaceIamAuthError("Workspace IAM token request failed", 400, {
          error: "invalid_grant",
        }),
      );

    await expect(
      ensureFreshWorkspaceSession(session.accountId, { force: true }),
    ).rejects.toBeInstanceOf(WorkspaceIamAuthError);
    await expect(
      ensureFreshWorkspaceSession(session.accountId, { force: true }),
    ).rejects.toBeInstanceOf(WorkspaceIamAuthError);
    await expect(
      ensureFreshWorkspaceSession(session.accountId, { force: true }),
    ).rejects.toBeInstanceOf(WorkspaceIamAuthError);
    await expect(
      ensureFreshWorkspaceSession(session.accountId, { force: true }),
    ).rejects.toBeInstanceOf(WorkspaceIamAuthError);

    expect(deleteWorkspaceMessengerOwnerCache).not.toHaveBeenCalled();
    expect(deleteWorkspaceUserOwnerCache).not.toHaveBeenCalled();
    expect(useWorkspaceAuthStore.getState().sessions).toEqual([session]);
  });

  it("resets refresh-expired attempts after a successful refresh", async () => {
    const session = await loginAndGetCurrentSession();
    refreshWorkspaceIamToken
      .mockRejectedValueOnce(
        new WorkspaceIamAuthError("Workspace IAM token request failed", 400, {
          error: "invalid_grant",
        }),
      )
      .mockResolvedValueOnce({
        accessToken: tokenWithClaims({
          user_uuid: USER_UUID,
          project_id: PROJECT_ID,
          exp: 1_900_000_100,
        }),
        refreshToken: "refresh-token-after-success",
        raw: {},
      })
      .mockRejectedValueOnce(
        new WorkspaceIamAuthError("Workspace IAM token request failed", 400, {
          error: "invalid_grant",
        }),
      );

    await expect(
      ensureFreshWorkspaceSession(session.accountId, { force: true }),
    ).rejects.toBeInstanceOf(WorkspaceIamAuthError);
    await expect(ensureFreshWorkspaceSession(session.accountId, { force: true })).resolves.toEqual(
      expect.objectContaining({
        accountId: session.accountId,
        refreshToken: "refresh-token-after-success",
      }),
    );
    await expect(
      ensureFreshWorkspaceSession(session.accountId, { force: true }),
    ).rejects.toBeInstanceOf(WorkspaceIamAuthError);

    expect(deleteWorkspaceMessengerOwnerCache).not.toHaveBeenCalled();
    expect(deleteWorkspaceUserOwnerCache).not.toHaveBeenCalled();
    expect(useWorkspaceAuthStore.getState().getCurrentSession()).toMatchObject({
      accountId: session.accountId,
      refreshToken: "refresh-token-after-success",
    });
  });

  it("waits for Workspace messenger owner cache cleanup before explicit session removal", async () => {
    const session = await loginAndGetCurrentSession();
    const draftDisposal = createDeferred();
    const cacheCleanup = createDeferred();
    disposeWorkspaceComposerDraftOwner.mockReturnValueOnce(draftDisposal.promise);
    deleteWorkspaceMessengerOwnerCache.mockReturnValueOnce(cacheCleanup.promise);

    const removal = removeWorkspaceSession(session.accountId);

    expect(disposeWorkspaceComposerDraftOwner).toHaveBeenCalledWith(ownerKeyFromSession(session));
    expect(deleteWorkspaceMessengerOwnerCache).not.toHaveBeenCalled();
    expect(useWorkspaceAuthStore.getState().sessions).toEqual([session]);

    draftDisposal.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(deleteWorkspaceMessengerOwnerCache).toHaveBeenCalledWith(ownerKeyFromSession(session));
    expect(deleteWorkspaceUserOwnerCache).toHaveBeenCalledWith(ownerKeyFromSession(session));
    expect(
      disposeWorkspaceComposerDraftOwner.mock.invocationCallOrder[0] ?? Number.NEGATIVE_INFINITY,
    ).toBeLessThan(
      deleteWorkspaceMessengerOwnerCache.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    expect(useWorkspaceAuthStore.getState().sessions).toEqual([session]);

    cacheCleanup.resolve();
    await removal;

    expect(useWorkspaceAuthStore.getState().sessions).toEqual([]);
  });

  it("does not clean the Workspace messenger cache for an unknown account id", async () => {
    const session = await loginAndGetCurrentSession();

    await removeWorkspaceSession("missing-account");

    expect(deleteWorkspaceMessengerOwnerCache).not.toHaveBeenCalled();
    expect(deleteWorkspaceUserOwnerCache).not.toHaveBeenCalled();
    expect(useWorkspaceAuthStore.getState().sessions).toEqual([session]);
  });

  it("removes an explicit Workspace session even when owner cache cleanup fails", async () => {
    const session = await loginAndGetCurrentSession();
    deleteWorkspaceMessengerOwnerCache.mockRejectedValueOnce(new Error("idb failed"));

    await removeWorkspaceSession(session.accountId);

    expect(deleteWorkspaceMessengerOwnerCache).toHaveBeenCalledWith(ownerKeyFromSession(session));
    expect(deleteWorkspaceUserOwnerCache).toHaveBeenCalledWith(ownerKeyFromSession(session));
    expect(useWorkspaceAuthStore.getState().sessions).toEqual([]);
  });

  it("removes an explicit Workspace session even when user cache cleanup fails", async () => {
    const session = await loginAndGetCurrentSession();
    deleteWorkspaceUserOwnerCache.mockRejectedValueOnce(new Error("idb failed"));

    await removeWorkspaceSession(session.accountId);

    expect(deleteWorkspaceMessengerOwnerCache).toHaveBeenCalledWith(ownerKeyFromSession(session));
    expect(deleteWorkspaceUserOwnerCache).toHaveBeenCalledWith(ownerKeyFromSession(session));
    expect(useWorkspaceAuthStore.getState().sessions).toEqual([]);
  });

  it("cleans only the mismatched Workspace session when refresh returns another user", async () => {
    const session = await loginAndGetCurrentSession();
    const otherSession = storeWorkspaceSession(
      createWorkspaceSession({
        accountId:
          "workspace.example.com:22222222-2222-4222-8222-222222222222:44444444-4444-4444-8444-444444444444",
        instanceId: "instance-other",
        userUuid: "44444444-4444-4444-8444-444444444444",
        login: "other@example.com",
      }),
    );
    refreshWorkspaceIamToken.mockResolvedValueOnce({
      accessToken: tokenWithClaims({
        user_uuid: "33333333-3333-4333-8333-333333333333",
        project_id: PROJECT_ID,
      }),
      refreshToken: "refresh-token-next",
      raw: {},
    });

    await expect(
      ensureFreshWorkspaceSession(session.accountId, { force: true }),
    ).rejects.toMatchObject({ code: "owner-mismatch" });

    expect(deleteWorkspaceMessengerOwnerCache).toHaveBeenCalledWith(ownerKeyFromSession(session));
    expect(deleteWorkspaceUserOwnerCache).toHaveBeenCalledWith(ownerKeyFromSession(session));
    expect(useWorkspaceAuthStore.getState().sessions).toEqual([
      expect.objectContaining({
        accountId: otherSession.accountId,
        userUuid: otherSession.userUuid,
        refreshToken: otherSession.refreshToken,
      }),
    ]);
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

    await expect(
      ensureFreshWorkspaceSession(session.accountId, { force: true }),
    ).rejects.toMatchObject({ code: "owner-mismatch" });

    expect(deleteWorkspaceMessengerOwnerCache).toHaveBeenCalledWith(ownerKeyFromSession(session));
    expect(deleteWorkspaceUserOwnerCache).toHaveBeenCalledWith(ownerKeyFromSession(session));
    expect(useWorkspaceAuthStore.getState().sessions).toEqual([]);
  });

  it("removes a repeatedly refresh-expired Workspace session even when owner cache cleanup fails", async () => {
    const session = await loginAndGetCurrentSession();
    refreshWorkspaceIamToken.mockRejectedValue(
      new WorkspaceIamAuthError("Workspace IAM token request failed", 401, {
        error: "invalid_token",
      }),
    );
    deleteWorkspaceMessengerOwnerCache.mockRejectedValueOnce(new Error("idb failed"));

    await expect(
      ensureFreshWorkspaceSession(session.accountId, { force: true }),
    ).rejects.toBeInstanceOf(WorkspaceIamAuthError);
    await expect(
      ensureFreshWorkspaceSession(session.accountId, { force: true }),
    ).rejects.toBeInstanceOf(WorkspaceIamAuthError);
    await expect(
      ensureFreshWorkspaceSession(session.accountId, { force: true }),
    ).rejects.toBeInstanceOf(WorkspaceIamAuthError);

    expect(deleteWorkspaceMessengerOwnerCache).toHaveBeenCalledWith(ownerKeyFromSession(session));
    expect(deleteWorkspaceUserOwnerCache).toHaveBeenCalledWith(ownerKeyFromSession(session));
    expect(useWorkspaceAuthStore.getState().sessions).toEqual([]);
  });
});
