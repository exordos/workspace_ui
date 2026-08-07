import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import {
  captureWorkspaceRuntimeRequestContext,
  isWorkspaceRuntimeRequestInvalidated,
  workspaceRuntimeOwnerKey,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContextGetter } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import type { MessengerClientOptions } from "~/shared/api/messenger-client";
import {
  createMessage as defaultCreateMessage,
  deleteMessage as defaultDeleteMessage,
  editMessage as defaultEditMessage,
  markMessagesReadUpTo as defaultMarkMessagesReadUpTo,
} from "~/shared/api/messenger-messages.api";
import type {
  WorkspaceMessengerCreateMessageRequestBody,
  WorkspaceMessengerMessageDto,
  WorkspaceMessengerUpdateMessageRequestBody,
} from "~/shared/api/messenger.types";
import { adaptMessengerMessage } from "./messenger-adapters.lib";
import { messengerMessageActionCache } from "./messenger-cache.lib";
import { conversationIdForStream, conversationIdForTopic } from "./messenger-ids.lib";
import {
  advanceMessengerReadBoundary,
  type MessengerReadBoundary,
} from "./messenger-read-boundary.lib";
import {
  buildMessengerRequestOptions,
  type MessengerRequestOptionsOverrides,
} from "./messenger-request-options.lib";
import { useMessengerStore } from "./messenger.model";
import type { MessengerConversationId, MessengerMessage, MessengerUuid } from "./messenger.types";

export interface MessengerMessageActionClientDeps {
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
    | "indexMessageIntoConversationBuckets"
    | "upsertMessage"
    | "applyMessageEdit"
    | "markMessageRead"
    | "markMessagesReadUpTo"
    | "removeMessage"
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
  includeStreamConversation?: boolean;
  onBeforeMessageIndexed?: (message: MessengerMessage) => void;
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
  includeStreamConversation = false,
  onBeforeMessageIndexed,
}: SendMessengerMessageOptions): Promise<MessengerMessageActionResult> {
  // Sending creates a markdown payload in the Workspace API and indexes the response into message lists.
  const action = captureMessageAction(runtimeContext, getRuntimeContext, signal);
  if (action.ownerKey == null)
    return { status: "skipped", ownerKey: null, reason: "missing-context" };
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  const dto = await (client.createMessage ?? defaultCreateMessage)(
    buildMessengerRequestOptions(runtimeContext, clientOptions, signal),
    {
      stream_uuid: streamUuid,
      topic_uuid: topicUuid,
      payload: { kind: "markdown", content: markdown },
    },
  );
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  const message = adaptMessengerMessage(dto);
  onBeforeMessageIndexed?.(message);
  store.getState().indexMessageIntoConversationBuckets(message, {
    includeStreamConversation,
  });
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
  // Only the message payload is edited; the visual list updates from the new messenger store.
  const action = captureMessageAction(runtimeContext, getRuntimeContext, signal);
  if (action.ownerKey == null)
    return { status: "skipped", ownerKey: null, reason: "missing-context" };
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  const dto = await (client.editMessage ?? defaultEditMessage)(
    buildMessengerRequestOptions(runtimeContext, clientOptions, signal),
    messageUuid,
    { payload: { kind: "markdown", content: markdown } },
  );
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  const message = adaptMessengerMessage(dto);
  store.getState().upsertMessage(message);
  useMessengerStore.getState().applyMessagePointer(action.ownerKey, message);
  store.getState().applyMessageEdit(message.uuid, {
    markdown: message.payload.content,
    updatedAt: message.updatedAt,
  });
  if (cache?.patchCachedMessage != null) {
    await writeActionCacheBestEffort(() => cache.patchCachedMessage?.(action.ownerKey, message));
  }
  return { status: "applied", ownerKey: action.ownerKey, message };
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

  await (client.deleteMessage ?? defaultDeleteMessage)(
    buildMessengerRequestOptions(runtimeContext, clientOptions, signal),
    messageUuid,
  );
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  store.getState().removeMessage(messageUuid);
  useMessengerStore.getState().clearMessagePointer(action.ownerKey, {
    uuid: messageUuid,
    streamUuid,
    topicUuid,
  });
  if (cache?.deleteCachedMessage != null) {
    await writeActionCacheBestEffort(() =>
      cache.deleteCachedMessage?.(
        action.ownerKey,
        messageUuid,
        conversationIdsForDeletedMessage(streamUuid, topicUuid),
      ),
    );
  }
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
  store.getState().upsertMessage(message);
  useMessengerStore.getState().applyMessagePointer(action.ownerKey, message);
  store.getState().markMessagesReadUpTo(message.uuid, {
    conversationIds: conversationIds ?? [
      message.conversationId,
      conversationIdForStream(message.streamUuid),
    ],
  });
  if (cache?.advanceReadBoundary != null) {
    await writeActionCacheBestEffort(() => cache.advanceReadBoundary?.(boundary));
  }
  if (cache?.patchCachedMessage != null) {
    await writeActionCacheBestEffort(() =>
      cache.patchCachedMessage?.(action.ownerKey, { ...message, read: true }),
    );
  }
  return { status: "applied", ownerKey: action.ownerKey, message };
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
  store.getState().upsertMessage(message);
  useMessengerStore.getState().applyMessagePointer(action.ownerKey, message);

  const scope = conversationIds ?? [
    message.conversationId,
    conversationIdForStream(message.streamUuid),
  ];
  const changedMessages = store.getState().markMessagesReadUpTo(message.uuid, {
    conversationIds: scope,
  });
  const messagesToCache = new Map<string, MessengerMessage>([[message.uuid, message]]);
  for (const changedMessage of changedMessages) {
    messagesToCache.set(changedMessage.uuid, changedMessage);
  }

  if (cache?.advanceReadBoundary != null) {
    await writeActionCacheBestEffort(() => cache.advanceReadBoundary?.(boundary));
  }

  if (cache?.markCachedMessagesRead != null) {
    if (cache.patchCachedMessage != null) {
      await writeActionCacheBestEffort(() =>
        cache.patchCachedMessage?.(action.ownerKey, { ...message, read: true }),
      );
    }
    const messageUuids = [...messagesToCache.keys()].filter(
      (messageUuid) => cache.patchCachedMessage == null || messageUuid !== message.uuid,
    );
    if (messageUuids.length > 0) {
      await writeActionCacheBestEffort(() =>
        cache.markCachedMessagesRead?.(action.ownerKey, messageUuids),
      );
    }
  } else if (cache?.patchCachedMessage != null) {
    for (const changedMessage of messagesToCache.values()) {
      await writeActionCacheBestEffort(() =>
        cache.patchCachedMessage?.(action.ownerKey, { ...changedMessage, read: true }),
      );
    }
  }

  return { status: "applied", ownerKey: action.ownerKey, message };
}
