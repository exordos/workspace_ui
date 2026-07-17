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
import { getMessageWindowAroundMessage as defaultGetMessageWindowAroundMessage } from "~/shared/api/messenger-messages.api";
import type { WorkspaceMessengerMessageDto } from "~/shared/api/messenger.types";
import { adaptMessengerMessage } from "./messenger-adapters.lib";
import {
  readMessengerConversationWindowCache as defaultReadMessengerConversationWindowCache,
  writeMessengerConversationWindowCache as defaultWriteMessengerConversationWindowCache,
  type MessengerConversationCacheWindow,
} from "./messenger-cache.lib";
import {
  conversationIdForStream,
  conversationIdForTopic,
  isMessengerUuid,
  parseMessengerConversationId,
} from "./messenger-ids.lib";
import {
  hydrateMessengerOwnMessageReactionsFromCache as defaultHydrateMessengerOwnMessageReactionsFromCache,
  syncMessengerOwnerOwnMessageReactions as defaultSyncMessengerOwnerOwnMessageReactions,
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
      sortKey?: "created_at";
      sortDir?: "asc" | "desc";
    },
  ) => Promise<MessengerCollectionPage<WorkspaceMessengerMessageDto>>;
  getMessageWindowAroundMessage?: typeof defaultGetMessageWindowAroundMessage;
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
  syncOwner?: typeof defaultSyncMessengerOwnerOwnMessageReactions;
}

export interface MessengerMessagesStoreApi {
  getState: () => Pick<
    ReturnType<typeof useWorkspaceMessageStore.getState>,
    | "setMessagesLoading"
    | "setMessagesError"
    | "replaceOrMergeConversationMessagesPage"
    | "replaceConversationMessagesWindow"
    | "mergeConversationMessagesPage"
    | "setConversationPagination"
    | "setConversationWindowMarkers"
    | "beforePageMarkerByConversationId"
    | "afterPageMarkerByConversationId"
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

export type MessengerMessageWindowResult =
  | {
      status: "applied";
      ownerKey: string;
      conversationId: MessengerConversationId;
      anchorUuid: MessengerUuid;
      beforePageMarker: string | null;
      afterPageMarker: string | null;
      beforeLimit: number | null;
      afterLimit: number | null;
    }
  | {
      status: "skipped";
      ownerKey: string | null;
      reason: "missing-context" | "stale-owner" | "invalid-conversation";
    }
  | {
      status: "failed";
      ownerKey: string;
      conversationId: MessengerConversationId | null;
      error: string;
    };

export type MessengerMessageWindowPageDirection = "before" | "after";

export type MessengerMessageWindowPageResult =
  | {
      status: "applied";
      ownerKey: string;
      conversationId: MessengerConversationId;
      direction: MessengerMessageWindowPageDirection;
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
      direction: MessengerMessageWindowPageDirection;
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

export interface LoadMessengerMessageWindowAroundMessageOptions {
  runtimeContext: WorkspaceRuntimeContext;
  conversationId?: MessengerConversationId;
  messageUuid: MessengerUuid;
  beforeLimit?: number;
  afterLimit?: number;
  getRuntimeContext?: WorkspaceRuntimeContextGetter;
  client?: MessengerMessagesClientDeps;
  ownReactionSync?: MessengerMessagesOwnReactionSyncDeps;
  clientOptions?: MessengerRequestOptionsOverrides;
  signal?: AbortSignal;
  store?: MessengerMessagesStoreApi;
}

export interface LoadMessengerMessageWindowPageOptions {
  runtimeContext: WorkspaceRuntimeContext;
  conversationId: MessengerConversationId;
  direction: MessengerMessageWindowPageDirection;
  pageMarker: string;
  pageLimit?: number;
  getRuntimeContext?: WorkspaceRuntimeContextGetter;
  client?: MessengerMessagesClientDeps;
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

function conversationIdFromMessageAnchor(
  anchor: WorkspaceMessengerMessageDto,
): MessengerConversationId | null {
  if (!isMessengerUuid(anchor.stream_uuid)) {
    return null;
  }
  if (isMessengerUuid(anchor.topic_uuid)) {
    return conversationIdForTopic(anchor.stream_uuid, anchor.topic_uuid);
  }
  return conversationIdForStream(anchor.stream_uuid);
}

function messageUuidsForOwnReactionSync(messages: readonly MessengerMessage[]): MessengerUuid[] {
  // Own-reaction projection lives outside the message aggregate, so sync only
  // needs visible UUIDs and does not require loader knowledge of cache rows.
  return messages.map((message) => message.uuid);
}

function haveSameMessageUuids(
  left: readonly MessengerUuid[],
  right: readonly MessengerUuid[],
): boolean {
  if (left.length !== right.length) return false;

  const leftUuids = new Set(left);
  const rightUuids = new Set(right);
  if (leftUuids.size !== rightUuids.size) return false;

  return left.every((uuid) => rightUuids.has(uuid));
}

async function hydrateVisibleOwnReactionsFromCache({
  runtimeContext,
  getRuntimeContext,
  signal,
  ownReactionSync,
  messages,
}: {
  runtimeContext: WorkspaceRuntimeContext;
  getRuntimeContext: WorkspaceRuntimeContextGetter;
  signal: AbortSignal | undefined;
  ownReactionSync: MessengerMessagesOwnReactionSyncDeps | undefined;
  messages: readonly MessengerMessage[];
}): Promise<MessengerUuid[]> {
  const messageUuids = messageUuidsForOwnReactionSync(messages);
  if (messageUuids.length === 0) return [];

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
    // IDB hydration failures must not break message history; server sync can
    // still restore current own-reaction rows.
  }
  return messageUuids;
}

function scheduleVisibleOwnReactionSync({
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
  // Server sync is intentionally backgrounded: cache hydration should restore
  // highlighting quickly after reload, and server checks must not block opening.
  const syncOwner = ownReactionSync?.syncOwner ?? defaultSyncMessengerOwnerOwnMessageReactions;
  void syncOwner({
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
  const messageUuids = await hydrateVisibleOwnReactionsFromCache({
    runtimeContext,
    getRuntimeContext,
    signal,
    ownReactionSync,
    messages,
  });
  if (messageUuids.length === 0) return;

  scheduleVisibleOwnReactionSync({
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
    const cachedOwnReactionSyncUuids = await hydrateVisibleOwnReactionsFromCache({
      runtimeContext,
      getRuntimeContext,
      signal,
      ownReactionSync,
      messages: cachedWindow.messages,
    });
    if (cachedOwnReactionSyncUuids.length > 0) {
      scheduleVisibleOwnReactionSync({
        runtimeContext,
        getRuntimeContext,
        clientOptions,
        signal,
        ownReactionSync,
        messageUuids: cachedOwnReactionSyncUuids,
      });
    }
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
          sortKey: "created_at" as const,
          sortDir: "desc" as const,
        }
      : {
          streamUuid: parsedConversationId.streamUuid,
          topicUuid: parsedConversationId.topicUuid,
          pageLimit,
          pageMarker,
          sortKey: "created_at" as const,
          sortDir: "desc" as const,
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
    if (messages.length > 0) {
      const serverMessageUuids = messageUuidsForOwnReactionSync(messages);
      const cachedMessageUuids = messageUuidsForOwnReactionSync(cachedWindow.messages);
      if (!haveSameMessageUuids(serverMessageUuids, cachedMessageUuids)) {
        await syncVisibleOwnReactionsFromCacheThenServer({
          runtimeContext,
          getRuntimeContext,
          clientOptions,
          signal,
          ownReactionSync,
          messages,
        });
      }
    }
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

export async function loadMessengerMessageWindowAroundMessage({
  runtimeContext,
  conversationId,
  messageUuid,
  beforeLimit,
  afterLimit,
  getRuntimeContext = () => runtimeContext,
  client = {},
  ownReactionSync,
  clientOptions,
  signal,
  store = useWorkspaceMessageStore,
}: LoadMessengerMessageWindowAroundMessageOptions): Promise<MessengerMessageWindowResult> {
  const requestContext = captureWorkspaceRuntimeRequestContext(() => runtimeContext);
  if (requestContext == null) {
    return { status: "skipped", ownerKey: null, reason: "missing-context" };
  }

  const ownerKey = workspaceRuntimeOwnerKey(requestContext);
  const parsedConversationId =
    conversationId == null ? null : parseMessengerConversationId(conversationId);
  if (conversationId != null && parsedConversationId == null) {
    return { status: "skipped", ownerKey, reason: "invalid-conversation" };
  }

  if (isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal)) {
    return { status: "skipped", ownerKey, reason: "stale-owner" };
  }

  if (conversationId != null) {
    store.getState().setMessagesLoading(conversationId, true);
    store.getState().setMessagesError(conversationId, null);
  }

  const requestOptions = buildMessengerRequestOptions(runtimeContext, clientOptions, signal);
  const query =
    parsedConversationId == null
      ? {
          messageUuid,
          beforeLimit,
          afterLimit,
        }
      : parsedConversationId.kind === "stream"
        ? {
            messageUuid,
            streamUuid: parsedConversationId.streamUuid,
            beforeLimit,
            afterLimit,
          }
        : {
            messageUuid,
            streamUuid: parsedConversationId.streamUuid,
            topicUuid: parsedConversationId.topicUuid,
            beforeLimit,
            afterLimit,
          };

  try {
    const window = await (
      client.getMessageWindowAroundMessage ?? defaultGetMessageWindowAroundMessage
    )(requestOptions, query);
    const appliedConversationId = conversationId ?? conversationIdFromMessageAnchor(window.anchor);
    if (appliedConversationId == null) {
      throw new TypeError("Expected message window anchor with valid stream uuid");
    }
    const messages = window.items.map(adaptMessengerMessage);

    if (isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal)) {
      if (conversationId != null) {
        store.getState().setMessagesLoading(appliedConversationId, false);
      }
      return { status: "skipped", ownerKey, reason: "stale-owner" };
    }

    const messageStore = store.getState();
    messageStore.replaceConversationMessagesWindow(appliedConversationId, messages);
    messageStore.setConversationWindowMarkers(appliedConversationId, {
      beforePageMarker: window.beforePageMarker,
      afterPageMarker: window.afterPageMarker,
    });
    await syncVisibleOwnReactionsFromCacheThenServer({
      runtimeContext,
      getRuntimeContext,
      clientOptions,
      signal,
      ownReactionSync,
      messages,
    });
    messageStore.setMessagesLoading(appliedConversationId, false);
    messageStore.setMessagesError(appliedConversationId, null);

    return {
      status: "applied",
      ownerKey,
      conversationId: appliedConversationId,
      anchorUuid: window.anchor.uuid,
      beforePageMarker: window.beforePageMarker,
      afterPageMarker: window.afterPageMarker,
      beforeLimit: beforeLimit ?? null,
      afterLimit: afterLimit ?? null,
    };
  } catch (error) {
    if (isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal)) {
      if (conversationId != null) {
        store.getState().setMessagesLoading(conversationId, false);
      }
      return { status: "skipped", ownerKey, reason: "stale-owner" };
    }

    const message = normalizeMessagesError(error);
    if (conversationId != null) {
      store.getState().setMessagesLoading(conversationId, false);
      store.getState().setMessagesError(conversationId, message);
    }
    return {
      status: "failed",
      ownerKey,
      conversationId: conversationId ?? null,
      error: message,
    };
  }
}

export async function loadMessengerMessageWindowPage({
  runtimeContext,
  conversationId,
  direction,
  pageMarker,
  pageLimit = DEFAULT_MESSAGES_PAGE_LIMIT,
  getRuntimeContext = () => runtimeContext,
  client = {},
  ownReactionSync,
  clientOptions,
  signal,
  store = useWorkspaceMessageStore,
}: LoadMessengerMessageWindowPageOptions): Promise<MessengerMessageWindowPageResult> {
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
          sortKey: "created_at" as const,
          sortDir: direction === "before" ? ("desc" as const) : ("asc" as const),
        }
      : {
          streamUuid: parsedConversationId.streamUuid,
          topicUuid: parsedConversationId.topicUuid,
          pageLimit,
          pageMarker,
          sortKey: "created_at" as const,
          sortDir: direction === "before" ? ("desc" as const) : ("asc" as const),
        };

  try {
    const page = await (client.getMessagesPage ?? defaultGetMessagesPage)(requestOptions, query);

    if (isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal)) {
      store.getState().setMessagesLoading(conversationId, false);
      return { status: "skipped", ownerKey, reason: "stale-owner" };
    }

    const pageItems = direction === "before" ? [...page.items].reverse() : page.items;
    const messages = pageItems.map(adaptMessengerMessage);
    const nextPageMarker = page.nextPageMarker;
    const messageStore = store.getState();
    messageStore.mergeConversationMessagesPage(conversationId, messages);
    messageStore.setConversationWindowMarkers(conversationId, {
      beforePageMarker:
        direction === "before"
          ? nextPageMarker
          : (messageStore.beforePageMarkerByConversationId[conversationId] ?? null),
      afterPageMarker:
        direction === "after"
          ? nextPageMarker
          : (messageStore.afterPageMarkerByConversationId[conversationId] ?? null),
    });
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

    return {
      status: "applied",
      ownerKey,
      conversationId,
      direction,
      nextPageMarker,
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
      direction,
      error: message,
    };
  }
}
