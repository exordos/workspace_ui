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
import { isWorkspaceMessengerMessagePayloadDto } from "~/shared/api/messenger.types";
import { encodeChatE2eePayload } from "./chat-e2ee-payload-adapters.lib";
import { MessengerChannelCreationError } from "./chat-initial-key-bootstrap.lib";
import { realChatInitialKeyBootstrap } from "./chat-real-key-bootstrap.lib";
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
import type {
  ChatInitialKeyBootstrap,
  ChatInitialKeyMetadata,
} from "./chat-initial-key-bootstrap.lib";
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
  encryption?: boolean;
  encryptionBootstrap?: ChatInitialKeyBootstrap;
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
  encryption?: boolean;
  encryptionBootstrap?: ChatInitialKeyBootstrap;
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

function initialEncryptionKey(metadata: ChatInitialKeyMetadata | null) {
  const announcement =
    metadata === null
      ? null
      : encodeChatE2eePayload({
          kind: "key_announced",
          keyUuid: metadata.keyUuid,
        });
  if (
    announcement !== null &&
    (!isWorkspaceMessengerMessagePayloadDto(announcement) || announcement.kind !== "key_announced")
  )
    throw new MessengerChannelCreationError("encryption-unavailable");
  return announcement?.kind === "key_announced" ? { key_uuid: announcement.key_uuid } : null;
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
  encryption = false,
  encryptionBootstrap = realChatInitialKeyBootstrap,
}: CreateWorkspaceChannelOptions): Promise<MessengerCreateStreamResult> {
  const action = captureCreateChatAction(runtimeContext, getRuntimeContext, signal);
  if (action.ownerKey == null) return skippedMissingContext();
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  let initialKey: ChatInitialKeyMetadata | null = null;
  if (encryption) {
    try {
      initialKey = await encryptionBootstrap.prepare({
        runtimeContext,
        isCurrent: () => !action.isStale(),
        signal,
      });
    } catch (error) {
      if (action.isStale())
        return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };
      throw error;
    }
    if (action.isStale())
      return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };
  }
  const requestOptions = buildMessengerRequestOptions(runtimeContext, clientOptions, signal);
  if (encryption) {
    const fetchImpl = requestOptions.fetchImpl ?? fetch;
    // Session refresh may yield before dispatch; do not send for an invalidated runtime.
    requestOptions.fetchImpl = (request, init) =>
      action.isStale() ? Promise.reject(new Error("stale-owner")) : fetchImpl(request, init);
  }
  const encryptionKey = initialEncryptionKey(initialKey);
  const bundle = await (client.createStreamWithDefaultTopic ?? defaultCreateStreamWithDefaultTopic)(
    requestOptions,
    {
      ...nativeStreamBody({
        name,
        description,
        inviteOnly: encryption ? false : inviteOnly,
        announce: encryption ? false : announce,
      }),
      ...(encryption ? { encryption: true, current_encryption_key: encryptionKey } : {}),
    },
  );
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  if (
    encryption &&
    (bundle.stream.encryption !== true ||
      bundle.stream.current_encryption_key?.key_uuid !== encryptionKey?.key_uuid)
  )
    throw new MessengerChannelCreationError("encryption-mismatch");

  if (initialKey !== null && encryptionBootstrap.finalize) {
    await encryptionBootstrap.finalize({
      runtimeContext,
      metadata: initialKey,
      streamUuid: bundle.stream.uuid,
      isCurrent: () => !action.isStale(),
    });
    if (action.isStale())
      return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };
  }

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
    encryption: options.encryption,
    encryptionBootstrap: options.encryptionBootstrap,
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
