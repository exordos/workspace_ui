import { useWorkspaceMessageStore } from "~/entities/message/message.model";
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
import type { WorkspaceMessengerMessageDto } from "~/shared/api/messenger.types";
import { adaptMessengerMessage } from "./messenger-adapters.lib";
import {
  readMessengerConversationWindowCache as defaultReadMessengerConversationWindowCache,
  writeMessengerConversationWindowCache as defaultWriteMessengerConversationWindowCache,
  type MessengerConversationCacheWindow,
} from "./messenger-cache.lib";
import { parseMessengerConversationId } from "./messenger-ids.lib";
import {
  hydrateMessengerOwnMessageReactionsFromCache as defaultHydrateMessengerOwnMessageReactionsFromCache,
  revalidateMessengerOwnMessageReactions as defaultRevalidateMessengerOwnMessageReactions,
} from "./messenger-message-reactions-actions.lib";
import {
  buildMessengerRequestOptions,
  type MessengerRequestOptionsOverrides,
} from "./messenger-request-options.lib";
import type { MessengerConversationId, MessengerMessage, MessengerUuid } from "./messenger.types";

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

export interface MessengerMessagesCacheDeps {
  readConversationMessageWindow?: (
    ownerKey: string,
    conversationId: MessengerConversationId,
  ) => Promise<MessengerConversationCacheWindow>;
  writeConversationMessagePage?: (
    ownerKey: string,
    conversationId: MessengerConversationId,
    page: {
      messages: ReturnType<typeof adaptMessengerMessage>[];
      nextPageMarker: string | null;
      hasMore: boolean;
    },
  ) => Promise<void> | void;
}

export interface MessengerMessagesOwnReactionSyncDeps {
  hydrateFromCache?: typeof defaultHydrateMessengerOwnMessageReactionsFromCache;
  revalidate?: typeof defaultRevalidateMessengerOwnMessageReactions;
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
  cache?: MessengerMessagesCacheDeps;
  ownReactionSync?: MessengerMessagesOwnReactionSyncDeps;
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

function writeMessagesCacheBestEffort(write: () => Promise<void> | void): void {
  try {
    const result = write();
    if (result instanceof Promise) {
      void result.catch(() => undefined);
    }
  } catch {
    // Cache failures must not block message loading.
  }
}

function messageUuidsForOwnReactionSync(messages: readonly MessengerMessage[]): MessengerUuid[] {
  // Own projection хранится отдельно от message aggregate, поэтому sync работает
  // только по видимым uuid и не требует от loader знания reactionUuid или cache rows.
  return messages.map((message) => message.uuid);
}

function scheduleVisibleOwnReactionRevalidate({
  runtimeContext,
  getRuntimeContext,
  clientOptions,
  signal,
  ownReactionSync,
  messageUuids,
}: {
  runtimeContext: WorkspaceRuntimeContext;
  getRuntimeContext: WorkspaceRuntimeContextGetter;
  clientOptions: MessengerRequestOptionsOverrides | undefined;
  signal: AbortSignal | undefined;
  ownReactionSync: MessengerMessagesOwnReactionSyncDeps | undefined;
  messageUuids: readonly MessengerUuid[];
}): void {
  // Revalidate намеренно фоновый: cache hydrate должен быстро вернуть подсветку
  // после reload, а серверная сверка не должна блокировать открытие чата.
  const revalidate = ownReactionSync?.revalidate ?? defaultRevalidateMessengerOwnMessageReactions;
  void revalidate({
    runtimeContext,
    getRuntimeContext,
    clientOptions,
    signal,
    messageUuids,
  }).catch(() => undefined);
}

async function syncVisibleOwnReactionsFromCacheThenServer({
  runtimeContext,
  getRuntimeContext,
  clientOptions,
  signal,
  ownReactionSync,
  messages,
}: {
  runtimeContext: WorkspaceRuntimeContext;
  getRuntimeContext: WorkspaceRuntimeContextGetter;
  clientOptions: MessengerRequestOptionsOverrides | undefined;
  signal: AbortSignal | undefined;
  ownReactionSync: MessengerMessagesOwnReactionSyncDeps | undefined;
  messages: readonly MessengerMessage[];
}): Promise<void> {
  const messageUuids = messageUuidsForOwnReactionSync(messages);
  if (messageUuids.length === 0) return;

  const hydrate =
    ownReactionSync?.hydrateFromCache ?? defaultHydrateMessengerOwnMessageReactionsFromCache;
  try {
    await hydrate({
      runtimeContext,
      getRuntimeContext,
      signal,
      messageUuids,
    });
  } catch {
    // Сбой IDB hydrate не должен ломать историю сообщений: серверная revalidate
    // ниже все равно попробует восстановить актуальные own rows.
  }
  scheduleVisibleOwnReactionRevalidate({
    runtimeContext,
    getRuntimeContext,
    clientOptions,
    signal,
    ownReactionSync,
    messageUuids,
  });
}

// Stream conversations load by stream UUID; topic conversations add topic UUID.
export async function loadMessengerConversationMessages({
  runtimeContext,
  conversationId,
  pageLimit = DEFAULT_MESSAGES_PAGE_LIMIT,
  pageMarker,
  getRuntimeContext = () => runtimeContext,
  client = {},
  cache = {
    readConversationMessageWindow: defaultReadMessengerConversationWindowCache,
    writeConversationMessagePage: defaultWriteMessengerConversationWindowCache,
  },
  ownReactionSync,
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

  const cachedWindow = await (
    cache.readConversationMessageWindow ?? defaultReadMessengerConversationWindowCache
  )(ownerKey, conversationId);
  if (isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal)) {
    return { status: "skipped", ownerKey, reason: "stale-owner" };
  }
  if (cachedWindow.messages.length > 0) {
    const cachedStore = store.getState();
    cachedStore.replaceOrMergeConversationMessagesPage(conversationId, cachedWindow.messages);
    cachedStore.setConversationPagination(conversationId, {
      nextPageMarker: cachedWindow.nextPageMarker,
      hasMore: cachedWindow.hasMore,
    });
    await syncVisibleOwnReactionsFromCacheThenServer({
      runtimeContext,
      getRuntimeContext,
      clientOptions,
      signal,
      ownReactionSync,
      messages: cachedWindow.messages,
    });
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
    await syncVisibleOwnReactionsFromCacheThenServer({
      runtimeContext,
      getRuntimeContext,
      clientOptions,
      signal,
      ownReactionSync,
      messages,
    });
    messageStore.setMessagesLoading(conversationId, false);
    messageStore.setMessagesError(conversationId, null);
    messageStore.setConversationPagination(conversationId, { nextPageMarker, hasMore });
    writeMessagesCacheBestEffort(() =>
      (cache.writeConversationMessagePage ?? defaultWriteMessengerConversationWindowCache)(
        ownerKey,
        conversationId,
        {
          messages,
          nextPageMarker,
          hasMore,
        },
      ),
    );
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
