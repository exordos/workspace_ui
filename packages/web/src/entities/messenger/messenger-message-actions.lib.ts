import { useActivityStore } from "~/entities/activity/activity.model";
import { compareWorkspaceMessages } from "~/entities/message/message-workspace-order.lib";
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
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
} from "~/shared/api/messenger-client";
import {
  createMessage as defaultCreateMessage,
  deleteMessage as defaultDeleteMessage,
  editMessage as defaultEditMessage,
  markMessagesReadUpTo as defaultMarkMessagesReadUpTo,
} from "~/shared/api/messenger-messages.api";
import { getStream as defaultGetStream } from "~/shared/api/messenger-streams.api";
import type {
  WorkspaceMessengerStreamDto,
  WorkspaceMessengerCreateMessageRequestBody,
  WorkspaceMessengerMessageDto,
  WorkspaceMessengerUpdateMessageRequestBody,
} from "~/shared/api/messenger.types";
import { decodeChatE2eePayload, encodeChatE2eePayload } from "./chat-e2ee-payload-adapters.lib";
import { adaptMessengerMessage } from "./messenger-adapters.lib";
import {
  messengerMessageActionCache,
  type MessengerMessagePointerCacheTargets,
} from "./messenger-cache.lib";
import {
  captureDeletedMessagePointerRepair,
  repairDeletedMessagePointers,
} from "./messenger-deleted-message-pointer-repair.lib";
import { conversationIdForStream, conversationIdForTopic } from "./messenger-ids.lib";
import {
  createMessengerPlacementUuid,
  normalizeMessengerMessageUuid,
} from "./messenger-message-identity.lib";
import { settleMessengerOutgoingMessage } from "./messenger-outbox.model";
import {
  beginWorkspaceTopicReadCounters,
  rollbackWorkspaceTopicReadCounters,
} from "./messenger-read-actions.lib";
import {
  advanceMessengerReadBoundary,
  type MessengerReadBoundary,
} from "./messenger-read-boundary.lib";
import {
  buildMessengerRequestOptions,
  type MessengerRequestOptionsOverrides,
} from "./messenger-request-options.lib";
import { useMessengerStore } from "./messenger.model";
import type { ChatE2eePayload, ChatEncryptedPayload } from "./chat-e2ee.types";
import type {
  MessengerConversationId,
  MessengerMessage,
  MessengerTopic,
  MessengerUuid,
} from "./messenger.types";

export interface MessengerMessageActionClientDeps {
  getStream?: (
    options: MessengerClientOptions,
    streamUuid: string,
  ) => Promise<WorkspaceMessengerStreamDto>;
  createMessage?: (
    options: MessengerClientOptions,
    body: WorkspaceMessengerCreateMessageRequestBody,
  ) => Promise<WorkspaceMessengerMessageDto>;
  editMessage?: (
    options: MessengerClientOptions,
    messageUuid: string,
    body: WorkspaceMessengerUpdateMessageRequestBody,
  ) => Promise<WorkspaceMessengerMessageDto>;
  deleteMessage?: (options: MessengerClientOptions, messageUuid: string) => Promise<void>;
  getMessagesPage?: (
    options: MessengerClientOptions,
    query: {
      streamUuid: MessengerUuid;
      topicUuid?: MessengerUuid;
      pageLimit: number;
      sortKey: "created_at";
      sortDir: "desc";
    },
  ) => Promise<MessengerCollectionPage<WorkspaceMessengerMessageDto>>;
  markMessagesReadUpTo?: (
    options: MessengerClientOptions,
    messageUuid: string,
  ) => Promise<WorkspaceMessengerMessageDto>;
}

export interface MessengerMessageActionCacheConversationPage {
  messages: readonly MessengerMessage[];
  source: "message-action";
}

export interface MessengerMessageActionCacheWriter {
  advanceReadBoundary?: (boundary: MessengerReadBoundary) => Promise<void> | void;
  patchCachedMessage?: (ownerKey: string, message: MessengerMessage) => Promise<void> | void;
  repairMessagePointers?: (
    ownerKey: string,
    message: MessengerMessage,
    targets: MessengerMessagePointerCacheTargets,
  ) => Promise<void> | void;
  markCachedMessagesRead?: (
    ownerKey: string,
    messageUuids: readonly MessengerUuid[],
  ) => Promise<void> | void;
  deleteCachedMessage?: (
    ownerKey: string,
    messageUuid: MessengerUuid,
    conversationIds: readonly MessengerConversationId[],
  ) => Promise<void> | void;
  writeConversationMessagePage?: (
    ownerKey: string,
    conversationId: MessengerConversationId,
    page: MessengerMessageActionCacheConversationPage,
  ) => Promise<void> | void;
}

export interface MessengerMessageActionStoreApi {
  getState: () => Pick<
    ReturnType<typeof useWorkspaceMessageStore.getState>,
    | "applyLiveCreatedMessage"
    | "applyLiveKnownBodyMutation"
    | "markMessagesReadUpTo"
    | "removeMessage"
    | "messageMutationRevision"
    | "ownerKey"
    | "messagesById"
    | "conversationWindowsById"
  >;
}

export interface MessengerMessageActionBaseOptions {
  runtimeContext: WorkspaceRuntimeContext;
  getRuntimeContext?: WorkspaceRuntimeContextGetter;
  clientOptions?: MessengerRequestOptionsOverrides;
  client?: MessengerMessageActionClientDeps;
  cache?: MessengerMessageActionCacheWriter;
  signal?: AbortSignal;
  store?: MessengerMessageActionStoreApi;
}

export type MessengerMessageActionResult =
  | { status: "applied"; ownerKey: string; message: MessengerMessage | null }
  | { status: "skipped"; ownerKey: string | null; reason: "missing-context" | "stale-owner" };

export interface SendMessengerMessageOptions extends MessengerMessageActionBaseOptions {
  streamUuid: MessengerUuid;
  topicUuid: MessengerUuid;
  markdown: string;
  canonicalMessageUuid?: MessengerUuid;
  includeStreamConversation?: boolean;
}

export type EditMessengerMessageOptions = MessengerMessageActionBaseOptions & {
  messageUuid: MessengerUuid;
  messengerStore?: Pick<typeof useMessengerStore, "getState">;
} & (
    | { markdown: string; encryptedPayload?: never; sourceMessage?: never; isCurrent?: never }
    | {
        markdown?: never;
        encryptedPayload: ChatEncryptedPayload;
        sourceMessage: MessengerMessage;
        isCurrent: () => boolean;
      }
  );

export interface DeleteMessengerMessageOptions extends MessengerMessageActionBaseOptions {
  messageUuid: MessengerUuid;
  streamUuid: MessengerUuid;
  topicUuid: MessengerUuid;
}

export interface MarkMessengerMessageReadOptions extends MessengerMessageActionBaseOptions {
  messageUuid: MessengerUuid;
  conversationIds?: readonly MessengerConversationId[];
}

export interface MarkMessengerMessagesReadUpToOptions extends MessengerMessageActionBaseOptions {
  messageUuid: MessengerUuid;
  conversationIds?: readonly MessengerConversationId[];
}

function captureMessageAction(
  runtimeContext: WorkspaceRuntimeContext,
  getRuntimeContext: WorkspaceRuntimeContextGetter,
  signal: AbortSignal | undefined,
): { ownerKey: string; isStale: () => boolean } | { ownerKey: null; isStale: () => boolean } {
  // Owner guard prevents late responses from a previous org/project from reaching the new chat.
  const requestContext = captureWorkspaceRuntimeRequestContext(() => runtimeContext);
  if (requestContext == null) {
    return { ownerKey: null, isStale: () => true };
  }

  return {
    ownerKey: workspaceRuntimeOwnerKey(requestContext),
    isStale: () => isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal),
  };
}

function conversationIdsForMessageAction(
  message: MessengerMessage,
  includeStreamConversation: boolean,
): MessengerConversationId[] {
  const conversationIds = [message.conversationId];
  const streamConversationId = conversationIdForStream(message.streamUuid);
  if (includeStreamConversation && streamConversationId !== message.conversationId) {
    conversationIds.push(streamConversationId);
  }
  return conversationIds;
}

function conversationIdsForDeletedMessage(
  streamUuid: MessengerUuid,
  topicUuid: MessengerUuid,
): MessengerConversationId[] {
  return [conversationIdForStream(streamUuid), conversationIdForTopic(streamUuid, topicUuid)];
}

async function writeActionCacheBestEffort(write: () => Promise<void> | void): Promise<void> {
  try {
    await write();
  } catch {
    // Cache write failures must not change the action result.
  }
}

async function writeMessagePageCacheBestEffort(
  cache: MessengerMessageActionCacheWriter | undefined,
  ownerKey: string,
  conversationIds: readonly MessengerConversationId[],
  message: MessengerMessage,
  isCurrent: () => boolean = () => true,
): Promise<void> {
  const writeConversationMessagePage = cache?.writeConversationMessagePage;
  if (writeConversationMessagePage == null) return;

  await writeActionCacheBestEffort(async () => {
    await Promise.all(
      conversationIds.map((conversationId) =>
        !isCurrent()
          ? Promise.resolve()
          : Promise.resolve(
              writeConversationMessagePage(ownerKey, conversationId, {
                messages: [message],
                source: "message-action",
              }),
            ),
      ),
    );
  });
}

export async function sendMessengerMessage({
  runtimeContext,
  getRuntimeContext = () => runtimeContext,
  clientOptions,
  client = {},
  cache = messengerMessageActionCache,
  signal,
  store = useWorkspaceMessageStore,
  streamUuid,
  topicUuid,
  markdown,
  canonicalMessageUuid = crypto.randomUUID(),
  includeStreamConversation = false,
}: SendMessengerMessageOptions): Promise<MessengerMessageActionResult> {
  // Sending creates a markdown payload in the Workspace API and applies it to an active tail window.
  const action = captureMessageAction(runtimeContext, getRuntimeContext, signal);
  if (action.ownerKey == null)
    return { status: "skipped", ownerKey: null, reason: "missing-context" };
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  const requestOptions = buildMessengerRequestOptions(runtimeContext, clientOptions, signal);
  const catalog = useMessengerStore.getState();
  const knownStream =
    catalog.ownerKey === action.ownerKey ? catalog.streamsById[streamUuid] : undefined;
  const stream =
    knownStream ?? (await (client.getStream ?? defaultGetStream)(requestOptions, streamUuid));
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };
  if (stream.uuid !== streamUuid || stream.encryption === true) {
    throw new Error("Encrypted chats require an available crypto provider");
  }
  const payload: WorkspaceMessengerCreateMessageRequestBody["payload"] = {
    kind: "markdown",
    content: markdown,
  };
  const dto = await (client.createMessage ?? defaultCreateMessage)(requestOptions, {
    uuid: normalizeMessengerMessageUuid(canonicalMessageUuid),
    stream_uuid: streamUuid,
    topic_uuid: topicUuid,
    payload,
  });
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  const message = adaptMessengerMessage(dto);
  store.getState().applyLiveCreatedMessage(message);
  settleMessengerOutgoingMessage(action.ownerKey, message);
  useMessengerStore
    .getState()
    .applyMessagePointer(action.ownerKey, message, store.getState().messagesById);
  // Cache persistence must not delay the successful send transition in the UI.
  void writeMessagePageCacheBestEffort(
    cache,
    action.ownerKey,
    conversationIdsForMessageAction(message, includeStreamConversation),
    message,
  );
  return { status: "applied", ownerKey: action.ownerKey, message };
}

export interface SendMessengerE2eePayloadOptions extends MessengerMessageActionBaseOptions {
  readonly messengerStore?: Pick<typeof useMessengerStore, "getState">;
  readonly streamUuid: string;
  readonly topicUuid: string;
  readonly payload: ChatE2eePayload;
  // Historical key service messages retain the current stream-generation dispatch guard.
  readonly expectedCurrentKey?: { readonly keyUuid: string };
  // A session may explicitly send with its last locally available generation.
  readonly allowHistoricalKey?: boolean;
  // Only rotation may announce a new generation under the captured previous-key guard.
  readonly rotateKey?: boolean;
  readonly isCurrent: () => boolean;
  readonly canonicalMessageUuid?: string;
  readonly includeStreamConversation?: boolean;
}

/** Dedicated encrypted transport: commits only opaque payloads through existing cache/store paths. */
export async function sendMessengerE2eePayload({
  runtimeContext,
  getRuntimeContext = () => runtimeContext,
  clientOptions,
  client = {},
  cache = messengerMessageActionCache,
  signal,
  store = useWorkspaceMessageStore,
  messengerStore = useMessengerStore,
  streamUuid,
  topicUuid,
  payload,
  expectedCurrentKey,
  allowHistoricalKey = false,
  rotateKey = false,
  isCurrent,
  canonicalMessageUuid = crypto.randomUUID(),
  includeStreamConversation = true,
}: SendMessengerE2eePayloadOptions): Promise<MessengerMessageActionResult> {
  const action = captureMessageAction(runtimeContext, getRuntimeContext, signal);
  const ownerCurrent = () => !action.isStale() && isCurrent();
  if (action.ownerKey == null)
    return { status: "skipped", ownerKey: null, reason: "missing-context" };
  if (!ownerCurrent())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };
  const ownedStream = () => {
    const catalog = messengerStore.getState();
    const stream =
      catalog.ownerKey === action.ownerKey ? catalog.streamsById[streamUuid] : undefined;
    return stream?.uuid === streamUuid &&
      stream.projectId === runtimeContext.projectId &&
      stream.userUuid === runtimeContext.userUuid &&
      stream.encryption === true &&
      !!stream.currentEncryptionKey?.keyUuid
      ? stream
      : undefined;
  };
  const stream = ownedStream();
  const dispatchKeyUuid = expectedCurrentKey?.keyUuid ?? payload.keyUuid;
  if (
    !stream ||
    stream.currentEncryptionKey?.keyUuid !== dispatchKeyUuid ||
    (rotateKey &&
      (payload.kind !== "key_announced" || stream.ownerUuid !== runtimeContext.userUuid)) ||
    (((payload.kind === "e2ee" && !allowHistoricalKey) ||
      (payload.kind === "key_announced" && !rotateKey)) &&
      payload.keyUuid !== dispatchKeyUuid)
  )
    throw new Error("invalid-key");
  let dispatched = false;
  const current = () => {
    if (!ownerCurrent()) return false;
    const stream = ownedStream();
    if (!stream) return false;
    if (rotateKey && stream.ownerUuid !== runtimeContext.userUuid) return false;
    return (
      stream.currentEncryptionKey?.keyUuid === dispatchKeyUuid ||
      (dispatched &&
        rotateKey &&
        payload.kind === "key_announced" &&
        stream.currentEncryptionKey?.keyUuid === payload.keyUuid)
    );
  };
  const requestOptions = buildMessengerRequestOptions(runtimeContext, clientOptions, signal);
  const fetchImpl = requestOptions.fetchImpl ?? fetch;
  requestOptions.fetchImpl = (request, init) =>
    current() && ownedStream()?.currentEncryptionKey?.keyUuid === dispatchKeyUuid
      ? fetchImpl(request, init)
      : Promise.reject(new Error("stale"));
  const wire = encodeChatE2eePayload(payload);
  if (!current()) return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };
  // Realtime may report this exact own announcement before its POST response arrives.
  dispatched = true;
  const dto = await (client.createMessage ?? defaultCreateMessage)(requestOptions, {
    uuid: normalizeMessengerMessageUuid(canonicalMessageUuid),
    stream_uuid: streamUuid,
    topic_uuid: topicUuid,
    payload: wire,
  });
  if (!current()) return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };
  const decodedResponse =
    dto.payload.kind === "markdown" ? null : decodeChatE2eePayload(dto.payload);
  if (
    dto.uuid !== createMessengerPlacementUuid(topicUuid, canonicalMessageUuid) ||
    dto.project_id !== runtimeContext.projectId ||
    dto.user_uuid !== runtimeContext.userUuid ||
    dto.author_uuid !== runtimeContext.userUuid ||
    dto.stream_uuid !== streamUuid ||
    dto.topic_uuid !== topicUuid ||
    !decodedResponse?.ok ||
    JSON.stringify(encodeChatE2eePayload(decodedResponse.value)) !== JSON.stringify(wire)
  )
    throw new Error("invalid-message");
  const message = adaptMessengerMessage(dto);
  if (!current()) return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };
  store.getState().applyLiveCreatedMessage(message);
  if (!current()) return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };
  messengerStore
    .getState()
    .applyMessagePointer(action.ownerKey, message, store.getState().messagesById);
  if (!current()) return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };
  void writeMessagePageCacheBestEffort(
    cache,
    action.ownerKey,
    conversationIdsForMessageAction(message, includeStreamConversation),
    message,
    current,
  );
  return { status: "applied", ownerKey: action.ownerKey, message };
}

export async function editMessengerMessage({
  runtimeContext,
  getRuntimeContext = () => runtimeContext,
  clientOptions,
  client = {},
  cache = messengerMessageActionCache,
  signal,
  store = useWorkspaceMessageStore,
  messageUuid,
  markdown,
  encryptedPayload,
  sourceMessage,
  messengerStore = useMessengerStore,
  isCurrent,
}: EditMessengerMessageOptions): Promise<MessengerMessageActionResult> {
  // Editing refreshes a known message body without changing the active window membership.
  const action = captureMessageAction(runtimeContext, getRuntimeContext, signal);
  if (action.ownerKey == null)
    return { status: "skipped", ownerKey: null, reason: "missing-context" };
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  const capturedMutationRevision = store.getState().messageMutationRevision;
  const originalMessage = store.getState().messagesById[messageUuid];
  if (
    originalMessage == null ||
    (encryptedPayload == null
      ? originalMessage.payload.kind !== "markdown"
      : originalMessage.payload.kind !== "e2ee" ||
        !originalMessage.isOwn ||
        originalMessage.authorUuid !== runtimeContext.userUuid ||
        originalMessage.projectId !== runtimeContext.projectId ||
        originalMessage.payload.keyUuid !== encryptedPayload.keyUuid ||
        sourceMessage?.payload.kind !== "e2ee" ||
        sourceMessage.payload.content !== originalMessage.payload.content ||
        sourceMessage.payload.keyUuid !== originalMessage.payload.keyUuid ||
        sourceMessage.streamUuid !== originalMessage.streamUuid ||
        sourceMessage.topicUuid !== originalMessage.topicUuid)
  ) {
    throw new Error("A loaded editable message is required");
  }
  const current = () => {
    if (action.isStale() || !(isCurrent?.() ?? true)) return false;
    if (encryptedPayload == null) return true;
    const catalog = messengerStore.getState();
    return (
      store.getState().ownerKey === action.ownerKey &&
      catalog.ownerKey === action.ownerKey &&
      catalog.streamsById[originalMessage.streamUuid]?.encryption === true
    );
  };
  const sourceCurrent = () => {
    const latest = store.getState().messagesById[messageUuid];
    return current() && (encryptedPayload == null || latest === originalMessage);
  };
  const catalog = messengerStore.getState();
  const knownStream =
    catalog.ownerKey === action.ownerKey
      ? catalog.streamsById[originalMessage.streamUuid]
      : undefined;
  const stream =
    knownStream ??
    (await (client.getStream ?? defaultGetStream)(
      buildMessengerRequestOptions(runtimeContext, clientOptions, signal),
      originalMessage.streamUuid,
    ));
  if (!sourceCurrent())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };
  if (
    stream.uuid !== originalMessage.streamUuid ||
    (encryptedPayload == null ? stream.encryption === true : stream.encryption !== true)
  ) {
    throw new Error("Encrypted messages cannot be edited as Markdown");
  }

  const payload =
    encryptedPayload == null
      ? { kind: "markdown" as const, content: markdown }
      : encodeChatE2eePayload(encryptedPayload);
  const requestOptions = buildMessengerRequestOptions(runtimeContext, clientOptions, signal);
  if (encryptedPayload != null) {
    const fetchImpl = requestOptions.fetchImpl ?? fetch;
    requestOptions.fetchImpl = (request, init) =>
      sourceCurrent() ? fetchImpl(request, init) : Promise.reject(new Error("stale"));
  }
  const dto = await (client.editMessage ?? defaultEditMessage)(requestOptions, messageUuid, {
    payload,
  });
  if (!current()) return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };
  if (encryptedPayload != null) {
    const decoded = dto.payload.kind === "e2ee" ? decodeChatE2eePayload(dto.payload) : null;
    if (
      dto.uuid !== messageUuid ||
      dto.project_id !== runtimeContext.projectId ||
      dto.author_uuid !== runtimeContext.userUuid ||
      dto.user_uuid !== runtimeContext.userUuid ||
      dto.stream_uuid !== originalMessage.streamUuid ||
      dto.topic_uuid !== originalMessage.topicUuid ||
      !decoded?.ok ||
      JSON.stringify(encodeChatE2eePayload(decoded.value)) !== JSON.stringify(payload)
    )
      throw new Error("invalid-message");
  }

  const message = adaptMessengerMessage(dto);
  store.getState().applyLiveKnownBodyMutation(message, capturedMutationRevision);
  const effectiveMessage = store.getState().messagesById[message.uuid] ?? null;
  if (effectiveMessage != null) {
    messengerStore
      .getState()
      .applyMessagePointer(action.ownerKey, effectiveMessage, store.getState().messagesById);
  }
  if (cache?.patchCachedMessage != null && effectiveMessage != null) {
    await writeActionCacheBestEffort(() =>
      cache.patchCachedMessage?.(action.ownerKey, effectiveMessage),
    );
  }
  return { status: "applied", ownerKey: action.ownerKey, message: effectiveMessage };
}

export async function deleteMessengerMessage({
  runtimeContext,
  getRuntimeContext = () => runtimeContext,
  clientOptions,
  client = {},
  cache = messengerMessageActionCache,
  signal,
  store = useWorkspaceMessageStore,
  messageUuid,
  streamUuid,
  topicUuid,
}: DeleteMessengerMessageOptions): Promise<MessengerMessageActionResult> {
  // Deletion removes the uuid from Workspace buckets and does not touch old Zulip stores.
  const action = captureMessageAction(runtimeContext, getRuntimeContext, signal);
  if (action.ownerKey == null)
    return { status: "skipped", ownerKey: null, reason: "missing-context" };
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  const deletedMessage = { uuid: messageUuid, streamUuid, topicUuid };
  const pointerRepairPlan = captureDeletedMessagePointerRepair(action.ownerKey, deletedMessage);
  await (client.deleteMessage ?? defaultDeleteMessage)(
    buildMessengerRequestOptions(runtimeContext, clientOptions, signal),
    messageUuid,
  );
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  store.getState().removeMessage(messageUuid);
  useMessengerStore.getState().clearMessagePointer(action.ownerKey, deletedMessage);
  if (cache?.deleteCachedMessage != null) {
    await writeActionCacheBestEffort(() =>
      cache.deleteCachedMessage?.(
        action.ownerKey,
        messageUuid,
        conversationIdsForDeletedMessage(streamUuid, topicUuid),
      ),
    );
  }
  await repairDeletedMessagePointers({
    runtimeContext,
    plan: pointerRepairPlan,
    getRuntimeContext,
    clientOptions,
    client,
    cache,
    signal,
  });
  return { status: "applied", ownerKey: action.ownerKey, message: null };
}

export async function markMessengerMessageRead({
  runtimeContext,
  getRuntimeContext = () => runtimeContext,
  clientOptions,
  client = {},
  cache = messengerMessageActionCache,
  signal,
  store = useWorkspaceMessageStore,
  messageUuid,
  conversationIds,
}: MarkMessengerMessageReadOptions): Promise<MessengerMessageActionResult> {
  // Frontend reads are always topic boundaries, including callers that still use this old name.
  const action = captureMessageAction(runtimeContext, getRuntimeContext, signal);
  if (action.ownerKey == null)
    return { status: "skipped", ownerKey: null, reason: "missing-context" };
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  const capturedMutationRevision = store.getState().messageMutationRevision;

  const dto = await (client.markMessagesReadUpTo ?? defaultMarkMessagesReadUpTo)(
    buildMessengerRequestOptions(runtimeContext, clientOptions, signal),
    messageUuid,
  );
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  const message = adaptMessengerMessage(dto);
  const boundary = advanceMessengerReadBoundary({
    ownerKey: action.ownerKey,
    streamUuid: message.streamUuid,
    topicUuid: message.topicUuid,
    createdAt: message.createdAt,
    messageUuid: message.uuid,
  });
  store.getState().applyLiveKnownBodyMutation(message, capturedMutationRevision);
  const effectiveMessage = store.getState().messagesById[message.uuid] ?? null;
  if (effectiveMessage != null) {
    useMessengerStore
      .getState()
      .applyMessagePointer(action.ownerKey, effectiveMessage, store.getState().messagesById);
    store.getState().markMessagesReadUpTo(message.uuid, {
      conversationIds: conversationIds ?? [
        message.conversationId,
        conversationIdForStream(message.streamUuid),
      ],
    });
  }
  if (cache?.advanceReadBoundary != null) {
    await writeActionCacheBestEffort(() => cache.advanceReadBoundary?.(boundary));
  }
  if (cache?.patchCachedMessage != null && effectiveMessage != null) {
    await writeActionCacheBestEffort(() =>
      cache.patchCachedMessage?.(action.ownerKey, { ...effectiveMessage, read: true }),
    );
  }
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };
  useActivityStore.getState().invalidateUnreadMentions(action.ownerKey);
  return { status: "applied", ownerKey: action.ownerKey, message: effectiveMessage };
}

function reachesTopicEnd(
  topic: MessengerTopic | null,
  boundary: MessengerMessage,
  messagesById: Readonly<Record<MessengerUuid, MessengerMessage>>,
): boolean {
  if (topic?.lastMessageUuid == null) return false;
  if (topic.lastMessageUuid === boundary.uuid) return true;
  const lastMessage = messagesById[topic.lastMessageUuid];
  return lastMessage != null && compareWorkspaceMessages(boundary, lastMessage) >= 0;
}

interface ReadUpToProjection {
  projectedMessages: readonly MessengerMessage[];
  rollback: () => void;
}

const EMPTY_READ_UP_TO_PROJECTION: ReadUpToProjection = {
  projectedMessages: [],
  rollback: () => undefined,
};

/** Project sidebar counters while message read flags still await confirmation. */
function projectReadUpTo(
  store: MessengerMessageActionStoreApi,
  ownerKey: string,
  anchor: MessengerMessage | null,
  conversationIds: readonly MessengerConversationId[] | undefined,
): ReadUpToProjection {
  if (anchor == null) return EMPTY_READ_UP_TO_PROJECTION;
  const topicBeforeRead = useMessengerStore.getState().topicsById[anchor.topicUuid] ?? null;
  const state = store.getState();
  const scope = conversationIds ?? [
    anchor.conversationId,
    conversationIdForStream(anchor.streamUuid),
  ];
  const candidateIds = new Set(
    scope.flatMap((id) => state.conversationWindowsById[id]?.messageUuids ?? []),
  );
  const unreadMessages = [...candidateIds]
    .map((id) => state.messagesById[id])
    .filter(
      (message): message is MessengerMessage =>
        message != null &&
        !message.read &&
        message.streamUuid === anchor.streamUuid &&
        message.topicUuid === anchor.topicUuid &&
        compareWorkspaceMessages(message, anchor) <= 0,
    );
  const readCount = reachesTopicEnd(topicBeforeRead, anchor, store.getState().messagesById)
    ? undefined
    : unreadMessages.length;
  const catalogChange =
    readCount === 0
      ? null
      : beginWorkspaceTopicReadCounters(
          ownerKey,
          { streamUuid: anchor.streamUuid, topicUuid: anchor.topicUuid },
          readCount,
        );
  return {
    projectedMessages: unreadMessages,
    rollback: () => {
      if (catalogChange != null) rollbackWorkspaceTopicReadCounters(catalogChange);
    },
  };
}

async function writeReadUpToCache(
  cache: MessengerMessageActionCacheWriter | undefined,
  ownerKey: string,
  boundary: MessengerReadBoundary,
  anchorUuid: MessengerUuid,
  effectiveMessage: MessengerMessage | null,
  messagesToCache: readonly MessengerMessage[],
  isStale: () => boolean,
): Promise<void> {
  if (isStale()) return;
  if (cache?.advanceReadBoundary != null) {
    await writeActionCacheBestEffort(() => cache.advanceReadBoundary?.(boundary));
  }

  if (isStale()) return;
  if (cache?.markCachedMessagesRead != null) {
    if (cache.patchCachedMessage != null && effectiveMessage != null) {
      await writeActionCacheBestEffort(() =>
        cache.patchCachedMessage?.(ownerKey, { ...effectiveMessage, read: true }),
      );
    }
    if (isStale()) return;
    const messageUuids = messagesToCache
      .map((message) => message.uuid)
      .filter((messageUuid) => cache.patchCachedMessage == null || messageUuid !== anchorUuid);
    if (messageUuids.length > 0) {
      await writeActionCacheBestEffort(() =>
        cache.markCachedMessagesRead?.(ownerKey, messageUuids),
      );
    }
  } else if (cache?.patchCachedMessage != null) {
    for (const changedMessage of messagesToCache) {
      if (isStale()) return;
      await writeActionCacheBestEffort(() =>
        cache.patchCachedMessage?.(ownerKey, { ...changedMessage, read: true }),
      );
    }
  }
}

export async function markMessengerMessagesReadUpTo({
  runtimeContext,
  getRuntimeContext = () => runtimeContext,
  clientOptions,
  client = {},
  cache = messengerMessageActionCache,
  signal,
  store = useWorkspaceMessageStore,
  messageUuid,
  conversationIds,
}: MarkMessengerMessagesReadUpToOptions): Promise<MessengerMessageActionResult> {
  const action = captureMessageAction(runtimeContext, getRuntimeContext, signal);
  if (action.ownerKey == null)
    return { status: "skipped", ownerKey: null, reason: "missing-context" };
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  // Counters respond immediately; unread bubbles remain until the server confirms.
  const anchor = store.getState().messagesById[messageUuid] ?? null;
  const projection = projectReadUpTo(store, action.ownerKey, anchor, conversationIds);

  const capturedMutationRevision = store.getState().messageMutationRevision;

  let dto: WorkspaceMessengerMessageDto;
  try {
    dto = await (client.markMessagesReadUpTo ?? defaultMarkMessagesReadUpTo)(
      buildMessengerRequestOptions(runtimeContext, clientOptions, signal),
      messageUuid,
    );
  } catch (error) {
    // Runtime invalidation must not roll back state owned by a newer session.
    if (!action.isStale()) projection.rollback();
    throw error;
  }
  if (action.isStale()) {
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };
  }

  const message = adaptMessengerMessage(dto);
  const boundary = advanceMessengerReadBoundary({
    ownerKey: action.ownerKey,
    streamUuid: message.streamUuid,
    topicUuid: message.topicUuid,
    createdAt: message.createdAt,
    messageUuid: message.uuid,
  });
  store.getState().applyLiveKnownBodyMutation(message, capturedMutationRevision);
  const effectiveMessage = store.getState().messagesById[message.uuid] ?? null;
  if (effectiveMessage != null) {
    useMessengerStore
      .getState()
      .applyMessagePointer(action.ownerKey, effectiveMessage, store.getState().messagesById);
  }
  const scope = conversationIds ?? [
    message.conversationId,
    conversationIdForStream(message.streamUuid),
  ];
  const changedMessages =
    effectiveMessage == null
      ? []
      : store.getState().markMessagesReadUpTo(message.uuid, { conversationIds: scope });
  const messagesToCache = new Map<string, MessengerMessage>();
  if (effectiveMessage != null) messagesToCache.set(message.uuid, effectiveMessage);
  for (const changedMessage of [...changedMessages, ...projection.projectedMessages]) {
    if (!messagesToCache.has(changedMessage.uuid)) {
      messagesToCache.set(changedMessage.uuid, changedMessage);
    }
  }

  await writeReadUpToCache(
    cache,
    action.ownerKey,
    boundary,
    message.uuid,
    effectiveMessage,
    [...messagesToCache.values()],
    action.isStale,
  );

  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };
  useActivityStore.getState().invalidateUnreadMentions(action.ownerKey);
  return { status: "applied", ownerKey: action.ownerKey, message: effectiveMessage };
}
