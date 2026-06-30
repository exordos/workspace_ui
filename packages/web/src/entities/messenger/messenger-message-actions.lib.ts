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
  markMessageRead as defaultMarkMessageRead,
} from "~/shared/api/messenger-messages.api";
import type {
  WorkspaceMessengerCreateMessageRequestBody,
  WorkspaceMessengerMessageDto,
  WorkspaceMessengerUpdateMessageRequestBody,
} from "~/shared/api/messenger.types";
import { adaptMessengerMessage } from "./messenger-adapters.lib";
import { conversationIdForStream } from "./messenger-ids.lib";
import { useMessengerStore } from "./messenger.model";
import type { MessengerStoreState } from "./messenger.model";
import {
  buildMessengerRequestOptions,
  type MessengerRequestOptionsOverrides,
} from "./messenger-request-options.lib";
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
  markMessageRead?: (
    options: MessengerClientOptions,
    messageUuid: string,
  ) => Promise<WorkspaceMessengerMessageDto>;
}

export interface MessengerMessageActionStoreApi {
  getState: () => Pick<
    MessengerStoreState,
    "indexMessageIntoConversationBuckets" | "applyMessageEdit" | "markMessageRead" | "removeMessage"
  >;
}

export interface MessengerMessageActionBaseOptions {
  runtimeContext: WorkspaceRuntimeContext;
  getRuntimeContext?: WorkspaceRuntimeContextGetter;
  clientOptions?: MessengerRequestOptionsOverrides;
  client?: MessengerMessageActionClientDeps;
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

function captureMessageAction(
  runtimeContext: WorkspaceRuntimeContext,
  getRuntimeContext: WorkspaceRuntimeContextGetter,
  signal: AbortSignal | undefined,
): { ownerKey: string; isStale: () => boolean } | { ownerKey: null; isStale: () => boolean } {
  // Owner guard нужен для переключения org/project: поздний ответ не должен попасть в новый чат.
  const requestContext = captureWorkspaceRuntimeRequestContext(() => runtimeContext);
  if (requestContext == null) {
    return { ownerKey: null, isStale: () => true };
  }

  return {
    ownerKey: workspaceRuntimeOwnerKey(requestContext),
    isStale: () => isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal),
  };
}

export async function sendMessengerMessage({
  runtimeContext,
  getRuntimeContext = () => runtimeContext,
  clientOptions,
  client = {},
  signal,
  store = useMessengerStore,
  streamUuid,
  topicUuid,
  markdown,
  includeStreamConversation = false,
}: SendMessengerMessageOptions): Promise<MessengerMessageActionResult> {
  // Отправка создаёт markdown payload в Workspace API и индексирует ответ в нужные списки сообщений.
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
  store.getState().indexMessageIntoConversationBuckets(action.ownerKey, message, {
    includeStreamConversation,
  });
  return { status: "applied", ownerKey: action.ownerKey, message };
}

export async function editMessengerMessage({
  runtimeContext,
  getRuntimeContext = () => runtimeContext,
  clientOptions,
  client = {},
  signal,
  store = useMessengerStore,
  messageUuid,
  markdown,
}: EditMessengerMessageOptions): Promise<MessengerMessageActionResult> {
  // Редактируем только payload сообщения; визуальный список обновится из нового messenger store.
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
  store.getState().applyMessageEdit(action.ownerKey, message.uuid, {
    markdown: message.markdown,
    updatedAt: message.updatedAt,
  });
  return { status: "applied", ownerKey: action.ownerKey, message };
}

export async function deleteMessengerMessage({
  runtimeContext,
  getRuntimeContext = () => runtimeContext,
  clientOptions,
  client = {},
  signal,
  store = useMessengerStore,
  messageUuid,
  streamUuid,
  topicUuid,
}: DeleteMessengerMessageOptions): Promise<MessengerMessageActionResult> {
  // Удаление убирает uuid из всех Workspace buckets, но не трогает старые Zulip stores.
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

  store.getState().removeMessage(action.ownerKey, {
    uuid: messageUuid,
    streamUuid,
    topicUuid,
  });
  return { status: "applied", ownerKey: action.ownerKey, message: null };
}

export async function markMessengerMessageRead({
  runtimeContext,
  getRuntimeContext = () => runtimeContext,
  clientOptions,
  client = {},
  signal,
  store = useMessengerStore,
  messageUuid,
  conversationIds,
}: MarkMessengerMessageReadOptions): Promise<MessengerMessageActionResult> {
  // Backend пока умеет отмечать прочитанным одно сообщение, поэтому batch делается выше, на странице.
  const action = captureMessageAction(runtimeContext, getRuntimeContext, signal);
  if (action.ownerKey == null)
    return { status: "skipped", ownerKey: null, reason: "missing-context" };
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  const dto = await (client.markMessageRead ?? defaultMarkMessageRead)(
    buildMessengerRequestOptions(runtimeContext, clientOptions, signal),
    messageUuid,
  );
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  const message = adaptMessengerMessage(dto);
  store.getState().markMessageRead(action.ownerKey, message.uuid, {
    conversationIds: conversationIds ?? [
      message.conversationId,
      conversationIdForStream(message.streamUuid),
    ],
  });
  return { status: "applied", ownerKey: action.ownerKey, message };
}
