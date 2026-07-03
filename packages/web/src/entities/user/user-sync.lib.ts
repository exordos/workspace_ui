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
import {
  getUser as defaultGetUser,
  getUsers as defaultGetUsers,
} from "~/shared/api/messenger-client";
import type { MessengerClientOptions } from "~/shared/api/messenger-client";
import { isWorkspaceMessengerUserDto } from "~/shared/api/messenger.types";
import type { WorkspaceMessengerUserDto } from "~/shared/api/messenger.types";
import { adaptWorkspaceMessengerUserDto } from "./user-adapters.lib";
import { useUsersStore } from "./user.model";
import type { UsersStoreState } from "./user.model";

export type UserSyncResult =
  | { status: "applied" }
  | { status: "skipped"; reason: "stale-owner" }
  | { status: "failed"; error: string };

export type UserRequestOptionsOverrides = Pick<
  MessengerClientOptions,
  "baseUrl" | "devTargetOrigin" | "fetchImpl" | "projectId"
>;

export interface UserSyncClientDeps {
  getUsers?: (options: MessengerClientOptions) => Promise<WorkspaceMessengerUserDto[]>;
  getUser?: (
    options: MessengerClientOptions,
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
}

export interface RefreshUsersOptions extends UserSyncRuntimeGuardOptions {
  runtimeContext: WorkspaceRuntimeContext;
  client?: Pick<UserSyncClientDeps, "getUsers">;
  clientOptions?: UserRequestOptionsOverrides;
  store?: UsersStoreApi;
}

export interface LoadUserByUuidOptions extends UserSyncRuntimeGuardOptions {
  runtimeContext: WorkspaceRuntimeContext;
  client?: Pick<UserSyncClientDeps, "getUser">;
  clientOptions?: UserRequestOptionsOverrides;
  store?: UsersStoreApi;
}

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
): MessengerClientOptions {
  const projectId = overrides?.projectId?.trim();
  const devTargetOrigin = overrides?.devTargetOrigin?.trim();

  return {
    ...overrides,
    accessToken: runtimeContext.accessToken,
    devTargetOrigin:
      devTargetOrigin != null && devTargetOrigin.length > 0
        ? devTargetOrigin
        : runtimeContext.organizationOrigin,
    projectId: projectId != null && projectId.length > 0 ? projectId : runtimeContext.projectId,
    signal,
  };
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

function validateWorkspaceMessengerUsersDto(usersDto: WorkspaceMessengerUserDto[]): Error | null {
  const invalidIndex = usersDto.findIndex((userDto) => !isWorkspaceMessengerUserDto(userDto));
  if (invalidIndex >= 0) {
    return new TypeError(`Expected valid messenger users response item at index ${invalidIndex}`);
  }
  return null;
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

  const validationError = validateWorkspaceMessengerUsersDto(usersDto);
  if (validationError != null) {
    return markUsersSyncError(validationError, options);
  }

  const users = usersDto.map(adaptWorkspaceMessengerUserDto);
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
    if (!state.upsertUserForOwner(ownerKey, adaptWorkspaceMessengerUserDto(userDto))) {
      return { status: "skipped", reason: "stale-owner" };
    }
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
