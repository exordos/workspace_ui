import { useActivityStore } from "~/entities/activity/activity.model";
import {
  captureWorkspaceRuntimeRequestContext,
  isWorkspaceRuntimeRequestInvalidated,
  workspaceRuntimeOwnerKey,
} from "~/platform/sessions/workspace-runtime.lib";
import type { WorkspaceRuntimeContextGetter } from "~/platform/sessions/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/platform/sessions/workspace-runtime.types";
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
  WorkspaceMessengerPollPayloadDto,
  WorkspaceMessengerUpdateMessageRequestBody,
} from "~/shared/api/messenger.types";
import { hasWorkspaceSecretDraft } from "~/shared/lib/workspace-secret-draft.lib";
import {
  captureDeletedMessagePointerRepair,
  repairDeletedMessagePointers,
} from "../chats/messenger-deleted-message-pointer-repair.lib";
import {
  getMessengerStoreForOwner,
  getSelectedMessengerStore,
  type useMessengerStore,
} from "../chats/messenger.model";
import {
  decodeChatE2eePayload,
  encodeChatE2eePayload,
} from "../crypto/chat-e2ee-payload-adapters.lib";
import {
  messengerMessageActionCache,
  type MessengerMessageCacheDeletion,
  type MessengerMessagePointerCacheRepair,
} from "../messenger-cache.lib";
import { conversationIdForStream } from "../messenger-ids.lib";
import {
  buildMessengerRequestOptions,
  type MessengerRequestOptionsOverrides,
} from "../messenger-request-options.lib";
import { compareWorkspaceMessages } from "./message-workspace-order.lib";
import {
  getSelectedWorkspaceMessageStore,
  getWorkspaceMessageStoreForOwner,
  type useWorkspaceMessageStore,
} from "./message.model";
import { acceptMessageDeletion } from "./messages-accept-deletion.lib";
import { acceptMessageRead, type ConfirmedMessageReadCache } from "./messages-accept-read.lib";
import { acceptServerMessages } from "./messages-accept-server.lib";
import { acceptMessageUpdate, type KnownMessageCacheWriter } from "./messages-accept-update.lib";
import { adaptMessengerMessage } from "./messenger-message-adapter.lib";
import {
  createMessengerPlacementUuid,
  normalizeMessengerMessageUuid,
} from "./messenger-message-identity.lib";
import {
  beginWorkspaceTopicReadCounters,
  rollbackWorkspaceTopicReadCounters,
} from "./messenger-read-actions.lib";
import { supportsMessengerPolls } from "./polls/messenger-poll-actions.lib";
import type { SentMessageCacheWriter } from "./messages-accept-sent.lib";
import type { ChatE2eePayload, ChatEncryptedPayload } from "../crypto/chat-e2ee.types";
import type {
  MessengerConversationId,
  MessengerMessage,
  MessengerTopic,
  MessengerUuid,
} from "../messenger.types";

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

export type { MessengerMessageActionCacheConversationPage } from "./messages-accept-sent.lib";

export interface MessengerMessageActionCacheWriter extends ConfirmedMessageReadCache {
  patchCachedMessage?: KnownMessageCacheWriter;
  repairMessagePointers?: MessengerMessagePointerCacheRepair;
  deleteCachedMessage?: MessengerMessageCacheDeletion;
  writeConversationMessagePage?: SentMessageCacheWriter;
}

export interface MessengerMessageActionStoreApi {
  getState: () => Pick<
    ReturnType<typeof useWorkspaceMessageStore.getState>,
    | "applyLiveCreatedMessage"
    | "applyLiveKnownBodyMutation"
    | "confirmMessagesReadUpTo"
    | "removeMessage"
    | "messageMutationRevision"
    | "messageMutationRevisionById"
    | "deletedMessageRevisionById"
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

export type SendMessengerMessageOptions = MessengerMessageActionBaseOptions & {
  streamUuid: MessengerUuid;
  topicUuid: MessengerUuid;
  canonicalMessageUuid?: MessengerUuid;
  includeStreamConversation?: boolean;
  messengerStore?: Pick<typeof useMessengerStore, "getState">;
} & (
    | { markdown: string; pollPayload?: never }
    | { markdown?: never; pollPayload: WorkspaceMessengerPollPayloadDto }
  );

export type EditMessengerMessageOptions = MessengerMessageActionBaseOptions & {
  messageUuid: MessengerUuid;
  messengerStore?: Pick<typeof useMessengerStore, "getState">;
} & (
    | {
        markdown: string;
        encryptedPayload?: never;
        sourceMessage?: MessengerMessage;
        isCurrent?: () => boolean;
      }
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

// Валидирует и отправляет обычное сообщение или опрос через Workspace API.
export async function sendMessengerMessage({
  runtimeContext,
  getRuntimeContext = () => runtimeContext,
  clientOptions,
  client = {},
  cache = messengerMessageActionCache,
  signal,
  store = getWorkspaceMessageStoreForOwner(workspaceRuntimeOwnerKey(runtimeContext)) ??
    getSelectedWorkspaceMessageStore(),
  messengerStore = getMessengerStoreForOwner(workspaceRuntimeOwnerKey(runtimeContext)) ??
    getSelectedMessengerStore(),
  streamUuid,
  topicUuid,
  markdown,
  pollPayload,
  canonicalMessageUuid = crypto.randomUUID(),
  includeStreamConversation = false,
}: SendMessengerMessageOptions): Promise<MessengerMessageActionResult> {
  if (markdown != null && hasWorkspaceSecretDraft(markdown)) throw new Error("invalid-secret");
  if ((markdown == null) === (pollPayload == null)) throw new Error("invalid-message");
  // Apply the created message to an active tail window.
  const action = captureMessageAction(runtimeContext, getRuntimeContext, signal);
  if (action.ownerKey == null)
    return { status: "skipped", ownerKey: null, reason: "missing-context" };
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  const requestOptions = buildMessengerRequestOptions(runtimeContext, clientOptions, signal);
  const catalog = messengerStore.getState();
  const knownStream =
    catalog.ownerKey === action.ownerKey ? catalog.streamsById[streamUuid] : undefined;
  const stream =
    knownStream ?? (await (client.getStream ?? defaultGetStream)(requestOptions, streamUuid));
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };
  if (stream.uuid !== streamUuid || stream.encryption === true) {
    throw new Error("Encrypted chats require an available crypto provider");
  }
  if (
    pollPayload != null &&
    !supportsMessengerPolls(
      "source_name" in stream
        ? {
            sourceName: stream.source_name,
            encryption: stream.encryption,
            isArchived: stream.is_archived,
          }
        : stream,
    )
  ) {
    throw new Error("Polls are unavailable in this stream");
  }
  const payload: WorkspaceMessengerCreateMessageRequestBody["payload"] = pollPayload ?? {
    kind: "markdown",
    content: markdown ?? "",
  };
  const capturedMutationRevision = store.getState().messageMutationRevision;
  const dto = await (client.createMessage ?? defaultCreateMessage)(requestOptions, {
    uuid: normalizeMessengerMessageUuid(canonicalMessageUuid),
    stream_uuid: streamUuid,
    topic_uuid: topicUuid,
    payload,
  });
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  if (
    pollPayload != null &&
    (dto.uuid !== createMessengerPlacementUuid(topicUuid, canonicalMessageUuid) ||
      dto.project_id !== runtimeContext.projectId ||
      dto.user_uuid !== runtimeContext.userUuid ||
      dto.author_uuid !== runtimeContext.userUuid ||
      dto.stream_uuid !== streamUuid ||
      dto.topic_uuid !== topicUuid ||
      dto.payload.kind !== "poll" ||
      dto.poll_state == null)
  )
    throw new Error("invalid-message");
  const message = adaptMessengerMessage(dto);
  const accepted = acceptServerMessages({
    source: "send-response",
    ownerKey: action.ownerKey,
    isCurrent: () => !action.isStale(),
    message,
    capturedMutationRevision,
    store,
    messengerStore,
    includeStreamConversation,
    writePage: cache.writeConversationMessagePage,
  });
  if (accepted.status === "stale-owner")
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };
  return { status: "applied", ownerKey: action.ownerKey, message };
}

export interface SendMessengerE2eePayloadOptions extends MessengerMessageActionBaseOptions {
  readonly messengerStore?: Pick<typeof useMessengerStore, "getState">;
  readonly streamUuid: string;
  readonly topicUuid: string;
  readonly payload: ChatE2eePayload;
  // Historical key service messages retain the current stream-generation dispatch guard.
  readonly expectedCurrentKey?: { readonly keyUuid: string | null };
  readonly markdownContent?: string;
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
  store = getWorkspaceMessageStoreForOwner(workspaceRuntimeOwnerKey(runtimeContext)) ??
    getSelectedWorkspaceMessageStore(),
  messengerStore = getMessengerStoreForOwner(workspaceRuntimeOwnerKey(runtimeContext)) ??
    getSelectedMessengerStore(),
  streamUuid,
  topicUuid,
  payload,
  expectedCurrentKey,
  markdownContent,
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
      (stream.encryption === true || stream.sourceName === "native")
      ? stream
      : undefined;
  };
  const stream = ownedStream();
  const dispatchKeyUuid = expectedCurrentKey ? expectedCurrentKey.keyUuid : payload.keyUuid;
  const streamKeyUuid = () => ownedStream()?.currentEncryptionKey?.keyUuid ?? null;
  if (
    !stream ||
    (payload.kind === "e2ee" && stream.encryption !== true && markdownContent === undefined) ||
    streamKeyUuid() !== dispatchKeyUuid ||
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
      streamKeyUuid() === dispatchKeyUuid ||
      (dispatched &&
        rotateKey &&
        payload.kind === "key_announced" &&
        stream.currentEncryptionKey?.keyUuid === payload.keyUuid)
    );
  };
  const requestOptions = buildMessengerRequestOptions(runtimeContext, clientOptions, signal);
  const fetchImpl = requestOptions.fetchImpl ?? fetch;
  requestOptions.fetchImpl = (request, init) =>
    current() && streamKeyUuid() === dispatchKeyUuid
      ? fetchImpl(request, init)
      : Promise.reject(new Error("stale"));
  if (markdownContent !== undefined && hasWorkspaceSecretDraft(markdownContent))
    throw new Error("invalid-secret");
  if (markdownContent !== undefined && (payload.kind !== "e2ee" || stream.encryption === true))
    throw new Error("invalid-message");
  const wire =
    markdownContent === undefined
      ? encodeChatE2eePayload(payload)
      : { kind: "markdown" as const, content: markdownContent };
  if (!current()) return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };
  // Realtime may report this exact own announcement before its POST response arrives.
  dispatched = true;
  const capturedMutationRevision = store.getState().messageMutationRevision;
  const dto = await (client.createMessage ?? defaultCreateMessage)(requestOptions, {
    uuid: normalizeMessengerMessageUuid(canonicalMessageUuid),
    stream_uuid: streamUuid,
    topic_uuid: topicUuid,
    payload: wire,
  });
  if (!current()) return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };
  const decodedResponse =
    dto.payload.kind === "markdown" || dto.payload.kind === "poll"
      ? null
      : decodeChatE2eePayload(dto.payload);
  if (
    dto.uuid !== createMessengerPlacementUuid(topicUuid, canonicalMessageUuid) ||
    dto.project_id !== runtimeContext.projectId ||
    dto.user_uuid !== runtimeContext.userUuid ||
    dto.author_uuid !== runtimeContext.userUuid ||
    dto.stream_uuid !== streamUuid ||
    dto.topic_uuid !== topicUuid ||
    (wire.kind === "markdown"
      ? dto.payload.kind !== "markdown" || dto.payload.content !== wire.content
      : !decodedResponse?.ok ||
        JSON.stringify(encodeChatE2eePayload(decodedResponse.value)) !== JSON.stringify(wire))
  )
    throw new Error("invalid-message");
  const message = adaptMessengerMessage(dto);
  const accepted = acceptServerMessages({
    source: "send-response",
    ownerKey: action.ownerKey,
    isCurrent: current,
    message,
    capturedMutationRevision,
    store,
    messengerStore,
    includeStreamConversation,
    writePage: cache.writeConversationMessagePage,
  });
  if (accepted.status === "stale-owner")
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };
  return { status: "applied", ownerKey: action.ownerKey, message };
}

export async function editMessengerMessage({
  runtimeContext,
  getRuntimeContext = () => runtimeContext,
  clientOptions,
  client = {},
  cache = messengerMessageActionCache,
  signal,
  store = getWorkspaceMessageStoreForOwner(workspaceRuntimeOwnerKey(runtimeContext)) ??
    getSelectedWorkspaceMessageStore(),
  messageUuid,
  markdown,
  encryptedPayload,
  sourceMessage,
  messengerStore = getMessengerStoreForOwner(workspaceRuntimeOwnerKey(runtimeContext)) ??
    getSelectedMessengerStore(),
  isCurrent,
}: EditMessengerMessageOptions): Promise<MessengerMessageActionResult> {
  if (markdown != null && hasWorkspaceSecretDraft(markdown)) throw new Error("invalid-secret");
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
  if (
    isCurrent &&
    encryptedPayload == null &&
    (sourceMessage?.payload.kind !== "markdown" ||
      originalMessage.payload.kind !== "markdown" ||
      sourceMessage.payload.content !== originalMessage.payload.content ||
      sourceMessage.uuid !== originalMessage.uuid ||
      sourceMessage.streamUuid !== originalMessage.streamUuid ||
      sourceMessage.topicUuid !== originalMessage.topicUuid ||
      !originalMessage.isOwn ||
      originalMessage.authorUuid !== runtimeContext.userUuid ||
      originalMessage.projectId !== runtimeContext.projectId)
  )
    throw new Error("invalid-message");
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
    return current() && ((encryptedPayload == null && !isCurrent) || latest === originalMessage);
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
  if (encryptedPayload != null || isCurrent) {
    const fetchImpl = requestOptions.fetchImpl ?? fetch;
    requestOptions.fetchImpl = (request, init) =>
      sourceCurrent() ? fetchImpl(request, init) : Promise.reject(new Error("stale"));
  }
  const dto = await (client.editMessage ?? defaultEditMessage)(requestOptions, messageUuid, {
    payload,
  });
  if (!current()) return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };
  if (encryptedPayload != null || isCurrent) {
    const decoded = dto.payload.kind === "e2ee" ? decodeChatE2eePayload(dto.payload) : null;
    if (
      dto.uuid !== messageUuid ||
      dto.project_id !== runtimeContext.projectId ||
      dto.author_uuid !== runtimeContext.userUuid ||
      dto.user_uuid !== runtimeContext.userUuid ||
      dto.stream_uuid !== originalMessage.streamUuid ||
      dto.topic_uuid !== originalMessage.topicUuid ||
      (payload.kind === "markdown"
        ? dto.payload.kind !== "markdown" || dto.payload.content !== payload.content
        : !decoded?.ok ||
          JSON.stringify(encodeChatE2eePayload(decoded.value)) !== JSON.stringify(payload))
    )
      throw new Error("invalid-message");
  }

  const accepted = acceptMessageUpdate({
    source: "http",
    ownerKey: action.ownerKey,
    isCurrent: current,
    message: adaptMessengerMessage(dto),
    capturedMutationRevision,
    store,
    patchCache: cache.patchCachedMessage,
    project: (message, messagesById) =>
      messengerStore.getState().applyMessagePointer(action.ownerKey, message, messagesById),
  });
  if (accepted.status === "stale-owner")
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };
  if (accepted.cacheWrite != null) await accepted.cacheWrite;
  return { status: "applied", ownerKey: action.ownerKey, message: accepted.message };
}

export async function deleteMessengerMessage({
  runtimeContext,
  getRuntimeContext = () => runtimeContext,
  clientOptions,
  client = {},
  cache = messengerMessageActionCache,
  signal,
  store = getWorkspaceMessageStoreForOwner(workspaceRuntimeOwnerKey(runtimeContext)) ??
    getSelectedWorkspaceMessageStore(),
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

  const accepted = acceptMessageDeletion({
    ownerKey: action.ownerKey,
    reported: deletedMessage,
    beforeRequest: pointerRepairPlan,
    isCurrent: () => !action.isStale(),
    store,
    deleteCache: cache.deleteCachedMessage,
  });
  if (accepted.status === "stale-owner")
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };
  if (accepted.cacheWrite != null) await accepted.cacheWrite;
  await Promise.all(
    accepted.plans.map((plan) =>
      repairDeletedMessagePointers({
        runtimeContext,
        plan,
        getRuntimeContext,
        clientOptions,
        client,
        cache,
        signal,
        isCurrent: accepted.isCurrent,
      }),
    ),
  );
  return { status: "applied", ownerKey: action.ownerKey, message: null };
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
  const topicBeforeRead =
    getMessengerStoreForOwner(ownerKey)?.getState().topicsById[anchor.topicUuid] ?? null;
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

// Both actions send the same inclusive topic boundary. The bulk UI also projects counters.
export function markMessengerMessageRead(
  options: MarkMessengerMessageReadOptions,
): Promise<MessengerMessageActionResult> {
  return submitMessengerReadUpTo(options, false);
}

export function markMessengerMessagesReadUpTo(
  options: MarkMessengerMessagesReadUpToOptions,
): Promise<MessengerMessageActionResult> {
  return submitMessengerReadUpTo(options, true);
}

// Owns request errors, counter rollback, catalog pointers and mention invalidation.
async function submitMessengerReadUpTo(
  {
    runtimeContext,
    getRuntimeContext = () => runtimeContext,
    clientOptions,
    client = {},
    cache = messengerMessageActionCache,
    signal,
    store = getWorkspaceMessageStoreForOwner(workspaceRuntimeOwnerKey(runtimeContext)) ??
      getSelectedWorkspaceMessageStore(),
    messageUuid,
    conversationIds,
  }: MarkMessengerMessagesReadUpToOptions,
  optimisticCounters: boolean,
): Promise<MessengerMessageActionResult> {
  const action = captureMessageAction(runtimeContext, getRuntimeContext, signal);
  if (action.ownerKey == null)
    return { status: "skipped", ownerKey: null, reason: "missing-context" };
  const { ownerKey } = action;
  const { ownerKey: initialOwner, messagesById } = store.getState();
  const isCurrent = () => !action.isStale() && store.getState().ownerKey === initialOwner;
  const stale = { status: "skipped", ownerKey, reason: "stale-owner" } as const;
  if (!isCurrent() || (initialOwner != null && initialOwner !== ownerKey)) return stale;

  // Counters respond immediately; unread bubbles remain until the server confirms.
  const projection = optimisticCounters
    ? projectReadUpTo(store, ownerKey, messagesById[messageUuid] ?? null, conversationIds)
    : EMPTY_READ_UP_TO_PROJECTION;
  if (!isCurrent()) return stale;
  const { messageMutationRevision: capturedMutationRevision } = store.getState();

  let dto: WorkspaceMessengerMessageDto;
  try {
    dto = await (client.markMessagesReadUpTo ?? defaultMarkMessagesReadUpTo)(
      buildMessengerRequestOptions(runtimeContext, clientOptions, signal),
      messageUuid,
    );
  } catch (error) {
    if (isCurrent()) projection.rollback();
    throw error;
  }
  if (!isCurrent()) return stale;

  const accepted = acceptMessageRead({
    kind: "boundary",
    ownerKey,
    isCurrent,
    store,
    cache,
    conversationIds,
    capturedMutationRevision,
    projectedMessages: projection.projectedMessages,
    boundary: {
      streamUuid: dto.stream_uuid,
      topicUuid: dto.topic_uuid,
      createdAt: dto.created_at,
      messageUuid: dto.uuid,
    },
    projectPointer: (message, currentMessagesById) =>
      getMessengerStoreForOwner(ownerKey)
        ?.getState()
        .applyMessagePointer(ownerKey, message, currentMessagesById),
  });
  if (accepted.status === "stale-owner") return stale;
  if (accepted.cacheWrite != null) await accepted.cacheWrite;
  if (!accepted.isCurrent()) return stale;
  useActivityStore.getState().invalidateUnreadMentions(ownerKey);
  return { status: "applied", ownerKey, message: accepted.message };
}
