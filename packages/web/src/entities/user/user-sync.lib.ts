import { buildWorkspaceRequestOptions } from "~/entities/messenger/messenger-request-options.lib";
import {
  captureWorkspaceRuntimeRequestContext,
  isWorkspaceRuntimeRequestInvalidated,
  workspaceRuntimeOwnerKey,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContextGetter } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type {
  WorkspaceRuntimeContext,
  WorkspaceRuntimeRequestContext,
} from "~/entities/workspace-runtime/workspace-runtime.types";
import { isWorkspaceMessengerUserDto } from "~/shared/api/messenger.types";
import type { WorkspaceMessengerUserDto } from "~/shared/api/messenger.types";
import {
  getUser as defaultGetUser,
  getUsers as defaultGetUsers,
} from "~/shared/api/workspace-client";
import type { WorkspaceClientOptions } from "~/shared/api/workspace-client";
import {
  readWorkspaceUserCache as defaultReadWorkspaceUserCache,
  readWorkspaceUserCacheProfile as defaultReadWorkspaceUserCacheProfile,
  replaceWorkspaceUserCache as defaultReplaceWorkspaceUserCache,
  upsertWorkspaceUserCache as defaultUpsertWorkspaceUserCache,
} from "~/shared/lib/workspace-user-cache-db";
import type { WorkspaceUserCacheProfile } from "~/shared/lib/workspace-user-cache-db";
import { adaptWorkspaceMessengerUserDto } from "./user-adapters.lib";
import { useUsersStore } from "./user.model";
import type { UsersStoreState } from "./user.model";
import type { User } from "./user.types";

export type UserSyncResult =
  | { status: "applied" }
  | { status: "skipped"; reason: "stale-owner" }
  | { status: "failed"; error: string };

export type UserCacheHydrateResult = UserSyncResult | { status: "empty" };

export type UserRequestOptionsOverrides = Pick<
  WorkspaceClientOptions,
  "baseUrl" | "devTargetOrigin" | "fetchImpl" | "projectId"
>;

export interface UserSyncClientDeps {
  getUsers?: (options: WorkspaceClientOptions) => Promise<WorkspaceMessengerUserDto[]>;
  getUser?: (
    options: WorkspaceClientOptions,
    userUuid: string,
  ) => Promise<WorkspaceMessengerUserDto>;
}

export interface UsersStoreApi {
  getState: () => Pick<
    UsersStoreState,
    | "ownerKey"
    | "startOwnerSync"
    | "replaceUsers"
    | "replaceUsersForOwner"
    | "upsertUsers"
    | "upsertUsersForOwner"
    | "upsertUser"
    | "upsertUserForOwner"
    | "setLoadStatus"
    | "setLoadStatusForOwner"
  >;
}

export interface UserCacheDeps {
  readUsersCache?: (ownerKey: string) => Promise<readonly WorkspaceUserCacheProfile[]>;
  readUserCacheProfile?: (
    ownerKey: string,
    userUuid: string,
  ) => Promise<WorkspaceUserCacheProfile | null>;
  replaceUsersCache?: (
    ownerKey: string,
    users: readonly WorkspaceUserCacheProfile[],
  ) => Promise<void> | void;
  upsertUsersCache?: (
    ownerKey: string,
    users: readonly WorkspaceUserCacheProfile[],
  ) => Promise<void> | void;
}

interface UserSyncRuntimeGuardOptions {
  ownerKey?: string;
  requestContext?: WorkspaceRuntimeRequestContext | null;
  runtimeContext?: WorkspaceRuntimeContext;
  getRuntimeContext?: WorkspaceRuntimeContextGetter;
  signal?: AbortSignal;
}

export interface ApplyBootstrapUsersOptions extends UserSyncRuntimeGuardOptions {
  mode?: "replace" | "upsert";
  store?: UsersStoreApi;
  cache?: UserCacheDeps;
  writeCache?: boolean;
}

export interface RefreshUsersOptions extends UserSyncRuntimeGuardOptions {
  runtimeContext: WorkspaceRuntimeContext;
  client?: Pick<UserSyncClientDeps, "getUsers">;
  clientOptions?: UserRequestOptionsOverrides;
  store?: UsersStoreApi;
  cache?: UserCacheDeps;
}

export interface LoadUserByUuidOptions extends UserSyncRuntimeGuardOptions {
  runtimeContext: WorkspaceRuntimeContext;
  client?: Pick<UserSyncClientDeps, "getUser">;
  clientOptions?: UserRequestOptionsOverrides;
  store?: UsersStoreApi;
  cache?: UserCacheDeps;
}

export interface HydrateUsersFromCacheOptions extends UserSyncRuntimeGuardOptions {
  store?: UsersStoreApi;
  cache?: Pick<UserCacheDeps, "readUsersCache">;
}

export interface ResolveCachedWorkspaceUserOptions {
  ownerKey: string;
  userUuid: string;
  cache?: Pick<UserCacheDeps, "readUserCacheProfile">;
}

const STALE_CACHE_LAST_PING_AT = "1970-01-01T00:00:00.000Z";

function normalizeUserSyncError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "User sync failed";
}

function buildUserRequestOptions(
  runtimeContext: WorkspaceRuntimeContext,
  overrides?: UserRequestOptionsOverrides,
  signal?: AbortSignal,
): WorkspaceClientOptions {
  return buildWorkspaceRequestOptions(runtimeContext, overrides, signal);
}

function isUserSyncInvalidated({
  requestContext,
  runtimeContext,
  getRuntimeContext,
  signal,
}: UserSyncRuntimeGuardOptions): boolean {
  if (signal?.aborted === true) {
    return true;
  }

  const capturedContext =
    requestContext ??
    (runtimeContext == null ? null : captureWorkspaceRuntimeRequestContext(() => runtimeContext));

  if (capturedContext == null || getRuntimeContext == null) {
    return false;
  }

  return isWorkspaceRuntimeRequestInvalidated(capturedContext, getRuntimeContext, signal);
}

function captureUserSyncRequestContext(
  runtimeContext: WorkspaceRuntimeContext,
): WorkspaceRuntimeRequestContext | null {
  return captureWorkspaceRuntimeRequestContext(() => runtimeContext);
}

function resolveUserSyncOwnerKey(options: UserSyncRuntimeGuardOptions): string | null {
  if (options.ownerKey != null) {
    return options.ownerKey;
  }

  const requestContext =
    options.requestContext ??
    (options.runtimeContext == null
      ? null
      : captureWorkspaceRuntimeRequestContext(() => options.runtimeContext ?? null));

  return requestContext == null ? null : workspaceRuntimeOwnerKey(requestContext);
}

function filterWorkspaceMessengerUsersDto(
  usersDto: WorkspaceMessengerUserDto[],
): WorkspaceMessengerUserDto[] {
  return usersDto.filter(isWorkspaceMessengerUserDto);
}

export function toWorkspaceUserCacheProfile(user: User): WorkspaceUserCacheProfile {
  return {
    uuid: user.uuid,
    username: user.username,
    displayName: user.displayName,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function fromWorkspaceUserCacheProfile(profile: WorkspaceUserCacheProfile): User {
  return {
    uuid: profile.uuid,
    username: profile.username,
    firstName: profile.firstName,
    lastName: profile.lastName,
    displayName: profile.displayName,
    email: profile.email,
    avatarUrl: profile.avatarUrl,
    status: "offline",
    statusEmoji: null,
    statusText: null,
    lastPingAt: STALE_CACHE_LAST_PING_AT,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

function writeUsersCacheBestEffort(write: () => Promise<void> | void): void {
  try {
    const result = write();
    if (result instanceof Promise) {
      void result.catch(() => undefined);
    }
  } catch {
    // Cache failures must not block user sync.
  }
}

function writeUsersCacheSnapshot(
  ownerKey: string | null,
  users: readonly User[],
  options: Pick<ApplyBootstrapUsersOptions, "cache" | "mode" | "writeCache">,
): void {
  if (ownerKey == null || options.writeCache === false) return;

  const profiles = users.map(toWorkspaceUserCacheProfile);
  if (options.mode === "upsert") {
    writeUsersCacheBestEffort(() =>
      (options.cache?.upsertUsersCache ?? defaultUpsertWorkspaceUserCache)(ownerKey, profiles),
    );
    return;
  }

  writeUsersCacheBestEffort(() =>
    (options.cache?.replaceUsersCache ?? defaultReplaceWorkspaceUserCache)(ownerKey, profiles),
  );
}

export function writeUsersToCacheForOwner(
  ownerKey: string,
  users: readonly User[],
  cache?: Pick<UserCacheDeps, "upsertUsersCache">,
): void {
  const profiles = users.map(toWorkspaceUserCacheProfile);
  writeUsersCacheBestEffort(() =>
    (cache?.upsertUsersCache ?? defaultUpsertWorkspaceUserCache)(ownerKey, profiles),
  );
}

export async function resolveCachedWorkspaceUser(
  options: ResolveCachedWorkspaceUserOptions,
): Promise<User | null> {
  const readUserCacheProfile =
    options.cache?.readUserCacheProfile ?? defaultReadWorkspaceUserCacheProfile;
  const cachedProfile = await readUserCacheProfile(options.ownerKey, options.userUuid);
  if (cachedProfile == null) {
    return null;
  }

  // Из кэша берем только профиль. Presence для фонового пути намеренно считаем устаревшим.
  return fromWorkspaceUserCacheProfile(cachedProfile);
}

export async function hydrateUsersFromCache(
  options: HydrateUsersFromCacheOptions,
): Promise<UserCacheHydrateResult> {
  const ownerKey = resolveUserSyncOwnerKey(options);
  if (ownerKey == null) {
    return { status: "skipped", reason: "stale-owner" };
  }
  if (isUserSyncInvalidated(options)) {
    return { status: "skipped", reason: "stale-owner" };
  }

  const readUsersCache = options.cache?.readUsersCache ?? defaultReadWorkspaceUserCache;
  const cachedProfiles = await readUsersCache(ownerKey);
  if (isUserSyncInvalidated(options)) {
    return { status: "skipped", reason: "stale-owner" };
  }
  if (cachedProfiles.length === 0) {
    return { status: "empty" };
  }

  const users = cachedProfiles.map(fromWorkspaceUserCacheProfile);
  const store = options.store ?? useUsersStore;
  const applied = store.getState().upsertUsersForOwner(ownerKey, users);
  if (!applied) {
    return { status: "skipped", reason: "stale-owner" };
  }
  return { status: "applied" };
}

export function markUsersSyncError(
  error: unknown,
  options: UserSyncRuntimeGuardOptions & { store?: UsersStoreApi } = {},
): UserSyncResult {
  if (isUserSyncInvalidated(options)) {
    return { status: "skipped", reason: "stale-owner" };
  }

  const message = normalizeUserSyncError(error);
  const ownerKey = resolveUserSyncOwnerKey(options);
  const store = options.store ?? useUsersStore;
  if (ownerKey != null) {
    const applied = store.getState().setLoadStatusForOwner(ownerKey, "error", message);
    if (!applied) {
      return { status: "skipped", reason: "stale-owner" };
    }
  } else {
    store.getState().setLoadStatus("error", message);
  }
  return { status: "failed", error: message };
}

export function applyBootstrapUsers(
  usersDto: WorkspaceMessengerUserDto[],
  options: ApplyBootstrapUsersOptions = {},
): UserSyncResult {
  if (isUserSyncInvalidated(options)) {
    return { status: "skipped", reason: "stale-owner" };
  }

  const validUsersDto = filterWorkspaceMessengerUsersDto(usersDto);
  if (usersDto.length > 0 && validUsersDto.length === 0) {
    return markUsersSyncError(new TypeError("Expected at least one valid messenger user"), options);
  }

  const users = validUsersDto.map(adaptWorkspaceMessengerUserDto);
  const store = options.store ?? useUsersStore;
  const ownerKey = resolveUserSyncOwnerKey(options);
  if (options.mode === "upsert") {
    const applied =
      ownerKey == null
        ? (store.getState().upsertUsers(users), true)
        : store.getState().upsertUsersForOwner(ownerKey, users);
    if (!applied) {
      return { status: "skipped", reason: "stale-owner" };
    }
  } else {
    const applied =
      ownerKey == null
        ? (store.getState().replaceUsers(users), true)
        : store.getState().replaceUsersForOwner(ownerKey, users);
    if (!applied) {
      return { status: "skipped", reason: "stale-owner" };
    }
  }
  writeUsersCacheSnapshot(ownerKey, users, options);
  return { status: "applied" };
}

export async function refreshUsers(options: RefreshUsersOptions): Promise<UserSyncResult> {
  const store = options.store ?? useUsersStore;
  const requestContext =
    options.requestContext ?? captureUserSyncRequestContext(options.runtimeContext);

  if (
    isUserSyncInvalidated({
      ...options,
      requestContext,
    })
  ) {
    return { status: "skipped", reason: "stale-owner" };
  }
  if (requestContext == null) {
    return { status: "skipped", reason: "stale-owner" };
  }

  const ownerKey = workspaceRuntimeOwnerKey(requestContext);
  store.getState().startOwnerSync(ownerKey);

  try {
    const usersDto = await (options.client?.getUsers ?? defaultGetUsers)(
      buildUserRequestOptions(options.runtimeContext, options.clientOptions, options.signal),
    );

    return applyBootstrapUsers(usersDto, {
      ...options,
      ownerKey,
      requestContext,
      store,
      cache: options.cache,
    });
  } catch (error) {
    return markUsersSyncError(error, {
      ...options,
      ownerKey,
      requestContext,
      store,
    });
  }
}

export async function loadUserByUuid(
  options: LoadUserByUuidOptions,
  userUuid: string,
): Promise<UserSyncResult> {
  const store = options.store ?? useUsersStore;
  const requestContext =
    options.requestContext ?? captureUserSyncRequestContext(options.runtimeContext);

  if (
    isUserSyncInvalidated({
      ...options,
      requestContext,
    })
  ) {
    return { status: "skipped", reason: "stale-owner" };
  }
  if (requestContext == null) {
    return { status: "skipped", reason: "stale-owner" };
  }

  const ownerKey = workspaceRuntimeOwnerKey(requestContext);
  store.getState().startOwnerSync(ownerKey);

  try {
    const userDto = await (options.client?.getUser ?? defaultGetUser)(
      buildUserRequestOptions(options.runtimeContext, options.clientOptions, options.signal),
      userUuid,
    );

    if (
      isUserSyncInvalidated({
        ...options,
        requestContext,
      })
    ) {
      return { status: "skipped", reason: "stale-owner" };
    }

    if (!isWorkspaceMessengerUserDto(userDto)) {
      return markUsersSyncError(new TypeError("Expected valid messenger user response"), {
        ...options,
        ownerKey,
        requestContext,
        store,
      });
    }

    const state = store.getState();
    const user = adaptWorkspaceMessengerUserDto(userDto);
    if (!state.upsertUserForOwner(ownerKey, user)) {
      return { status: "skipped", reason: "stale-owner" };
    }
    writeUsersToCacheForOwner(ownerKey, [user], options.cache);
    if (!store.getState().setLoadStatusForOwner(ownerKey, "ready")) {
      return { status: "skipped", reason: "stale-owner" };
    }
    return { status: "applied" };
  } catch (error) {
    return markUsersSyncError(error, {
      ...options,
      ownerKey,
      requestContext,
      store,
    });
  }
}
