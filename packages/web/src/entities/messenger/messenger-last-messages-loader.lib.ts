import {
  useWorkspaceMessageStore,
  type WorkspaceMessageStoreState,
} from "~/entities/message/message.model";
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
import {
  readMessengerMessageBodyCache,
  writeMessengerMessageBodyCache,
} from "./messenger-cache.lib";
import {
  buildMessengerRequestOptions,
  type MessengerRequestOptionsOverrides,
} from "./messenger-request-options.lib";
import { useMessengerStore } from "./messenger.model";
import type { MessengerStoreState } from "./messenger.model";
import type { MessengerBootstrapPayload, MessengerMessage, MessengerUuid } from "./messenger.types";

// This loader is only for sidebar previews.
// Bootstrap brings the last message uuid, and message text is loaded with a separate lightweight request.
export type MessengerLastMessagesClientCall = (
  options: MessengerClientOptions,
  messageUuids: MessengerUuid[],
) => Promise<WorkspaceMessengerMessageDto[]>;

export interface MessengerLastMessagesClientDeps {
  getMessagesByUuids?: MessengerLastMessagesClientCall;
}

export interface MessengerLastMessagesCacheDeps {
  readMessagesByUuids?: (
    ownerKey: string,
    messageUuids: readonly MessengerUuid[],
  ) => Promise<MessengerMessage[]>;
  writeMessages?: (ownerKey: string, messages: readonly MessengerMessage[]) => Promise<void>;
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
  >;
}

export interface MessengerLastMessagesMessageStoreApi {
  getState: () => Pick<WorkspaceMessageStoreState, "upsertMessageBody">;
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
  cache?: MessengerLastMessagesCacheDeps;
  clientOptions?: MessengerRequestOptionsOverrides;
  signal?: AbortSignal;
  store?: MessengerLastMessagesStoreApi;
  messageStore?: MessengerLastMessagesMessageStoreApi;
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
  >,
): MessengerUuid[] {
  const seen = new Set<MessengerUuid>();
  const messageUuids: MessengerUuid[] = [];
  const add = (messageUuid: MessengerUuid | null | undefined) => {
    if (messageUuid == null || seen.has(messageUuid)) {
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

export function collectMessengerLastMessageUuidsFromPayload(
  payload: Pick<MessengerBootstrapPayload, "streams" | "topics" | "conversations">,
): MessengerUuid[] {
  const seen = new Set<MessengerUuid>();
  const messageUuids: MessengerUuid[] = [];
  const add = (messageUuid: MessengerUuid | null | undefined) => {
    if (messageUuid == null || seen.has(messageUuid)) {
      return;
    }

    seen.add(messageUuid);
    messageUuids.push(messageUuid);
  };

  for (const stream of payload.streams) {
    add(stream.lastMessageUuid);
  }

  for (const topic of payload.topics) {
    add(topic.lastMessageUuid);
  }

  for (const conversation of payload.conversations) {
    add(conversation.lastMessageUuid);
  }

  return messageUuids;
}

const defaultGetMessagesByUuids: MessengerLastMessagesClientCall = getMessagesByUuids;
const defaultReadMessagesByUuids = readMessengerMessageBodyCache;
const defaultWriteMessages = writeMessengerMessageBodyCache;

function normalizeLastMessagesError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "Messenger last messages loading failed";
}

export async function primeMessengerLastMessagesFromCache({
  ownerKey,
  payload,
  cache = {},
  messageStore = useWorkspaceMessageStore,
}: {
  ownerKey: string;
  payload: Pick<MessengerBootstrapPayload, "streams" | "topics" | "conversations">;
  cache?: MessengerLastMessagesCacheDeps;
  messageStore?: MessengerLastMessagesMessageStoreApi;
}): Promise<number> {
  const messageUuids = collectMessengerLastMessageUuidsFromPayload(payload);
  if (messageUuids.length === 0) return 0;

  const cachedMessages = await (cache.readMessagesByUuids ?? defaultReadMessagesByUuids)(
    ownerKey,
    messageUuids,
  ).catch((): MessengerMessage[] => []);

  const messageStoreState = messageStore.getState();
  for (const message of cachedMessages) {
    messageStoreState.upsertMessageBody(message);
  }

  return cachedMessages.length;
}

export async function loadMessengerLastMessagesForSidebar({
  runtimeContext,
  getRuntimeContext = () => runtimeContext,
  client = {},
  cache = {},
  clientOptions,
  signal,
  store = useMessengerStore,
  messageStore = useWorkspaceMessageStore,
}: LoadMessengerLastMessagesForSidebarOptions): Promise<MessengerLastMessagesResult> {
  // Owner guard handles the case where the user switched projects before an old response arrived.
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

  const cachedMessages = await (cache.readMessagesByUuids ?? defaultReadMessagesByUuids)(
    ownerKey,
    messageUuids,
  ).catch((): MessengerMessage[] => []);

  if (isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal)) {
    return { status: "skipped", ownerKey, reason: "stale-owner" };
  }

  const messageStoreState = messageStore.getState();
  const cachedMessageUuids = new Set<MessengerUuid>();
  for (const message of cachedMessages) {
    cachedMessageUuids.add(message.uuid);
    messageStoreState.upsertMessageBody(message);
  }

  const missingMessageUuids = messageUuids.filter(
    (messageUuid) => !cachedMessageUuids.has(messageUuid),
  );
  if (missingMessageUuids.length === 0) {
    return {
      status: "loaded",
      ownerKey,
      requested: 0,
      applied: cachedMessages.length,
    };
  }

  const requestOptions = buildMessengerRequestOptions(runtimeContext, clientOptions, signal);

  try {
    const messages = await (client.getMessagesByUuids ?? defaultGetMessagesByUuids)(
      requestOptions,
      missingMessageUuids,
    );

    if (isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal)) {
      return { status: "skipped", ownerKey, reason: "stale-owner" };
    }

    const adaptedMessages = messages.map(adaptMessengerMessage);
    for (const message of adaptedMessages) {
      messageStoreState.upsertMessageBody(message);
    }
    try {
      await (cache.writeMessages ?? defaultWriteMessages)(ownerKey, adaptedMessages);
    } catch {
      // Cache write is best-effort; the sidebar state was already updated from the network.
    }

    return {
      status: "loaded",
      ownerKey,
      requested: missingMessageUuids.length,
      applied: cachedMessages.length + messages.length,
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
