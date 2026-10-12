import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUsersStore } from "~/entities/user/user.model";
import {
  useWorkspaceAuthStore,
  type WorkspaceAuthSession,
} from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { MessengerApiError } from "~/shared/api/messenger-transport.internal";
import type { WorkspaceMessengerUserDto } from "~/shared/api/messenger.types";
import type { OwnProfile, OwnProfileApi } from "~/shared/api/own-profile.types";
import { removeOwnAvatar, updateOwnProfile, uploadOwnAvatar } from "./user-profile.api";

const uploadUserAvatarMock = vi.hoisted(() => vi.fn());
const resetUserAvatarMock = vi.hoisted(() => vi.fn());
const getUserMock = vi.hoisted(() => vi.fn());
const writeUsersToCacheForOwnerMock = vi.hoisted(() => vi.fn());

vi.mock("~/shared/api/workspace-client", () => ({
  getUser: (...args: unknown[]) => getUserMock(...args),
  uploadUserAvatar: (...args: unknown[]) => uploadUserAvatarMock(...args),
  resetUserAvatar: (...args: unknown[]) => resetUserAvatarMock(...args),
}));

vi.mock("~/entities/user/user-sync.lib", () => ({
  writeUsersToCacheForOwner: (...args: unknown[]) => writeUsersToCacheForOwnerMock(...args),
}));

const USER_UUID = "11111111-1111-4111-8111-111111111111";
const DATE = "2026-07-29T10:00:00Z";

function createSession(accountId = "account-a"): WorkspaceAuthSession {
  return {
    accountId,
    instanceId: "instance-a",
    organizationId: "workspace.example.com",
    organizationOrigin: "https://workspace.example.com",
    projectId: "project-a",
    userUuid: USER_UUID,
    login: "alice@example.com",
    accessToken: "access-token",
    runtimeGeneration: 1,
    profile: {
      uuid: USER_UUID,
      username: "alice",
      firstName: "Alice",
      lastName: null,
      email: "alice@example.com",
      status: "active",
    },
  };
}

function runtimeContext(session: WorkspaceAuthSession): WorkspaceRuntimeContext {
  return {
    accountId: session.accountId,
    instanceId: session.instanceId,
    organizationId: session.organizationId,
    organizationOrigin: session.organizationOrigin,
    projectId: session.projectId,
    userUuid: session.userUuid,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    runtimeGeneration: session.runtimeGeneration,
  };
}

function createUserDto(avatar: string): WorkspaceMessengerUserDto {
  return {
    uuid: USER_UUID,
    username: "alice",
    source: "iam",
    avatar,
    status: "active",
    status_emoji: null,
    status_text: null,
    first_name: "Alice",
    last_name: null,
    email: "alice@example.com",
    last_ping_at: DATE,
    created_at: DATE,
    updated_at: DATE,
  };
}

describe("Workspace own avatar API", () => {
  let session: WorkspaceAuthSession;
  let runtime: WorkspaceRuntimeContext;

  beforeEach(() => {
    session = createSession();
    runtime = runtimeContext(session);
    useWorkspaceAuthStore.setState({
      currentAccountId: session.accountId,
      runtimeGeneration: session.runtimeGeneration,
      sessions: [session],
    });
    useUsersStore.getState().startOwnerSync(workspaceRuntimeOwnerKey(runtime));
    uploadUserAvatarMock.mockReset();
    resetUserAvatarMock.mockReset();
    writeUsersToCacheForOwnerMock.mockReset();
    getUserMock.mockReset();
  });

  afterEach(() => {
    useWorkspaceAuthStore.setState({
      currentAccountId: null,
      runtimeGeneration: 0,
      sessions: [],
    });
    useUsersStore.getState().clear();
  });

  const profile: OwnProfile = {
    uuid: USER_UUID,
    username: "alice",
    firstName: "Alicia",
    lastName: null,
    email: "alice@example.com",
    phone: "+123",
    description: "About",
  };
  function profileApi(): OwnProfileApi {
    return { load: vi.fn().mockResolvedValue(profile), update: vi.fn().mockResolvedValue(profile) };
  }

  it("saves IAM identity and refreshes Workspace store/cache without changing generation", async () => {
    const api = profileApi();
    getUserMock.mockResolvedValue({
      ...createUserDto("urn:gravatar:" + "a".repeat(32)),
      first_name: "Alicia",
    });
    await expect(
      updateOwnProfile(runtime, { firstName: "Alicia" }, undefined, api),
    ).resolves.toEqual({
      ok: true,
      profile,
      refreshPending: false,
    });
    expect(useWorkspaceAuthStore.getState().getCurrentSession()?.profile.firstName).toBe("Alicia");
    expect(useWorkspaceAuthStore.getState().getCurrentRuntimeContext()?.runtimeGeneration).toBe(
      runtime.runtimeGeneration,
    );
    expect(useUsersStore.getState().usersById[USER_UUID]?.displayName).toBe("Alicia");
    expect(writeUsersToCacheForOwnerMock).toHaveBeenCalledWith(workspaceRuntimeOwnerKey(runtime), [
      expect.objectContaining({ firstName: "Alicia" }),
    ]);
  });

  it("reports saved-but-not-refreshed when Workspace is unavailable or returns old identity", async () => {
    getUserMock.mockRejectedValueOnce(new Error("Unavailable"));
    await expect(
      updateOwnProfile(runtime, { firstName: "Alicia" }, undefined, profileApi()),
    ).resolves.toMatchObject({
      ok: true,
      refreshPending: true,
    });
    getUserMock.mockResolvedValueOnce(createUserDto("urn:gravatar:" + "a".repeat(32)));
    await expect(
      updateOwnProfile(runtime, { firstName: "Alicia" }, undefined, profileApi()),
    ).resolves.toMatchObject({
      ok: true,
      refreshPending: true,
    });
    expect(useWorkspaceAuthStore.getState().getCurrentSession()?.profile.firstName).toBe("Alicia");
    expect(writeUsersToCacheForOwnerMock).not.toHaveBeenCalled();
  });

  it("rejects a profile save response after leaving and returning to the same account", async () => {
    let resolve: (value: OwnProfile) => void = (_value: OwnProfile) => {
      throw new Error("Missing resolver");
    };
    const api = profileApi();
    api.update = () =>
      new Promise((done) => {
        resolve = done;
      });
    const pending = updateOwnProfile(runtime, { firstName: "Alicia" }, undefined, api);
    useWorkspaceAuthStore.getState().setCurrentAccountId(null);
    useWorkspaceAuthStore.getState().setCurrentAccountId(runtime.accountId);
    resolve(profile);
    await expect(pending).resolves.toEqual({ ok: false, kind: "stale" });
    expect(useWorkspaceAuthStore.getState().getCurrentSession()?.profile.firstName).toBe("Alice");
    expect(getUserMock).not.toHaveBeenCalled();
    expect(writeUsersToCacheForOwnerMock).not.toHaveBeenCalled();
  });

  it("uploads an avatar and immediately updates the owner-scoped user store", async () => {
    const avatar = "urn:image:33333333-3333-4333-8333-333333333333";
    uploadUserAvatarMock.mockResolvedValue(createUserDto(avatar));
    const file = new File(["avatar"], "avatar.png", { type: "image/png" });

    await expect(uploadOwnAvatar(runtime, file)).resolves.toEqual({
      ok: true,
      avatarUrl: avatar,
    });

    expect(uploadUserAvatarMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "access-token",
        projectId: "project-a",
      }),
      USER_UUID,
      file,
    );
    expect(useUsersStore.getState().usersById[USER_UUID]?.avatarUrl).toBe(avatar);
    expect(writeUsersToCacheForOwnerMock).toHaveBeenCalledWith(workspaceRuntimeOwnerKey(runtime), [
      expect.objectContaining({ uuid: USER_UUID, avatarUrl: avatar }),
    ]);
  });

  it("keeps the default avatar returned by reset instead of clearing it locally", async () => {
    const avatar = "urn:gravatar:0123456789abcdef0123456789abcdef";
    resetUserAvatarMock.mockResolvedValue(createUserDto(avatar));

    await expect(removeOwnAvatar(runtime)).resolves.toEqual({
      ok: true,
      avatarUrl: avatar,
    });

    expect(useUsersStore.getState().usersById[USER_UUID]?.avatarUrl).toBe(avatar);
  });

  it("does not apply an avatar response after switching Workspace owner", async () => {
    let resolveUpload: ((value: WorkspaceMessengerUserDto) => void) | undefined;
    uploadUserAvatarMock.mockReturnValue(
      new Promise<WorkspaceMessengerUserDto>((resolve) => {
        resolveUpload = resolve;
      }),
    );
    const file = new File(["avatar"], "avatar.png", { type: "image/png" });
    const request = uploadOwnAvatar(runtime, file);

    const otherSession = createSession("account-b");
    useWorkspaceAuthStore.setState({
      currentAccountId: otherSession.accountId,
      runtimeGeneration: otherSession.runtimeGeneration,
      sessions: [otherSession],
    });
    resolveUpload?.(createUserDto("urn:image:33333333-3333-4333-8333-333333333333"));

    await expect(request).resolves.toMatchObject({ ok: false, kind: "transient" });
    expect(useUsersStore.getState().usersById[USER_UUID]).toBeUndefined();
    expect(writeUsersToCacheForOwnerMock).not.toHaveBeenCalled();
  });

  it("maps server validation failures to an invalid avatar result", async () => {
    uploadUserAvatarMock.mockRejectedValue(
      new MessengerApiError("Invalid avatar", 422, { error: "invalid" }),
    );

    await expect(
      uploadOwnAvatar(runtime, new File(["bad"], "avatar.svg", { type: "image/svg+xml" })),
    ).resolves.toEqual({
      ok: false,
      kind: "invalid",
      message: "Invalid avatar",
    });
  });
});
