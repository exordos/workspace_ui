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
import {
  canUseDevChatCrypto,
  createDevChatCryptoProvider,
  pinDevChatCryptoRequestOptions,
} from "./chat-dev-crypto.lib";
import { decodeChatE2eePayload, encodeChatE2eePayload } from "./chat-e2ee-payload-adapters.lib";
import { adaptMessengerMessage, adaptMessengerStream } from "./messenger-adapters.lib";
import {
  messengerMessageActionCache,
  type MessengerMessagePointerCacheTargets,
} from "./messenger-cache.lib";
import {
  captureDeletedMessagePointerRepair,
  repairDeletedMessagePointers,
} from "./messenger-deleted-message-pointer-repair.lib";
import { conversationIdForStream, conversationIdForTopic } from "./messenger-ids.lib";
import { normalizeMessengerMessageUuid } from "./messenger-message-identity.lib";
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
import type { ChatE2eePayload } from "./chat-e2ee.types";
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
  /** Explicit opt-in for local mock provider; never used by generic Markdown senders. */
  cryptoMode?: "development-fixture";
  streamUuid: MessengerUuid;
  topicUuid: MessengerUuid;
  markdown: string;
  canonicalMessageUuid?: MessengerUuid;
  includeStreamConversation?: boolean;
}

export interface EditMessengerMessageOptions extends MessengerMessageActionBaseOptions {
  messageUuid: MessengerUuid;
  markdown: string;
}

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
): Promise<void> {
  const writeConversationMessagePage = cache?.writeConversationMessagePage;
  if (writeConversationMessagePage == null) return;

  await writeActionCacheBestEffort(async () => {
    await Promise.all(
      conversationIds.map((conversationId) =>
        Promise.resolve(
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
  cryptoMode,
}: SendMessengerMessageOptions): Promise<MessengerMessageActionResult> {
  // Sending creates a markdown payload in the Workspace API and applies it to an active tail window.
  const action = captureMessageAction(runtimeContext, getRuntimeContext, signal);
  if (action.ownerKey == null)
    return { status: "skipped", ownerKey: null, reason: "missing-context" };
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  const requestOptions = buildMessengerRequestOptions(runtimeContext, clientOptions, signal);
  let expectedKeyUuid: string | null = null;
  let expectedKeyFingerprint: string | null = null;
  const initiallyKnown =
    useMessengerStore.getState().ownerKey === action.ownerKey &&
    useMessengerStore.getState().streamsById[streamUuid] !== undefined;
  const isCryptoScopeStale = () => {
    if (action.isStale()) return true;
    const catalogNow = useMessengerStore.getState();
    const streamNow =
      catalogNow.ownerKey === action.ownerKey ? catalogNow.streamsById[streamUuid] : undefined;
    return (
      expectedKeyUuid !== null &&
      ((initiallyKnown && streamNow === undefined) ||
        (streamNow !== undefined &&
          (!canUseDevChatCrypto(runtimeContext, streamNow) ||
            streamNow.currentEncryptionKey?.keyUuid !== expectedKeyUuid ||
            streamNow.currentEncryptionKey?.keyFingerprint !== expectedKeyFingerprint)))
    );
  };
  if (cryptoMode === "development-fixture") {
    pinDevChatCryptoRequestOptions(runtimeContext, requestOptions);
    const fetchImpl = requestOptions.fetchImpl ?? fetch;
    requestOptions.fetchImpl = (request, init) =>
      isCryptoScopeStale() ? Promise.reject(new Error("stale-owner")) : fetchImpl(request, init);
  }
  const catalog = useMessengerStore.getState();
  const knownStream =
    catalog.ownerKey === action.ownerKey ? catalog.streamsById[streamUuid] : undefined;
  const stream =
    (cryptoMode === "development-fixture" ? undefined : knownStream) ??
    (await (client.getStream ?? defaultGetStream)(requestOptions, streamUuid));
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };
  if (
    stream.uuid !== streamUuid ||
    (stream.encryption === true && cryptoMode !== "development-fixture")
  ) {
    throw new Error("Encrypted chats require an available crypto provider");
  }
  let payload: WorkspaceMessengerCreateMessageRequestBody["payload"] = {
    kind: "markdown",
    content: markdown,
  };
  if (cryptoMode === "development-fixture") {
    const domainStream =
      "currentEncryptionKey" in stream
        ? stream
        : adaptMessengerStream(stream as WorkspaceMessengerStreamDto);
    if (!canUseDevChatCrypto(runtimeContext, domainStream))
      throw new Error("Development chat crypto unavailable");
    const provider = createDevChatCryptoProvider(runtimeContext, domainStream);
    const key = domainStream.currentEncryptionKey!;
    expectedKeyUuid = key.keyUuid;
    expectedKeyFingerprint = key.keyFingerprint;
    const fixtureKey = await provider!.createGroupKey();
    if (!fixtureKey.ok) throw new Error("Development chat crypto unavailable");
    const result = await provider!.encryptMessage({
      groupKey: fixtureKey.value,
      plaintext: new TextEncoder().encode(markdown),
      context: { streamUuid, keyUuid: key.keyUuid },
    });
    if (isCryptoScopeStale())
      return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };
    if (!result.ok) throw new Error("Development chat crypto unavailable");
    payload = encodeChatE2eePayload({ kind: "e2ee", keyUuid: key.keyUuid, content: result.value });
  }
  const dto = await (client.createMessage ?? defaultCreateMessage)(requestOptions, {
    uuid: normalizeMessengerMessageUuid(canonicalMessageUuid),
    stream_uuid: streamUuid,
    topic_uuid: topicUuid,
    payload,
  });
  if (isCryptoScopeStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  if (
    cryptoMode === "development-fixture" &&
    (dto.uuid !== canonicalMessageUuid ||
      dto.stream_uuid !== streamUuid ||
      dto.topic_uuid !== topicUuid ||
      dto.project_id !== runtimeContext.projectId ||
      dto.user_uuid !== runtimeContext.userUuid ||
      dto.author_uuid !== runtimeContext.userUuid ||
      dto.payload.kind !== "e2ee" ||
      payload.kind !== "e2ee" ||
      dto.payload.key_uuid !== payload.key_uuid ||
      dto.payload.content !== payload.content)
  )
    throw new Error("Encrypted message response mismatch");

  const message = adaptMessengerMessage(dto);
  store.getState().applyLiveCreatedMessage(message);
  settleMessengerOutgoingMessage(action.ownerKey, message);
  useMessengerStore.getState().applyMessagePointer(action.ownerKey, message);
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
  readonly streamUuid: string;
  readonly topicUuid: string;
  readonly payload: ChatE2eePayload;
  readonly keyFingerprint: string;
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
  streamUuid,
  topicUuid,
  payload,
  keyFingerprint,
  isCurrent,
  canonicalMessageUuid = crypto.randomUUID(),
  includeStreamConversation = true,
}: SendMessengerE2eePayloadOptions): Promise<MessengerMessageActionResult> {
  const action = captureMessageAction(runtimeContext, getRuntimeContext, signal);
  const current = () => !action.isStale() && isCurrent();
  if (action.ownerKey == null)
    return { status: "skipped", ownerKey: null, reason: "missing-context" };
  if (!current()) return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };
  const requestOptions = buildMessengerRequestOptions(runtimeContext, clientOptions, signal);
  const fetchImpl = requestOptions.fetchImpl ?? fetch;
  requestOptions.fetchImpl = (request, init) =>
    current() ? fetchImpl(request, init) : Promise.reject(new Error("stale"));
  const stream = await (client.getStream ?? defaultGetStream)(requestOptions, streamUuid);
  if (!current()) return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };
  if (
    stream.uuid !== streamUuid ||
    stream.project_id !== runtimeContext.projectId ||
    stream.user_uuid !== runtimeContext.userUuid ||
    !stream.encryption ||
    stream.current_encryption_key?.key_uuid !== payload.keyUuid ||
    stream.current_encryption_key.key_fingerprint !== keyFingerprint
  )
    throw new Error("invalid-key");
  const wire = encodeChatE2eePayload(payload);
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
    dto.uuid !== canonicalMessageUuid ||
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
  store.getState().applyLiveCreatedMessage(message);
  useMessengerStore.getState().applyMessagePointer(action.ownerKey, message);
  void writeMessagePageCacheBestEffort(
    cache,
    action.ownerKey,
    conversationIdsForMessageAction(message, includeStreamConversation),
    message,
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
}: EditMessengerMessageOptions): Promise<MessengerMessageActionResult> {
  // Editing refreshes a known message body without changing the active window membership.
  const action = captureMessageAction(runtimeContext, getRuntimeContext, signal);
  if (action.ownerKey == null)
    return { status: "skipped", ownerKey: null, reason: "missing-context" };
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  const capturedMutationRevision = store.getState().messageMutationRevision;
  const originalMessage = store.getState().messagesById[messageUuid];
  if (originalMessage?.payload.kind !== "markdown") {
    throw new Error("A loaded Markdown message is required for editing");
  }
  const catalog = useMessengerStore.getState();
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
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };
  if (stream.uuid !== originalMessage.streamUuid || stream.encryption === true) {
    throw new Error("Encrypted messages cannot be edited as Markdown");
  }

  const dto = await (client.editMessage ?? defaultEditMessage)(
    buildMessengerRequestOptions(runtimeContext, clientOptions, signal),
    messageUuid,
    { payload: { kind: "markdown", content: markdown } },
  );
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  const message = adaptMessengerMessage(dto);
  store.getState().applyLiveKnownBodyMutation(message, capturedMutationRevision);
  const effectiveMessage = store.getState().messagesById[message.uuid] ?? null;
  if (effectiveMessage != null) {
    useMessengerStore.getState().applyMessagePointer(action.ownerKey, effectiveMessage);
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
    useMessengerStore.getState().applyMessagePointer(action.ownerKey, effectiveMessage);
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
    useMessengerStore.getState().applyMessagePointer(action.ownerKey, effectiveMessage);
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
