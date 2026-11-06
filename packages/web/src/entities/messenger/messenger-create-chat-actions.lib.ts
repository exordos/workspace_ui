import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import {
  captureWorkspaceRuntimeRequestContext,
  isWorkspaceRuntimeRequestInvalidated,
  workspaceRuntimeOwnerKey,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContextGetter } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import type {
  MessengerClientOptions,
  MessengerCollectionPage,
  MessengerPaginationQuery,
} from "~/shared/api/messenger-client";
import {
  addStreamUsers as defaultAddStreamUsers,
  getStreamsPage as defaultGetStreamsPage,
  createStreamWithDefaultTopic as defaultCreateStreamWithDefaultTopic,
} from "~/shared/api/messenger-streams.api";
import type { WorkspaceMessengerCreateStreamWithDefaultTopicResult } from "~/shared/api/messenger-streams.api";
import { getStreamTopicsPage as defaultGetStreamTopicsPage } from "~/shared/api/messenger-topics.api";
import type { GetStreamTopicsQuery } from "~/shared/api/messenger-topics.api";
import type {
  WorkspaceMessengerAddStreamBindingsRequestBody,
  WorkspaceMessengerCreateStreamRequestBody,
  WorkspaceMessengerStreamBindingDto,
  WorkspaceMessengerStreamDto,
  WorkspaceMessengerTopicDto,
} from "~/shared/api/messenger.types";
import { isWorkspaceMessengerMessagePayloadDto } from "~/shared/api/messenger.types";
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
  getStreamsPage?: (
    options: MessengerClientOptions,
    query: MessengerPaginationQuery,
  ) => Promise<MessengerCollectionPage<WorkspaceMessengerStreamDto>>;
  getStreamTopicsPage?: (
    options: MessengerClientOptions,
    query: GetStreamTopicsQuery,
  ) => Promise<MessengerCollectionPage<WorkspaceMessengerTopicDto>>;
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

interface PreparedEncryptedChannelCreation {
  inputIdentity: string;
  metadata: ChatInitialKeyMetadata;
}

type EncryptedChannelCreationState =
  | { phase: "idle" }
  | (PreparedEncryptedChannelCreation & { phase: "prepared" | "dispatched" })
  | (PreparedEncryptedChannelCreation & {
      phase: "resolved";
      bundle: WorkspaceMessengerCreateStreamWithDefaultTopicResult;
    });

/** Keep this object for retries of one user intent, including an ambiguous POST response. */
export interface EncryptedChannelCreationAttempt {
  // Owner binding survives local preparation failures; pending only serializes this intent.
  ownerKey: string | null;
  state: EncryptedChannelCreationState;
  pending: boolean;
}

export interface CreateWorkspaceChannelOptions extends MessengerCreateChatBaseOptions {
  encryption?: boolean;
  encryptionBootstrap?: ChatInitialKeyBootstrap;
  creationAttempt?: EncryptedChannelCreationAttempt;
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
  creationAttempt?: EncryptedChannelCreationAttempt;
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

function initialEncryptionKeyUuid(metadata: ChatInitialKeyMetadata | null) {
  if (metadata === null) return null;
  if (!isWorkspaceMessengerMessagePayloadDto({ kind: "key_announced", key_uuid: metadata.keyUuid }))
    throw new MessengerChannelCreationError("encryption-unavailable");
  return metadata.keyUuid;
}

export async function createWorkspaceChannel(
  options: CreateWorkspaceChannelOptions,
): Promise<MessengerCreateStreamResult> {
  if (!options.encryption) return createWorkspaceChannelAttempt(options);
  const creationAttempt: EncryptedChannelCreationAttempt = options.creationAttempt ?? {
    ownerKey: null,
    state: { phase: "idle" },
    pending: false,
  };
  if (creationAttempt.pending) throw new MessengerChannelCreationError("creation-uncertain");
  creationAttempt.pending = true;
  try {
    return await createWorkspaceChannelAttempt({ ...options, creationAttempt });
  } finally {
    creationAttempt.pending = false;
  }
}

async function recoverEncryptedChannel(
  options: MessengerClientOptions,
  client: MessengerCreateChatClientDeps,
  metadata: ChatInitialKeyMetadata,
  runtime: WorkspaceRuntimeContext,
  isCurrent: () => boolean,
): Promise<WorkspaceMessengerCreateStreamWithDefaultTopicResult> {
  let pageMarker: string | undefined;
  const seen = new Set<string>();
  let stream: WorkspaceMessengerStreamDto | undefined;
  do {
    const page = await (client.getStreamsPage ?? defaultGetStreamsPage)(options, { pageMarker });
    if (!isCurrent()) throw new Error("stale-owner");
    const matches = page.items.filter(
      (item) =>
        item.project_id === runtime.projectId &&
        item.owner === runtime.userUuid &&
        item.user_uuid === runtime.userUuid &&
        item.source_name === "native" &&
        item.direct_user_uuid == null &&
        item.encryption === true &&
        item.current_encryption_key_uuid === metadata.keyUuid,
    );
    for (const candidate of matches) {
      if (stream && stream.uuid !== candidate.uuid)
        throw new MessengerChannelCreationError("creation-uncertain");
      stream = candidate;
    }
    pageMarker = page.nextPageMarker ?? undefined;
    if (pageMarker && seen.has(pageMarker))
      throw new MessengerChannelCreationError("creation-uncertain");
    if (pageMarker) seen.add(pageMarker);
  } while (pageMarker);
  // Absence does not prove the earlier POST rolled back; never dispatch it again.
  if (!stream) throw new MessengerChannelCreationError("creation-uncertain");
  pageMarker = undefined;
  seen.clear();
  do {
    const page = await (client.getStreamTopicsPage ?? defaultGetStreamTopicsPage)(options, {
      streamUuid: stream.uuid,
      pageMarker,
    });
    if (!isCurrent()) throw new Error("stale-owner");
    const defaultTopic = page.items.find(
      (topic) =>
        topic.stream_uuid === stream.uuid &&
        topic.project_id === runtime.projectId &&
        topic.is_default,
    );
    if (defaultTopic) return { stream, defaultTopic };
    pageMarker = page.nextPageMarker ?? undefined;
    if (pageMarker && seen.has(pageMarker))
      throw new MessengerChannelCreationError("creation-uncertain");
    if (pageMarker) seen.add(pageMarker);
  } while (pageMarker);
  throw new MessengerChannelCreationError("creation-uncertain");
}

async function createWorkspaceChannelAttempt({
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
  creationAttempt,
}: CreateWorkspaceChannelOptions): Promise<MessengerCreateStreamResult> {
  const action = captureCreateChatAction(runtimeContext, getRuntimeContext, signal);
  if (action.ownerKey == null) return skippedMissingContext();
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  const inputIdentity = JSON.stringify([
    name,
    description,
    uniqueMemberUserUuids(memberUserUuids).sort(),
  ]);
  if (encryption && creationAttempt) {
    if (
      (creationAttempt.ownerKey !== null && creationAttempt.ownerKey !== action.ownerKey) ||
      ((creationAttempt.state.phase === "dispatched" ||
        creationAttempt.state.phase === "resolved") &&
        creationAttempt.state.inputIdentity !== inputIdentity)
    )
      throw new MessengerChannelCreationError("creation-uncertain");
    creationAttempt.ownerKey = action.ownerKey;
    if (creationAttempt.state.phase === "prepared") {
      creationAttempt.state = { ...creationAttempt.state, inputIdentity };
    }
  }
  let initialKey: ChatInitialKeyMetadata | null =
    creationAttempt && creationAttempt.state.phase !== "idle"
      ? creationAttempt.state.metadata
      : null;
  if (encryption) {
    try {
      initialKey ??= await encryptionBootstrap.prepare({
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
    if (creationAttempt?.state.phase === "idle") {
      creationAttempt.state = {
        phase: "prepared",
        metadata: initialKey,
        inputIdentity,
      };
    }
  }
  const requestOptions = buildMessengerRequestOptions(runtimeContext, clientOptions, signal);
  if (encryption) {
    const fetchImpl = requestOptions.fetchImpl ?? fetch;
    // Session refresh may yield before dispatch; do not send for an invalidated runtime.
    requestOptions.fetchImpl = (request, init) => {
      if (action.isStale()) return Promise.reject(new Error("stale-owner"));
      return fetchImpl(request, init);
    };
  }
  const encryptionKeyUuid = initialEncryptionKeyUuid(initialKey);
  let bundle =
    creationAttempt?.state.phase === "resolved" ? creationAttempt.state.bundle : undefined;
  if (creationAttempt?.state.phase === "dispatched") {
    bundle = await recoverEncryptedChannel(
      requestOptions,
      client,
      creationAttempt.state.metadata,
      runtimeContext,
      () => !action.isStale(),
    );
  }
  if (!bundle) {
    const create =
      client.createStreamWithDefaultTopic ??
      ((options: MessengerClientOptions, body: WorkspaceMessengerCreateStreamRequestBody) =>
        defaultCreateStreamWithDefaultTopic(
          options,
          body,
          encryption
            ? () => {
                if (action.isStale()) throw new Error("stale-owner");
                if (creationAttempt?.state.phase === "prepared")
                  creationAttempt.state = { ...creationAttempt.state, phase: "dispatched" };
              }
            : undefined,
        ));
    // Opaque clients cannot expose the transport boundary; assume dispatch when invoking them.
    if (creationAttempt?.state.phase === "prepared" && client.createStreamWithDefaultTopic) {
      creationAttempt.state = { ...creationAttempt.state, phase: "dispatched" };
    }
    bundle = await create(requestOptions, {
      ...nativeStreamBody({
        name,
        description,
        inviteOnly: encryption ? false : inviteOnly,
        announce: encryption ? false : announce,
      }),
      ...(encryption ? { encryption: true, current_encryption_key_uuid: encryptionKeyUuid } : {}),
    });
  }
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  if (
    encryption &&
    (bundle.stream.encryption !== true ||
      bundle.stream.current_encryption_key_uuid !== encryptionKeyUuid)
  )
    throw new MessengerChannelCreationError("encryption-mismatch");
  if (creationAttempt && creationAttempt.state.phase !== "idle") {
    creationAttempt.state = { ...creationAttempt.state, phase: "resolved", bundle };
  }

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
    creationAttempt: options.creationAttempt,
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
