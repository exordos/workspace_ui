import {
  captureWorkspaceRuntimeRequestContext,
  isWorkspaceRuntimeRequestInvalidated,
  workspaceRuntimeOwnerKey,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContextGetter } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import {
  getMessagesPage as defaultGetMessagesPage,
  type MessengerCollectionPage,
  type MessengerClientOptions,
} from "~/shared/api/messenger-client";
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import type { WorkspaceMessengerMessageDto } from "~/shared/api/messenger.types";
import { adaptMessengerMessage } from "./messenger-adapters.lib";
import { parseMessengerConversationId } from "./messenger-ids.lib";
import {
  buildMessengerRequestOptions,
  type MessengerRequestOptionsOverrides,
} from "./messenger-request-options.lib";
import type { MessengerConversationId } from "./messenger.types";

// The first message page is loaded only after the user opens a conversation.
const DEFAULT_MESSAGES_PAGE_LIMIT = 50;

export interface MessengerMessagesClientDeps {
  getMessagesPage?: (
    options: MessengerClientOptions,
    query: {
      streamUuid?: string;
      topicUuid?: string;
      pageLimit?: number;
      pageMarker?: string | number;
    },
  ) => Promise<MessengerCollectionPage<WorkspaceMessengerMessageDto>>;
}

export interface MessengerMessagesStoreApi {
  getState: () => Pick<
    ReturnType<typeof useWorkspaceMessageStore.getState>,
    | "setMessagesLoading"
    | "setMessagesError"
    | "replaceOrMergeConversationMessagesPage"
    | "mergeConversationMessagesPage"
    | "setConversationPagination"
  >;
}

export type MessengerConversationMessagesResult =
  | {
      status: "applied";
      ownerKey: string;
      conversationId: MessengerConversationId;
      nextPageMarker: string | null;
      hasMore: boolean;
      pageLimit: number | null;
    }
  | {
      status: "skipped";
      ownerKey: string | null;
      reason: "missing-context" | "stale-owner" | "invalid-conversation";
    }
  | {
      status: "failed";
      ownerKey: string;
      conversationId: MessengerConversationId;
      error: string;
    };

export interface LoadMessengerConversationMessagesOptions {
  runtimeContext: WorkspaceRuntimeContext;
  conversationId: MessengerConversationId;
  pageLimit?: number;
  pageMarker?: string | number;
  getRuntimeContext?: WorkspaceRuntimeContextGetter;
  client?: MessengerMessagesClientDeps;
  clientOptions?: MessengerRequestOptionsOverrides;
  signal?: AbortSignal;
  store?: MessengerMessagesStoreApi;
}

function normalizeMessagesError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "Messenger messages loading failed";
}

// Stream conversations load by stream UUID; topic conversations add topic UUID.
export async function loadMessengerConversationMessages({
  runtimeContext,
  conversationId,
  pageLimit = DEFAULT_MESSAGES_PAGE_LIMIT,
  pageMarker,
  getRuntimeContext = () => runtimeContext,
  client = {},
  clientOptions,
  signal,
  store = useWorkspaceMessageStore,
}: LoadMessengerConversationMessagesOptions): Promise<MessengerConversationMessagesResult> {
  const requestContext = captureWorkspaceRuntimeRequestContext(() => runtimeContext);
  if (requestContext == null) {
    return { status: "skipped", ownerKey: null, reason: "missing-context" };
  }

  const ownerKey = workspaceRuntimeOwnerKey(requestContext);
  const parsedConversationId = parseMessengerConversationId(conversationId);
  if (parsedConversationId == null) {
    return { status: "skipped", ownerKey, reason: "invalid-conversation" };
  }

  if (isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal)) {
    return { status: "skipped", ownerKey, reason: "stale-owner" };
  }

  store.getState().setMessagesLoading(conversationId, true);
  store.getState().setMessagesError(conversationId, null);

  const requestOptions = buildMessengerRequestOptions(runtimeContext, clientOptions, signal);
  const query =
    parsedConversationId.kind === "stream"
      ? {
          streamUuid: parsedConversationId.streamUuid,
          pageLimit,
          pageMarker,
        }
      : {
          streamUuid: parsedConversationId.streamUuid,
          topicUuid: parsedConversationId.topicUuid,
          pageLimit,
          pageMarker,
        };

  try {
    const page = await (client.getMessagesPage ?? defaultGetMessagesPage)(requestOptions, query);

    if (isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal)) {
      store.getState().setMessagesLoading(conversationId, false);
      return { status: "skipped", ownerKey, reason: "stale-owner" };
    }

    const nextPageMarker = page.nextPageMarker;
    const hasMore = nextPageMarker != null;
    const messages = page.items.map(adaptMessengerMessage);
    const messageStore = store.getState();
    if (pageMarker == null) {
      messageStore.replaceOrMergeConversationMessagesPage(conversationId, messages);
    } else {
      messageStore.mergeConversationMessagesPage(conversationId, messages);
    }
    messageStore.setMessagesLoading(conversationId, false);
    messageStore.setMessagesError(conversationId, null);
    messageStore.setConversationPagination(conversationId, { nextPageMarker, hasMore });
    return {
      status: "applied",
      ownerKey,
      conversationId,
      nextPageMarker,
      hasMore,
      pageLimit: page.pageLimit,
    };
  } catch (error) {
    if (isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal)) {
      store.getState().setMessagesLoading(conversationId, false);
      return { status: "skipped", ownerKey, reason: "stale-owner" };
    }

    const message = normalizeMessagesError(error);
    store.getState().setMessagesLoading(conversationId, false);
    store.getState().setMessagesError(conversationId, message);
    return {
      status: "failed",
      ownerKey,
      conversationId,
      error: message,
    };
  }
}
