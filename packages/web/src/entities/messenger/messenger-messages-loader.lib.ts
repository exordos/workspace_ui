import {
  captureWorkspaceRuntimeRequestContext,
  isWorkspaceRuntimeRequestInvalidated,
  workspaceRuntimeOwnerKey,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContextGetter } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import {
  getMessagesPage as defaultGetMessagesPage,
  type MessengerClientOptions,
  type MessengerCollectionPage,
} from "~/shared/api/messenger-client";
import type { WorkspaceMessengerMessageDto } from "~/shared/api/messenger.types";
import { adaptMessengerMessage } from "./messenger-adapters.lib";
import { parseMessengerConversationId } from "./messenger-ids.lib";
import { useMessengerStore } from "./messenger.model";
import type { MessengerStoreState } from "./messenger.model";
import type { MessengerConversationId } from "./messenger.types";

// The first message page is loaded only after the user opens a conversation.
const DEFAULT_MESSAGES_PAGE_LIMIT = 50;

type MessengerMessagesClientOptions = Pick<MessengerClientOptions, "baseUrl" | "fetchImpl">;

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
  getState: () => Pick<MessengerStoreState, "replaceConversationMessages">;
}

export type MessengerConversationMessagesResult =
  | {
      status: "applied";
      ownerKey: string;
      conversationId: MessengerConversationId;
      nextPageMarker: string | null;
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
  clientOptions?: MessengerMessagesClientOptions;
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
  store = useMessengerStore,
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

  const requestOptions: MessengerClientOptions = {
    ...clientOptions,
    accessToken: runtimeContext.accessToken,
    signal,
  };
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
      return { status: "skipped", ownerKey, reason: "stale-owner" };
    }

    store
      .getState()
      .replaceConversationMessages(ownerKey, conversationId, page.items.map(adaptMessengerMessage));
    return {
      status: "applied",
      ownerKey,
      conversationId,
      nextPageMarker: page.nextPageMarker,
      pageLimit: page.pageLimit,
    };
  } catch (error) {
    if (isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal)) {
      return { status: "skipped", ownerKey, reason: "stale-owner" };
    }

    return {
      status: "failed",
      ownerKey,
      conversationId,
      error: normalizeMessagesError(error),
    };
  }
}
