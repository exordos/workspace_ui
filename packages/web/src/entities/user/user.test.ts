import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import type { WorkspaceMessengerUserDto } from "~/shared/api/messenger.types";
import type {
  WorkspaceRealtimeEventContext,
  WorkspaceRealtimeRuntimeOwner,
} from "~/shared/lib/workspace-realtime/workspace-realtime-runtime.lib";
import { adaptWorkspaceMessengerUserDto } from "./user-adapters.lib";
import { createUserRealtimeApplier } from "./user-realtime-applier.lib";
import {
  resolveUserPresenceVisual,
  selectOnlineUserCount,
  selectUserDisplayName,
  selectUsersByIds,
} from "./user-selectors.lib";
import { applyBootstrapUsers, loadUserByUuid, refreshUsers } from "./user-sync.lib";
import { startWorkspacePresenceReporter } from "./user-workspace-presence-reporter.lib";
import { useUsersStore } from "./user.model";
import type { User, UserUuid } from "./user.types";

const USER_A_UUID = "11111111-1111-4111-8111-111111111111";
const USER_B_UUID = "22222222-2222-4222-8222-222222222222";
const USER_C_UUID = "33333333-3333-4333-8333-333333333333";
const DATE_1 = "2026-07-01T10:00:00Z";
const DATE_2 = "2026-07-01T11:00:00Z";
const DATE_3 = "2026-07-01T12:00:00Z";
const OWNER_A_KEY = workspaceRuntimeOwnerKey(createRuntimeContext());
const OWNER_B_KEY = workspaceRuntimeOwnerKey(
  createRuntimeContext({
    accountId: "account-b",
    instanceId: "instance-b",
    organizationId: "organization-b",
    projectId: "55555555-5555-4555-8555-555555555555",
    userUuid: USER_B_UUID,
    accessToken: "access-token-b",
  }),
);

function createRuntimeContext(
  overrides: Partial<WorkspaceRuntimeContext> = {},
): WorkspaceRuntimeContext {
  return {
    accountId: "account-a",
    instanceId: "instance-a",
    organizationId: "organization-a",
    organizationOrigin: "https://org-a.example.test",
    projectId: "44444444-4444-4444-8444-444444444444",
    userUuid: USER_A_UUID,
    accessToken: "access-token-a",
    runtimeGeneration: 1,
    ...overrides,
  };
}

function createUser(overrides: Partial<User> & { uuid?: UserUuid } = {}): User {
  const uuid = overrides.uuid ?? USER_A_UUID;
  return {
    uuid,
    username: "alice",
    firstName: "Alice",
    lastName: "Smith",
    displayName: "Alice Smith",
    email: "alice@example.com",
    avatarUrl: null,
    status: "active",
    statusEmoji: null,
    statusText: null,
    lastPingAt: DATE_1,
    createdAt: DATE_1,
    updatedAt: DATE_1,
    ...overrides,
  };
}

function createUserDto(
  overrides: Partial<WorkspaceMessengerUserDto> & { uuid?: string } = {},
): WorkspaceMessengerUserDto {
  return {
    uuid: overrides.uuid ?? USER_A_UUID,
    username: "alice",
    source: "iam",
    status: "active",
    status_emoji: "test_tube",
    status_text: "Testing",
    first_name: "Alice",
    last_name: "Smith",
    email: "alice@example.com",
    last_ping_at: DATE_2,
    created_at: DATE_1,
    updated_at: DATE_2,
    ...overrides,
  };
}

function resetStore() {
  useUsersStore.getState().clear();
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function createRealtimeOwner(
  overrides: Partial<WorkspaceRealtimeRuntimeOwner> = {},
): WorkspaceRealtimeRuntimeOwner {
  return {
    accountId: "account-a",
    instanceId: "instance-a",
    organizationId: "organization-a",
    projectId: "44444444-4444-4444-8444-444444444444",
    userUuid: USER_A_UUID,
    runtimeGeneration: 1,
    ...overrides,
  };
}

function createRealtimeContext(
  owner = createRealtimeOwner(),
  overrides: Partial<WorkspaceRealtimeEventContext> = {},
): WorkspaceRealtimeEventContext {
  return {
    owner,
    ownerKey: workspaceRuntimeOwnerKey(owner),
    surface: "active",
    source: "websocket",
    ...overrides,
  };
}

describe("useUsersStore", () => {
  beforeEach(resetStore);
  afterEach(resetStore);

  it("replaceUsers replaces state and stores load metadata", () => {
    useUsersStore.getState().upsertUser(createUser({ uuid: USER_C_UUID }));

    useUsersStore
      .getState()
      .replaceUsers([createUser({ uuid: USER_A_UUID }), createUser({ uuid: USER_B_UUID })], 100);

    const state = useUsersStore.getState();
    expect(state.userIds).toEqual([USER_A_UUID, USER_B_UUID]);
    expect(state.usersById[USER_C_UUID]).toBeUndefined();
    expect(state.loadStatus).toBe("ready");
    expect(state.lastLoadedAt).toBe(100);
    expect(state.lastRefreshedAt).toBe(100);
  });

  it("upsertUser inserts and updates by uuid", () => {
    useUsersStore.getState().upsertUser(createUser({ displayName: "Alice Smith" }), 200);
    useUsersStore
      .getState()
      .upsertUser(createUser({ displayName: "Alice Updated", updatedAt: DATE_2 }), 300);

    const state = useUsersStore.getState();
    expect(state.getUser(USER_A_UUID)?.displayName).toBe("Alice Updated");
    expect(state.userIds).toEqual([USER_A_UUID]);
    expect(state.lastRefreshedAt).toBe(300);
  });

  it("upsertUsers inserts a batch and dedupes userIds", () => {
    useUsersStore
      .getState()
      .upsertUsers(
        [
          createUser({ uuid: USER_A_UUID, displayName: "Alice" }),
          createUser({ uuid: USER_B_UUID, displayName: "Bob" }),
          createUser({ uuid: USER_A_UUID, displayName: "Alice Fresh", updatedAt: DATE_2 }),
        ],
        400,
      );

    const state = useUsersStore.getState();
    expect(state.userIds).toEqual([USER_A_UUID, USER_B_UUID]);
    expect(state.getUser(USER_A_UUID)?.displayName).toBe("Alice Fresh");
    expect(state.lastRefreshedAt).toBe(400);
  });

  it("does not let older updatedAt overwrite a newer profile", () => {
    useUsersStore.getState().upsertUser(createUser({ displayName: "Fresh", updatedAt: DATE_3 }));
    useUsersStore.getState().upsertUser(createUser({ displayName: "Stale", updatedAt: DATE_1 }));

    expect(useUsersStore.getState().getUser(USER_A_UUID)?.displayName).toBe("Fresh");
  });

  it("dedupes replaceUsers by uuid and keeps the freshest duplicate", () => {
    useUsersStore
      .getState()
      .replaceUsers([
        createUser({ uuid: USER_A_UUID, displayName: "Fresh", updatedAt: DATE_2 }),
        createUser({ uuid: USER_A_UUID, displayName: "Stale", updatedAt: DATE_1 }),
      ]);

    const state = useUsersStore.getState();
    expect(state.userIds).toEqual([USER_A_UUID]);
    expect(state.getUser(USER_A_UUID)?.displayName).toBe("Fresh");
  });

  it("does not let an older replaceUsers payload overwrite a newer stored profile", () => {
    useUsersStore.getState().upsertUser(createUser({ displayName: "Fresh", updatedAt: DATE_3 }));
    useUsersStore
      .getState()
      .replaceUsers([createUser({ displayName: "Stale", updatedAt: DATE_1 })], 500);

    const state = useUsersStore.getState();
    expect(state.getUser(USER_A_UUID)?.displayName).toBe("Fresh");
    expect(state.userIds).toEqual([USER_A_UUID]);
    expect(state.lastLoadedAt).toBe(500);
    expect(state.lastRefreshedAt).toBe(500);
  });

  it("markOffline updates only existing users", () => {
    useUsersStore.getState().upsertUser(createUser({ status: "active", updatedAt: DATE_1 }));
    useUsersStore.getState().markOffline(USER_A_UUID, Date.parse(DATE_2));
    useUsersStore.getState().markOffline(USER_B_UUID, Date.parse(DATE_2));

    const state = useUsersStore.getState();
    expect(state.getUser(USER_A_UUID)?.status).toBe("offline");
    expect(state.getUser(USER_B_UUID)).toBeUndefined();
    expect(state.userIds).toEqual([USER_A_UUID]);
  });

  it("setLoadStatus and clear reset load state", () => {
    useUsersStore.getState().setLoadStatus("error", "network");
    expect(useUsersStore.getState().loadStatus).toBe("error");
    expect(useUsersStore.getState().error).toBe("network");

    useUsersStore.getState().clear();
    expect(useUsersStore.getState().loadStatus).toBe("idle");
    expect(useUsersStore.getState().error).toBeNull();
    expect(useUsersStore.getState().userIds).toEqual([]);
  });

  it("clears users when owner changes before the next response arrives", () => {
    useUsersStore.getState().startOwnerSync(OWNER_A_KEY);
    useUsersStore.getState().replaceUsersForOwner(OWNER_A_KEY, [createUser({ uuid: USER_A_UUID })]);

    useUsersStore.getState().startOwnerSync(OWNER_B_KEY);

    const state = useUsersStore.getState();
    expect(state.ownerKey).toBe(OWNER_B_KEY);
    expect(state.userIds).toEqual([]);
    expect(state.usersById).toEqual({});
    expect(state.loadStatus).toBe("loading");
  });

  it("ignores stale owner writes after the store switches owner", () => {
    useUsersStore.getState().startOwnerSync(OWNER_A_KEY);
    useUsersStore.getState().startOwnerSync(OWNER_B_KEY);

    const applied = useUsersStore
      .getState()
      .replaceUsersForOwner(OWNER_A_KEY, [createUser({ uuid: USER_A_UUID })]);

    expect(applied).toBe(false);
    expect(useUsersStore.getState().ownerKey).toBe(OWNER_B_KEY);
    expect(useUsersStore.getState().userIds).toEqual([]);
  });
});

describe("user adapters", () => {
  it("adapts Workspace user DTO fields", () => {
    const user = adaptWorkspaceMessengerUserDto(createUserDto());

    expect(user).toMatchObject({
      uuid: USER_A_UUID,
      username: "alice",
      firstName: "Alice",
      lastName: "Smith",
      displayName: "Alice Smith",
      email: "alice@example.com",
      avatarUrl: null,
      status: "active",
      statusEmoji: "test_tube",
      statusText: "Testing",
      lastPingAt: DATE_2,
      createdAt: DATE_1,
      updatedAt: DATE_2,
    });
  });

  it("falls back to username when first and last name are missing", () => {
    const user = adaptWorkspaceMessengerUserDto(
      createUserDto({
        username: "fallback-name",
        first_name: " ",
        last_name: null,
      }),
    );

    expect(user.displayName).toBe("fallback-name");
  });

  it("keeps nullable Workspace profile fields as null", () => {
    const user = adaptWorkspaceMessengerUserDto(
      createUserDto({
        first_name: null,
        last_name: null,
        email: null,
        status_emoji: null,
        status_text: null,
      }),
    );

    expect(user.firstName).toBeNull();
    expect(user.lastName).toBeNull();
    expect(user.email).toBeNull();
    expect(user.statusEmoji).toBeNull();
    expect(user.statusText).toBeNull();
  });

  it("defaults missing custom status fields to null", () => {
    const dto = createUserDto();
    delete dto.status_emoji;
    delete dto.status_text;

    const user = adaptWorkspaceMessengerUserDto(dto);

    expect(user.statusEmoji).toBeNull();
    expect(user.statusText).toBeNull();
  });
});

describe("user sync", () => {
  beforeEach(resetStore);
  afterEach(resetStore);

  it("refreshes users through the Workspace users endpoint", async () => {
    const runtimeContext = createRuntimeContext();
    const getUsers = vi.fn(() =>
      Promise.resolve([
        createUserDto({ uuid: USER_A_UUID }),
        createUserDto({ uuid: USER_B_UUID, username: "bob", first_name: "Bob" }),
      ]),
    );

    await expect(
      refreshUsers({
        runtimeContext,
        getRuntimeContext: () => runtimeContext,
        client: { getUsers },
      }),
    ).resolves.toEqual({ status: "applied" });

    const state = useUsersStore.getState();
    expect(state.loadStatus).toBe("ready");
    expect(state.error).toBeNull();
    expect(state.userIds).toEqual([USER_A_UUID, USER_B_UUID]);
    expect(state.getUser(USER_B_UUID)?.displayName).toBe("Bob Smith");
    expect(getUsers).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "access-token-a",
        devTargetOrigin: "https://org-a.example.test",
      }),
    );
  });

  it("stores refresh errors without changing the current users", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
    useUsersStore.getState().startOwnerSync(ownerKey);
    useUsersStore.getState().replaceUsersForOwner(ownerKey, [createUser({ uuid: USER_A_UUID })]);

    await expect(
      refreshUsers({
        runtimeContext,
        getRuntimeContext: () => runtimeContext,
        client: { getUsers: () => Promise.reject(new Error("users unavailable")) },
      }),
    ).resolves.toEqual({ status: "failed", error: "users unavailable" });

    const state = useUsersStore.getState();
    expect(state.loadStatus).toBe("error");
    expect(state.error).toBe("users unavailable");
    expect(state.userIds).toEqual([USER_A_UUID]);
  });

  it("leaves a new owner empty with an error when users request fails", async () => {
    const runtimeA = createRuntimeContext();
    const runtimeB = createRuntimeContext({
      accountId: "account-b",
      instanceId: "instance-b",
      organizationId: "organization-b",
      projectId: "55555555-5555-4555-8555-555555555555",
      userUuid: USER_B_UUID,
      accessToken: "access-token-b",
    });
    const ownerA = workspaceRuntimeOwnerKey(runtimeA);
    const ownerB = workspaceRuntimeOwnerKey(runtimeB);
    useUsersStore.getState().startOwnerSync(ownerA);
    useUsersStore.getState().replaceUsersForOwner(ownerA, [createUser({ uuid: USER_A_UUID })]);

    await expect(
      refreshUsers({
        runtimeContext: runtimeB,
        getRuntimeContext: () => runtimeB,
        client: { getUsers: () => Promise.reject(new Error("users unavailable")) },
      }),
    ).resolves.toEqual({ status: "failed", error: "users unavailable" });

    const state = useUsersStore.getState();
    expect(state.ownerKey).toBe(ownerB);
    expect(state.userIds).toEqual([]);
    expect(state.usersById[USER_A_UUID]).toBeUndefined();
    expect(state.loadStatus).toBe("error");
    expect(state.error).toBe("users unavailable");
  });

  it("rejects legacy numeric ids before applying bootstrap users", () => {
    const legacyUserDto = {
      ...createUserDto(),
      uuid: 123,
    } as unknown as WorkspaceMessengerUserDto;

    expect(applyBootstrapUsers([legacyUserDto])).toEqual({
      status: "failed",
      error: "Expected valid messenger users response item at index 0",
    });

    const state = useUsersStore.getState();
    expect(state.userIds).toEqual([]);
    expect(state.loadStatus).toBe("error");
    expect(state.error).toBe("Expected valid messenger users response item at index 0");
  });

  it("loads one user by uuid and upserts it", async () => {
    const runtimeContext = createRuntimeContext();
    const getUser = vi.fn(() =>
      Promise.resolve(createUserDto({ uuid: USER_B_UUID, username: "bob", first_name: "Bob" })),
    );

    await expect(
      loadUserByUuid(
        {
          runtimeContext,
          getRuntimeContext: () => runtimeContext,
          client: { getUser },
        },
        USER_B_UUID,
      ),
    ).resolves.toEqual({ status: "applied" });

    expect(useUsersStore.getState().loadStatus).toBe("ready");
    expect(useUsersStore.getState().getUser(USER_B_UUID)?.username).toBe("bob");
    expect(getUser).toHaveBeenCalledWith(expect.any(Object), USER_B_UUID);
  });

  it("does not apply a refresh response after the runtime owner changes", async () => {
    const runtimeA = createRuntimeContext();
    const runtimeB = createRuntimeContext({
      accountId: "account-b",
      instanceId: "instance-b",
      organizationId: "organization-b",
      projectId: "55555555-5555-4555-8555-555555555555",
      userUuid: USER_B_UUID,
      accessToken: "access-token-b",
    });
    let currentContext = runtimeA;
    const usersRequest = createDeferred<WorkspaceMessengerUserDto[]>();

    const refresh = refreshUsers({
      runtimeContext: runtimeA,
      getRuntimeContext: () => currentContext,
      client: { getUsers: () => usersRequest.promise },
    });

    currentContext = runtimeB;
    usersRequest.resolve([createUserDto({ uuid: USER_A_UUID })]);

    await expect(refresh).resolves.toEqual({ status: "skipped", reason: "stale-owner" });
    expect(useUsersStore.getState().userIds).toEqual([]);
  });

  it("does not apply a bootstrap users response for a stale owner", () => {
    useUsersStore.getState().startOwnerSync(OWNER_A_KEY);
    useUsersStore.getState().startOwnerSync(OWNER_B_KEY);

    expect(
      applyBootstrapUsers([createUserDto({ uuid: USER_A_UUID })], { ownerKey: OWNER_A_KEY }),
    ).toEqual({ status: "skipped", reason: "stale-owner" });

    expect(useUsersStore.getState().ownerKey).toBe(OWNER_B_KEY);
    expect(useUsersStore.getState().userIds).toEqual([]);
  });
});

describe("user realtime applier", () => {
  beforeEach(resetStore);
  afterEach(resetStore);

  it("applies user.updated events to users store", () => {
    const applier = createUserRealtimeApplier();
    useUsersStore.getState().startOwnerSync(workspaceRuntimeOwnerKey(createRealtimeOwner()));
    const user = createUserDto({ status: "idle", status_text: "Focus" });

    applier.applyEvent(
      {
        epoch_version: 10,
        type: "user",
        kind: "user.updated",
        user,
      },
      createRealtimeContext(),
    );

    expect(useUsersStore.getState().getUser(USER_A_UUID)).toEqual(
      expect.objectContaining({
        uuid: USER_A_UUID,
        displayName: "Alice Smith",
        status: "idle",
        statusText: "Focus",
      }),
    );
  });

  it("skips user.updated when owner is stale or signal is aborted", () => {
    const applier = createUserRealtimeApplier({
      isOwnerCurrent: (owner) => owner.runtimeGeneration === 2,
    });
    const owner = createRealtimeOwner({ runtimeGeneration: 1 });

    applier.applyEvent(
      {
        epoch_version: 10,
        type: "user",
        kind: "user.updated",
        user: createUserDto({ username: "stale" }),
      },
      createRealtimeContext(owner),
    );

    const controller = new AbortController();
    controller.abort();
    applier.applyEvent(
      {
        epoch_version: 11,
        type: "user",
        kind: "user.updated",
        user: createUserDto({ username: "aborted" }),
      },
      createRealtimeContext(createRealtimeOwner({ runtimeGeneration: 2 }), {
        signal: controller.signal,
      }),
    );

    expect(useUsersStore.getState().userIds).toEqual([]);
  });

  it("skips background user.updated events for another owner", () => {
    const activeOwner = createRealtimeOwner();
    const backgroundOwner = createRealtimeOwner({
      accountId: "account-b",
      instanceId: "instance-b",
      organizationId: "organization-b",
      projectId: "55555555-5555-4555-8555-555555555555",
      userUuid: USER_B_UUID,
    });
    const applier = createUserRealtimeApplier();
    useUsersStore.getState().startOwnerSync(workspaceRuntimeOwnerKey(activeOwner));

    applier.applyEvent(
      {
        epoch_version: 12,
        type: "user",
        kind: "user.updated",
        user: createUserDto({ uuid: USER_B_UUID, username: "background" }),
      },
      createRealtimeContext(backgroundOwner, { surface: "background" }),
    );

    expect(useUsersStore.getState().userIds).toEqual([]);
  });

  it("skips active user.updated events for a stale owner key", () => {
    const activeOwner = createRealtimeOwner();
    const staleOwner = createRealtimeOwner({
      accountId: "account-b",
      instanceId: "instance-b",
      organizationId: "organization-b",
      projectId: "55555555-5555-4555-8555-555555555555",
      userUuid: USER_B_UUID,
    });
    const applier = createUserRealtimeApplier();
    useUsersStore.getState().startOwnerSync(workspaceRuntimeOwnerKey(activeOwner));

    applier.applyEvent(
      {
        epoch_version: 13,
        type: "user",
        kind: "user.updated",
        user: createUserDto({ uuid: USER_B_UUID, username: "stale" }),
      },
      createRealtimeContext(staleOwner),
    );

    expect(useUsersStore.getState().userIds).toEqual([]);
  });
});

describe("workspace presence reporter", () => {
  it("reports active presence on start and interval until cleanup", async () => {
    vi.useFakeTimers();
    type InvokePresence = NonNullable<
      Parameters<typeof startWorkspacePresenceReporter>[0]["invokePresence"]
    >;
    const invokePresence = vi.fn<InvokePresence>(() => Promise.resolve());

    try {
      const cleanup = startWorkspacePresenceReporter({
        clientOptions: { accessToken: "access-token" },
        userUuid: USER_A_UUID,
        reportIntervalMs: 1_000,
        invokePresence,
      });

      expect(invokePresence).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(3_000);
      expect(invokePresence).toHaveBeenCalledTimes(4);

      cleanup();
      await vi.advanceTimersByTimeAsync(3_000);
      expect(invokePresence).toHaveBeenCalledTimes(4);
      expect(invokePresence.mock.calls[0]![0].signal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("user selectors", () => {
  it("resolves display name with username and fallback", () => {
    expect(selectUserDisplayName(createUser({ displayName: "Alice Smith" }))).toBe("Alice Smith");
    expect(selectUserDisplayName(createUser({ displayName: " ", username: "alice" }))).toBe(
      "alice",
    );
    expect(selectUserDisplayName(null, "Missing")).toBe("Missing");
  });

  it("maps presence status to visual state", () => {
    expect(resolveUserPresenceVisual("active")).toBe("active");
    expect(resolveUserPresenceVisual("idle")).toBe("idle");
    expect(resolveUserPresenceVisual("do_not_disturb")).toBe("idle");
    expect(resolveUserPresenceVisual("offline")).toBe("offline");
    expect(resolveUserPresenceVisual(null)).toBeNull();
  });

  it("selects users by ids without creating phantom users", () => {
    const usersById = {
      [USER_A_UUID]: createUser({ uuid: USER_A_UUID }),
      [USER_B_UUID]: createUser({ uuid: USER_B_UUID }),
    };

    expect(selectUsersByIds(usersById, [USER_B_UUID, USER_C_UUID, USER_A_UUID])).toEqual([
      usersById[USER_B_UUID],
      usersById[USER_A_UUID],
    ]);
  });

  it("counts only active users as online", () => {
    const usersById = {
      [USER_A_UUID]: createUser({ uuid: USER_A_UUID, status: "active" }),
      [USER_B_UUID]: createUser({ uuid: USER_B_UUID, status: "idle" }),
      [USER_C_UUID]: createUser({ uuid: USER_C_UUID, status: "do_not_disturb" }),
    };

    expect(selectOnlineUserCount(usersById, [USER_A_UUID, USER_B_UUID, USER_C_UUID])).toBe(1);
  });
});
