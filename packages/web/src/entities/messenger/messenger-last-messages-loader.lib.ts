import {
  captureWorkspaceRuntimeRequestContext,
  isWorkspaceRuntimeRequestInvalidated,
  workspaceRuntimeOwnerKey,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContextGetter } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { getMessagesByUuids } from "~/shared/api/messenger-client";
import type { MessengerClientOptions } from "~/shared/api/messenger-client";
import type { WorkspaceMessengerMessageDto } from "~/shared/api/messenger.types";
import { adaptMessengerMessage } from "./messenger-adapters.lib";
import { useMessengerStore } from "./messenger.model";
import type { MessengerStoreState } from "./messenger.model";
import {
  buildMessengerRequestOptions,
  type MessengerRequestOptionsOverrides,
} from "./messenger-request-options.lib";
import type { MessengerUuid } from "./messenger.types";

// Этот loader нужен только для превью в сайдбаре.
// Bootstrap приносит uuid последнего сообщения, а текст сообщения догружается отдельным лёгким запросом.
export type MessengerLastMessagesClientCall = (
  options: MessengerClientOptions,
  messageUuids: MessengerUuid[],
) => Promise<WorkspaceMessengerMessageDto[]>;

export interface MessengerLastMessagesClientDeps {
  getMessagesByUuids?: MessengerLastMessagesClientCall;
}

export interface MessengerLastMessagesStoreApi {
  getState: () => Pick<
    MessengerStoreState,
    | "streamIds"
    | "streamsById"
    | "topicIds"
    | "topicsById"
    | "conversationIds"
    | "conversationsById"
    | "messagesById"
    | "upsertMessage"
  >;
}

export type MessengerLastMessagesResult =
  | {
      status: "loaded";
      ownerKey: string;
      requested: number;
      applied: number;
    }
  | {
      status: "skipped";
      ownerKey: string | null;
      reason: "missing-context" | "stale-owner";
    }
  | {
      status: "failed";
      ownerKey: string;
      error: string;
    };

export interface LoadMessengerLastMessagesForSidebarOptions {
  runtimeContext: WorkspaceRuntimeContext;
  getRuntimeContext?: WorkspaceRuntimeContextGetter;
  client?: MessengerLastMessagesClientDeps;
  clientOptions?: MessengerRequestOptionsOverrides;
  signal?: AbortSignal;
  store?: MessengerLastMessagesStoreApi;
}

export function collectMessengerLastMessageUuids(
  state: Pick<
    MessengerStoreState,
    | "streamIds"
    | "streamsById"
    | "topicIds"
    | "topicsById"
    | "conversationIds"
    | "conversationsById"
    | "messagesById"
  >,
): MessengerUuid[] {
  // Собираем только отсутствующие сообщения, чтобы не перетирать уже открытый чат и не плодить запросы.
  const seen = new Set<MessengerUuid>();
  const messageUuids: MessengerUuid[] = [];
  const add = (messageUuid: MessengerUuid | null | undefined) => {
    if (messageUuid == null || seen.has(messageUuid) || state.messagesById[messageUuid] != null) {
      return;
    }

    seen.add(messageUuid);
    messageUuids.push(messageUuid);
  };

  for (const streamId of state.streamIds) {
    add(state.streamsById[streamId]?.lastMessageUuid);
  }

  for (const topicId of state.topicIds) {
    add(state.topicsById[topicId]?.lastMessageUuid);
  }

  for (const conversationId of state.conversationIds) {
    add(state.conversationsById[conversationId]?.lastMessageUuid);
  }

  return messageUuids;
}

const defaultGetMessagesByUuids: MessengerLastMessagesClientCall = getMessagesByUuids;

function normalizeLastMessagesError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "Messenger last messages loading failed";
}

export async function loadMessengerLastMessagesForSidebar({
  runtimeContext,
  getRuntimeContext = () => runtimeContext,
  client = {},
  clientOptions,
  signal,
  store = useMessengerStore,
}: LoadMessengerLastMessagesForSidebarOptions): Promise<MessengerLastMessagesResult> {
  // Owner guard защищает от ситуации: пользователь переключил проект, а старый ответ всё ещё пришёл.
  const requestContext = captureWorkspaceRuntimeRequestContext(() => runtimeContext);
  if (requestContext == null) {
    return { status: "skipped", ownerKey: null, reason: "missing-context" };
  }

  const ownerKey = workspaceRuntimeOwnerKey(requestContext);
  if (isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal)) {
    return { status: "skipped", ownerKey, reason: "stale-owner" };
  }

  const messageUuids = collectMessengerLastMessageUuids(store.getState());
  if (messageUuids.length === 0) {
    return { status: "loaded", ownerKey, requested: 0, applied: 0 };
  }

  const requestOptions = buildMessengerRequestOptions(runtimeContext, clientOptions, signal);

  try {
    const messages = await (client.getMessagesByUuids ?? defaultGetMessagesByUuids)(
      requestOptions,
      messageUuids,
    );

    if (isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal)) {
      return { status: "skipped", ownerKey, reason: "stale-owner" };
    }

    const storeState = store.getState();
    for (const message of messages.map(adaptMessengerMessage)) {
      storeState.upsertMessage(ownerKey, message);
    }

    return {
      status: "loaded",
      ownerKey,
      requested: messageUuids.length,
      applied: messages.length,
    };
  } catch (error) {
    if (isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal)) {
      return { status: "skipped", ownerKey, reason: "stale-owner" };
    }

    return {
      status: "failed",
      ownerKey,
      error: normalizeLastMessagesError(error),
    };
  }
}
