import {
  captureWorkspaceRuntimeRequestContext,
  isWorkspaceRuntimeRequestInvalidated,
  workspaceRuntimeOwnerKey,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContextGetter } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import type { MessengerClientOptions } from "~/shared/api/messenger-client";
import {
  addStreamUsers as defaultAddStreamUsers,
  deleteStreamBinding as defaultDeleteStreamBinding,
} from "~/shared/api/messenger-streams.api";
import type {
  WorkspaceMessengerAddStreamBindingsRequestBody,
  WorkspaceMessengerStreamBindingDto,
} from "~/shared/api/messenger.types";
import { adaptMessengerStreamBinding } from "./messenger-adapters.lib";
import { isMessengerUuid } from "./messenger-ids.lib";
import {
  buildMessengerRequestOptions,
  type MessengerRequestOptionsOverrides,
} from "./messenger-request-options.lib";
import { useMessengerStore } from "./messenger.model";
import type { MessengerStoreState } from "./messenger.model";
import type { MessengerStreamBinding, MessengerUuid } from "./messenger.types";

export type WorkspaceStreamMemberActionErrorCode =
  | "empty-member-list"
  | "invalid-binding-uuid"
  | "invalid-current-user-uuid"
  | "invalid-stream-uuid"
  | "invalid-user-uuid";

export class WorkspaceStreamMemberActionError extends Error {
  readonly code: WorkspaceStreamMemberActionErrorCode;

  constructor(code: WorkspaceStreamMemberActionErrorCode, message: string) {
    super(message);
    this.name = "WorkspaceStreamMemberActionError";
    this.code = code;
  }
}

export interface MessengerStreamMemberActionClientDeps {
  addStreamUsers?: (
    options: MessengerClientOptions,
    streamUuid: MessengerUuid,
    body: WorkspaceMessengerAddStreamBindingsRequestBody,
  ) => Promise<WorkspaceMessengerStreamBindingDto[]>;
  deleteStreamBinding?: (
    options: MessengerClientOptions,
    bindingUuid: MessengerUuid,
  ) => Promise<void>;
}

export interface MessengerStreamMemberActionStoreApi {
  getState: () => Pick<MessengerStoreState, "upsertStreamBindings" | "removeStreamBinding">;
}

export type WorkspaceStreamMemberActionResult =
  | {
      status: "applied";
      ownerKey: string;
      streamUuid: MessengerUuid;
      bindings: MessengerStreamBinding[];
    }
  | {
      status: "applied";
      ownerKey: string;
      streamUuid: MessengerUuid;
      removedBindingUuid: MessengerUuid;
    }
  | {
      status: "skipped";
      ownerKey: string | null;
      reason: "missing-context" | "stale-owner";
    };

export interface AddWorkspaceStreamMembersOptions {
  runtimeContext: WorkspaceRuntimeContext;
  getRuntimeContext?: WorkspaceRuntimeContextGetter;
  clientOptions?: MessengerRequestOptionsOverrides;
  signal?: AbortSignal;
  streamUuid: MessengerUuid;
  userUuids: readonly MessengerUuid[];
  client?: MessengerStreamMemberActionClientDeps;
  store?: MessengerStreamMemberActionStoreApi;
}

export interface RemoveWorkspaceStreamMemberOptions {
  runtimeContext: WorkspaceRuntimeContext;
  getRuntimeContext?: WorkspaceRuntimeContextGetter;
  clientOptions?: MessengerRequestOptionsOverrides;
  signal?: AbortSignal;
  streamUuid: MessengerUuid;
  bindingUuid: MessengerUuid;
  userUuid: MessengerUuid;
  client?: MessengerStreamMemberActionClientDeps;
  store?: MessengerStreamMemberActionStoreApi;
}

function requireMessengerUuid(
  value: MessengerUuid,
  code: WorkspaceStreamMemberActionErrorCode,
  label: string,
): MessengerUuid {
  const trimmed = value.trim();
  if (!isMessengerUuid(trimmed)) {
    throw new WorkspaceStreamMemberActionError(code, `Invalid ${label}`);
  }
  return trimmed;
}

function normalizeMemberUserUuids(userUuids: readonly MessengerUuid[]): MessengerUuid[] {
  if (userUuids.length === 0) {
    throw new WorkspaceStreamMemberActionError(
      "empty-member-list",
      "Workspace stream member list is empty",
    );
  }

  const seen = new Set<MessengerUuid>();
  const result: MessengerUuid[] = [];
  for (const userUuid of userUuids) {
    const normalized = requireMessengerUuid(userUuid, "invalid-user-uuid", "user uuid");
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function captureStreamMemberAction(
  runtimeContext: WorkspaceRuntimeContext,
  getRuntimeContext: WorkspaceRuntimeContextGetter,
  signal: AbortSignal | undefined,
): { ownerKey: string; isStale: () => boolean } | { ownerKey: null; isStale: () => boolean } {
  // Action сам фиксирует runtime перед запросом и сам проверяет stale-состояние.
  // Так widget не собирает request options и не может случайно записать результат
  // в store уже после переключения workspace/account.
  const requestContext = captureWorkspaceRuntimeRequestContext(() => runtimeContext);
  if (requestContext == null) {
    return { ownerKey: null, isStale: () => true };
  }

  return {
    ownerKey: workspaceRuntimeOwnerKey(requestContext),
    isStale: () => isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal),
  };
}

export async function addWorkspaceStreamMembers({
  runtimeContext,
  getRuntimeContext = () => runtimeContext,
  clientOptions,
  signal,
  streamUuid,
  userUuids,
  client = {},
  store = useMessengerStore,
}: AddWorkspaceStreamMembersOptions): Promise<WorkspaceStreamMemberActionResult> {
  const normalizedStreamUuid = requireMessengerUuid(
    streamUuid,
    "invalid-stream-uuid",
    "stream uuid",
  );
  const memberUserUuids = normalizeMemberUserUuids(userUuids);
  const action = captureStreamMemberAction(runtimeContext, getRuntimeContext, signal);
  if (action.ownerKey == null)
    return { status: "skipped", ownerKey: null, reason: "missing-context" };
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  // Первую итерацию делаем без выбора роли: backend contract принимает группы
  // по ролям, а пользовательский сценарий сейчас всегда добавляет обычных member.
  const bindingDtos = await (client.addStreamUsers ?? defaultAddStreamUsers)(
    buildMessengerRequestOptions(runtimeContext, clientOptions, signal),
    normalizedStreamUuid,
    { member: memberUserUuids },
  );
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  const bindings = bindingDtos.map(adaptMessengerStreamBinding);

  store.getState().upsertStreamBindings(action.ownerKey, bindings);
  return {
    status: "applied",
    ownerKey: action.ownerKey,
    streamUuid: normalizedStreamUuid,
    bindings,
  };
}

export async function removeWorkspaceStreamMember({
  runtimeContext,
  getRuntimeContext = () => runtimeContext,
  clientOptions,
  signal,
  streamUuid,
  bindingUuid,
  userUuid,
  client = {},
  store = useMessengerStore,
}: RemoveWorkspaceStreamMemberOptions): Promise<WorkspaceStreamMemberActionResult> {
  requireMessengerUuid(runtimeContext.userUuid, "invalid-current-user-uuid", "current user uuid");
  requireMessengerUuid(userUuid, "invalid-user-uuid", "user uuid");
  const normalizedStreamUuid = requireMessengerUuid(
    streamUuid,
    "invalid-stream-uuid",
    "stream uuid",
  );
  const normalizedBindingUuid = requireMessengerUuid(
    bindingUuid,
    "invalid-binding-uuid",
    "binding uuid",
  );

  const action = captureStreamMemberAction(runtimeContext, getRuntimeContext, signal);
  if (action.ownerKey == null)
    return { status: "skipped", ownerKey: null, reason: "missing-context" };
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  // Self-remove намеренно не блокируем: по правилу Workspace любой участник
  // может отписать сам себя, а запрет удаления чужих не-owner-ом решается выше
  // в проекции `canRemove` и окончательно валидируется backend-ом.
  await (client.deleteStreamBinding ?? defaultDeleteStreamBinding)(
    buildMessengerRequestOptions(runtimeContext, clientOptions, signal),
    normalizedBindingUuid,
  );
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  store.getState().removeStreamBinding(action.ownerKey, {
    uuid: normalizedBindingUuid,
    streamUuid: normalizedStreamUuid,
  });

  return {
    status: "applied",
    ownerKey: action.ownerKey,
    streamUuid: normalizedStreamUuid,
    removedBindingUuid: normalizedBindingUuid,
  };
}
