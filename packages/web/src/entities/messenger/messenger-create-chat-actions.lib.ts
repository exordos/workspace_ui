import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
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
  createStreamWithDefaultTopic as defaultCreateStreamWithDefaultTopic,
} from "~/shared/api/messenger-streams.api";
import type { WorkspaceMessengerCreateStreamWithDefaultTopicResult } from "~/shared/api/messenger-streams.api";
import type {
  WorkspaceMessengerAddStreamBindingsRequestBody,
  WorkspaceMessengerCreateStreamRequestBody,
  WorkspaceMessengerStreamBindingDto,
} from "~/shared/api/messenger.types";
import {
  adaptMessengerStream,
  adaptMessengerStreamBinding,
  adaptMessengerTopic,
} from "./messenger-adapters.lib";
import {
  buildMessengerRequestOptions,
  type MessengerRequestOptionsOverrides,
} from "./messenger-request-options.lib";
import { useMessengerStore } from "./messenger.model";
import type { MessengerStoreState } from "./messenger.model";
import type {
  MessengerStream,
  MessengerStreamBinding,
  MessengerTopic,
  MessengerUuid,
} from "./messenger.types";

export interface MessengerCreateChatClientDeps {
  createStreamWithDefaultTopic?: (
    options: MessengerClientOptions,
    body: WorkspaceMessengerCreateStreamRequestBody,
  ) => Promise<WorkspaceMessengerCreateStreamWithDefaultTopicResult>;
  addStreamUsers?: (
    options: MessengerClientOptions,
    streamUuid: MessengerUuid,
    body: WorkspaceMessengerAddStreamBindingsRequestBody,
  ) => Promise<WorkspaceMessengerStreamBindingDto[]>;
}

export interface MessengerCreateChatStoreApi {
  getState: () => Pick<
    MessengerStoreState,
    "upsertStream" | "upsertTopic" | "upsertStreamBindings"
  >;
}

export interface MessengerCreateChatBaseOptions {
  runtimeContext: WorkspaceRuntimeContext;
  getRuntimeContext?: WorkspaceRuntimeContextGetter;
  clientOptions?: MessengerRequestOptionsOverrides;
  client?: MessengerCreateChatClientDeps;
  signal?: AbortSignal;
  store?: MessengerCreateChatStoreApi;
}

export interface MessengerCreateChatSkippedResult {
  status: "skipped";
  ownerKey: string | null;
  reason: "missing-context" | "stale-owner";
}

export type MessengerCreateStreamResult =
  | {
      status: "applied";
      ownerKey: string;
      stream: MessengerStream;
      defaultTopic: MessengerTopic;
      streamBindings: MessengerStreamBinding[];
    }
  | MessengerCreateChatSkippedResult;

export interface CreateWorkspaceChannelOptions extends MessengerCreateChatBaseOptions {
  name: string;
  description?: string;
  inviteOnly?: boolean;
  announce?: boolean;
  memberUserUuids?: readonly MessengerUuid[];
}

export interface CreateWorkspaceDirectStreamOptions extends MessengerCreateChatBaseOptions {
  directUserUuid: MessengerUuid;
  name?: string;
  description?: string;
}

export interface RunWorkspaceChannelCreateOptions {
  name?: string;
  description?: string;
  inviteOnly?: boolean;
  announce?: boolean;
  memberUserUuids?: readonly MessengerUuid[];
}

export interface RunWorkspaceDirectStreamCreateOptions {
  directUserUuid: MessengerUuid;
  name?: string;
  description?: string;
}

function captureCreateChatAction(
  runtimeContext: WorkspaceRuntimeContext,
  getRuntimeContext: WorkspaceRuntimeContextGetter,
  signal: AbortSignal | undefined,
): { ownerKey: string; isStale: () => boolean } | { ownerKey: null; isStale: () => boolean } {
  const requestContext = captureWorkspaceRuntimeRequestContext(() => runtimeContext);
  if (requestContext == null) {
    return { ownerKey: null, isStale: () => true };
  }

  return {
    ownerKey: workspaceRuntimeOwnerKey(requestContext),
    isStale: () => isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal),
  };
}

function getCurrentRuntimeContext(): WorkspaceRuntimeContext | null {
  return useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
}

function currentRuntimeActionOptions(): Pick<
  MessengerCreateChatBaseOptions,
  "runtimeContext" | "getRuntimeContext"
> | null {
  const runtimeContext = getCurrentRuntimeContext();
  if (runtimeContext == null) return null;
  return {
    runtimeContext,
    getRuntimeContext: getCurrentRuntimeContext,
  };
}

function skippedMissingContext(): MessengerCreateChatSkippedResult {
  return { status: "skipped", ownerKey: null, reason: "missing-context" };
}

function normalizeActionName(name: string | undefined): string | null {
  const trimmed = name?.trim();
  return trimmed != null && trimmed.length > 0 ? trimmed : null;
}

function nativeStreamBody(input: {
  name: string;
  description: string;
  inviteOnly?: boolean;
  announce?: boolean;
  directUserUuid?: MessengerUuid;
}): WorkspaceMessengerCreateStreamRequestBody {
  return {
    name: input.name,
    description: input.description,
    source_name: "native",
    source: { kind: "native" },
    ...(input.inviteOnly !== undefined ? { invite_only: input.inviteOnly } : {}),
    ...(input.announce !== undefined ? { announce: input.announce } : {}),
    ...(input.directUserUuid != null ? { direct_user_uuid: input.directUserUuid } : {}),
  };
}

function uniqueMemberUserUuids(userUuids: readonly MessengerUuid[] | undefined): MessengerUuid[] {
  const seen = new Set<MessengerUuid>();
  const result: MessengerUuid[] = [];
  for (const userUuid of userUuids ?? []) {
    const trimmed = userUuid.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

export async function createWorkspaceChannel({
  runtimeContext,
  getRuntimeContext = () => runtimeContext,
  clientOptions,
  client = {},
  signal,
  store = useMessengerStore,
  name,
  description = "",
  inviteOnly,
  announce,
  memberUserUuids,
}: CreateWorkspaceChannelOptions): Promise<MessengerCreateStreamResult> {
  const action = captureCreateChatAction(runtimeContext, getRuntimeContext, signal);
  if (action.ownerKey == null) return skippedMissingContext();
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  const requestOptions = buildMessengerRequestOptions(runtimeContext, clientOptions, signal);
  const bundle = await (client.createStreamWithDefaultTopic ?? defaultCreateStreamWithDefaultTopic)(
    requestOptions,
    nativeStreamBody({
      name,
      description,
      inviteOnly,
      announce,
    }),
  );
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  const stream = adaptMessengerStream(bundle.stream);
  const defaultTopic = adaptMessengerTopic(bundle.defaultTopic);

  const members = uniqueMemberUserUuids(memberUserUuids).filter(
    (userUuid) => userUuid !== runtimeContext.userUuid,
  );
  let streamBindings: MessengerStreamBinding[] = [];
  if (members.length > 0) {
    const bindingDtos = await (client.addStreamUsers ?? defaultAddStreamUsers)(
      requestOptions,
      stream.uuid,
      { member: members },
    );
    if (action.isStale())
      return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

    streamBindings = bindingDtos.map(adaptMessengerStreamBinding);
  }

  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  store.getState().upsertStream(action.ownerKey, stream);
  store.getState().upsertTopic(action.ownerKey, defaultTopic);
  if (streamBindings.length > 0) {
    store.getState().upsertStreamBindings(action.ownerKey, streamBindings);
  }

  return { status: "applied", ownerKey: action.ownerKey, stream, defaultTopic, streamBindings };
}

export async function createWorkspaceDirectStream({
  runtimeContext,
  getRuntimeContext = () => runtimeContext,
  clientOptions,
  client = {},
  signal,
  store = useMessengerStore,
  directUserUuid,
  name = "Direct",
  description = "Private workspace",
}: CreateWorkspaceDirectStreamOptions): Promise<MessengerCreateStreamResult> {
  const action = captureCreateChatAction(runtimeContext, getRuntimeContext, signal);
  if (action.ownerKey == null) return skippedMissingContext();
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  const requestOptions = buildMessengerRequestOptions(runtimeContext, clientOptions, signal);
  const bundle = await (client.createStreamWithDefaultTopic ?? defaultCreateStreamWithDefaultTopic)(
    requestOptions,
    nativeStreamBody({
      name,
      description,
      directUserUuid,
    }),
  );
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  const stream = adaptMessengerStream(bundle.stream);
  const defaultTopic = adaptMessengerTopic(bundle.defaultTopic);

  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  store.getState().upsertStream(action.ownerKey, stream);
  store.getState().upsertTopic(action.ownerKey, defaultTopic);
  return { status: "applied", ownerKey: action.ownerKey, stream, defaultTopic, streamBindings: [] };
}

export async function runWorkspaceChannelCreate(
  options: RunWorkspaceChannelCreateOptions,
): Promise<MessengerCreateStreamResult> {
  const runtimeOptions = currentRuntimeActionOptions();
  const name = normalizeActionName(options.name);
  if (runtimeOptions == null || name == null) return skippedMissingContext();
  return createWorkspaceChannel({
    ...runtimeOptions,
    name,
    description: options.description?.trim() ?? "",
    inviteOnly: options.inviteOnly,
    announce: options.announce,
    memberUserUuids: options.memberUserUuids,
  });
}

export async function runWorkspaceDirectStreamCreate(
  options: RunWorkspaceDirectStreamCreateOptions,
): Promise<MessengerCreateStreamResult> {
  const runtimeOptions = currentRuntimeActionOptions();
  if (runtimeOptions == null) return skippedMissingContext();
  return createWorkspaceDirectStream({
    ...runtimeOptions,
    directUserUuid: options.directUserUuid,
    name: options.name,
    description: options.description,
  });
}
