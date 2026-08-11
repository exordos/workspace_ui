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
import {
  getMessage as defaultGetMessage,
  getMessagePagesAroundResolvedMessage as defaultGetMessagePagesAroundResolvedMessage,
} from "~/shared/api/messenger-messages.api";
import type { WorkspaceMessengerMessageDto } from "~/shared/api/messenger.types";
import { createLogger } from "~/shared/lib/logger";
import { adaptMessengerMessage } from "./messenger-adapters.lib";
import {
  readMessengerConversationWindowCache as defaultReadMessengerConversationWindowCache,
  readMessengerCachedReadBoundaries as defaultReadMessengerCachedReadBoundaries,
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
  applyMessengerReadBoundaries,
  restoreMessengerReadBoundaries,
} from "./messenger-read-boundary.lib";
import {
  buildMessengerRequestOptions,
  type MessengerRequestOptionsOverrides,
} from "./messenger-request-options.lib";
import type { MessengerConversationId, MessengerMessage, MessengerUuid } from "./messenger.types";

// The first message page is loaded only after the user opens a conversation.
const DEFAULT_MESSAGES_PAGE_LIMIT = 50;
const log = createLogger("messenger-messages-loader");

export interface MessengerMessagesClientDeps {
  getMessagesPage?: (
    options: MessengerClientOptions,
    query: MessengerMessagesPageQuery,
  ) => Promise<MessengerCollectionPage<WorkspaceMessengerMessageDto>>;
  getMessage?: typeof defaultGetMessage;
  getMessagePagesAroundResolvedMessage?: typeof defaultGetMessagePagesAroundResolvedMessage;
}

interface MessengerMessagesPageQuery {
  streamUuid?: string;
  topicUuid?: string;
  pageLimit?: number;
  pageMarker?: string | number;
  sortKey?: "created_at";
  sortDir?: "asc" | "desc";
}

export interface MessengerMessagesCacheDeps {
  readReadBoundaries?: (
    ownerKey: string,
  ) => ReturnType<typeof defaultReadMessengerCachedReadBoundaries>;
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
    isWriteCurrent?: () => boolean,
  ) => Promise<void> | void;
}

export interface MessengerReadBoundaryCacheDeps {
  readReadBoundaries?: (
    ownerKey: string,
  ) => ReturnType<typeof defaultReadMessengerCachedReadBoundaries>;
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
    | "upsertMessageBodyFromSnapshot"
    | "replaceConversationWindow"
    | "mergeConversationWindowPage"
    | "conversationWindowsById"
    | "messageMutationRevision"
    | "messagesById"
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
      reason: "missing-context" | "stale-owner" | "stale-window" | "invalid-conversation";
    }
  | {
      status: "failed";
      ownerKey: string;
      conversationId: MessengerConversationId;
      error: string;
    };

export type MessengerMessageAnchorResolveResult =
  | {
      status: "resolved";
      ownerKey: string;
      conversationId: MessengerConversationId;
      message: MessengerMessage;
    }
  | {
      status: "skipped";
      ownerKey: string | null;
      reason: "missing-context" | "stale-owner" | "stale-window";
    }
  | {
      status: "failed";
      ownerKey: string;
      conversationId: MessengerConversationId | null;
      error: string;
    };

export interface MessengerFetchedMessageWindow {
  ownerKey: string;
  conversationId: MessengerConversationId;
  anchorUuid: MessengerUuid;
  messages: MessengerMessage[];
  beforePageMarker: string | null;
  afterPageMarker: string | null;
  expectedWindowRevision: number | null;
  capturedMutationRevision: number;
}

export type MessengerMessageWindowFetchResult =
  | { status: "fetched"; window: MessengerFetchedMessageWindow }
  | {
      status: "skipped";
      ownerKey: string | null;
      reason: "missing-context" | "stale-owner" | "stale-window";
    }
  | {
      status: "failed";
      ownerKey: string;
      conversationId: MessengerConversationId;
      error: string;
    };

export type MessengerMessageWindowApplyResult =
  | {
      status: "applied";
      ownerKey: string;
      conversationId: MessengerConversationId;
      anchorUuid: MessengerUuid;
    }
  | {
      status: "skipped";
      ownerKey: string | null;
      reason: "missing-context" | "stale-owner" | "stale-window";
    }
  | {
      status: "failed";
      ownerKey: string;
      conversationId: MessengerConversationId;
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
      reason: "missing-context" | "stale-owner" | "stale-window" | "invalid-conversation";
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

export interface ResolveMessengerMessageAnchorOptions {
  runtimeContext: WorkspaceRuntimeContext;
  messageUuid: MessengerUuid;
  getRuntimeContext?: WorkspaceRuntimeContextGetter;
  client?: MessengerMessagesClientDeps;
  clientOptions?: MessengerRequestOptionsOverrides;
  signal?: AbortSignal;
  store?: MessengerMessagesStoreApi;
}

export interface FetchMessengerMessageWindowOptions {
  runtimeContext: WorkspaceRuntimeContext;
  anchor: Extract<MessengerMessageAnchorResolveResult, { status: "resolved" }>;
  targetConversationId: MessengerConversationId;
  beforeLimit?: number;
  afterLimit?: number;
  getRuntimeContext?: WorkspaceRuntimeContextGetter;
  client?: MessengerMessagesClientDeps;
  clientOptions?: MessengerRequestOptionsOverrides;
  signal?: AbortSignal;
  store?: MessengerMessagesStoreApi;
}

export interface ApplyMessengerMessageWindowOptions {
  runtimeContext: WorkspaceRuntimeContext;
  window: MessengerFetchedMessageWindow;
  isRequestCurrent: () => boolean;
  mode?: "around-anchor" | "tail";
  getRuntimeContext?: WorkspaceRuntimeContextGetter;
  boundaryCache?: MessengerReadBoundaryCacheDeps;
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
  expectedRevision: number;
  pageLimit?: number;
  getRuntimeContext?: WorkspaceRuntimeContextGetter;
  client?: MessengerMessagesClientDeps;
  boundaryCache?: MessengerReadBoundaryCacheDeps;
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

async function restoreReadBoundariesForRequest({
  ownerKey,
  boundaryCache,
  isRequestStale,
}: {
  ownerKey: string;
  boundaryCache: MessengerReadBoundaryCacheDeps | undefined;
  isRequestStale: () => boolean;
}): Promise<boolean> {
  try {
    const boundaries = await (
      boundaryCache?.readReadBoundaries ?? defaultReadMessengerCachedReadBoundaries
    )(ownerKey);
    if (isRequestStale()) return false;
    restoreMessengerReadBoundaries(boundaries);
  } catch {
    // Boundary cache is an accelerator; the server request remains usable without it.
  }
  return !isRequestStale();
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

const messageLoadingRequestOwners = new WeakMap<
  MessengerMessagesStoreApi,
  Map<MessengerConversationId, symbol>
>();

function messageLoadingRequestOwnerMap(
  store: MessengerMessagesStoreApi,
): Map<MessengerConversationId, symbol> {
  const existing = messageLoadingRequestOwners.get(store);
  if (existing != null) return existing;

  const created = new Map<MessengerConversationId, symbol>();
  messageLoadingRequestOwners.set(store, created);
  return created;
}

function claimMessageLoadingRequest(
  store: MessengerMessagesStoreApi,
  conversationId: MessengerConversationId,
  requestToken: symbol,
): void {
  messageLoadingRequestOwnerMap(store).set(conversationId, requestToken);
}

function ownsMessageLoadingRequest(
  store: MessengerMessagesStoreApi,
  conversationId: MessengerConversationId,
  requestToken: symbol,
): boolean {
  return messageLoadingRequestOwners.get(store)?.get(conversationId) === requestToken;
}

function releaseMessageLoadingRequest(
  store: MessengerMessagesStoreApi,
  conversationId: MessengerConversationId,
  requestToken: symbol,
): void {
  const owners = messageLoadingRequestOwners.get(store);
  if (owners?.get(conversationId) !== requestToken) return;
  owners.delete(conversationId);
  if (owners.size === 0) {
    messageLoadingRequestOwners.delete(store);
  }
}

function finishMessageLoadingRequest(
  store: MessengerMessagesStoreApi,
  conversationId: MessengerConversationId,
  requestToken: symbol,
  error: string | null | undefined,
): boolean {
  const owners = messageLoadingRequestOwners.get(store);
  if (owners?.get(conversationId) !== requestToken) return false;

  owners.delete(conversationId);
  if (owners.size === 0) {
    messageLoadingRequestOwners.delete(store);
  }
  const messageStore = store.getState();
  messageStore.setMessagesLoading(conversationId, false);
  if (error !== undefined) {
    messageStore.setMessagesError(conversationId, error);
  }
  return true;
}

function isMessageLoadingRequestStale({
  conversationId,
  isInvalidated,
  requestToken,
  store,
}: {
  conversationId: MessengerConversationId;
  isInvalidated: () => boolean;
  requestToken: symbol;
  store: MessengerMessagesStoreApi;
}): boolean {
  if (isInvalidated()) {
    finishMessageLoadingRequest(store, conversationId, requestToken, undefined);
    return true;
  }
  return !ownsMessageLoadingRequest(store, conversationId, requestToken);
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
  isRequestCurrent,
}: {
  runtimeContext: WorkspaceRuntimeContext;
  getRuntimeContext: WorkspaceRuntimeContextGetter;
  signal: AbortSignal | undefined;
  ownReactionSync: MessengerMessagesOwnReactionSyncDeps | undefined;
  messages: readonly MessengerMessage[];
  isRequestCurrent?: () => boolean;
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
      isRequestCurrent,
    });
  } catch {
    // IDB hydration failures must not break message history; server sync can
    // still restore current own-reaction rows.
  }
  if (isRequestCurrent?.() === false) return [];
  return messageUuids;
}

function scheduleVisibleOwnReactionSync({
  runtimeContext,
  getRuntimeContext,
  clientOptions,
  signal,
  ownReactionSync,
  messageUuids,
  isRequestCurrent,
}: {
  runtimeContext: WorkspaceRuntimeContext;
  getRuntimeContext: WorkspaceRuntimeContextGetter;
  clientOptions: MessengerRequestOptionsOverrides | undefined;
  signal: AbortSignal | undefined;
  ownReactionSync: MessengerMessagesOwnReactionSyncDeps | undefined;
  messageUuids: readonly MessengerUuid[];
  isRequestCurrent?: () => boolean;
}): Promise<void> {
  // Server sync is intentionally backgrounded: cache hydration should restore
  // highlighting quickly after reload, and server checks must not block opening.
  const syncOwner = ownReactionSync?.syncOwner ?? defaultSyncMessengerOwnerOwnMessageReactions;
  return syncOwner({
    runtimeContext,
    getRuntimeContext,
    clientOptions,
    signal,
    messageUuids,
    isRequestCurrent,
  })
    .then(() => undefined)
    .catch(() => {
      log.warn("Failed to synchronize visible own reactions");
    });
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

  void scheduleVisibleOwnReactionSync({
    runtimeContext,
    getRuntimeContext,
    clientOptions,
    signal,
    ownReactionSync,
    messageUuids,
  });
}

async function restoreCachedConversationMessages({
  ownerKey,
  conversationId,
  runtimeContext,
  getRuntimeContext,
  signal,
  cache,
  ownReactionSync,
  clientOptions,
  store,
  isRequestStale,
  onCacheReadError,
}: {
  ownerKey: string;
  conversationId: MessengerConversationId;
  runtimeContext: WorkspaceRuntimeContext;
  getRuntimeContext: WorkspaceRuntimeContextGetter;
  signal: AbortSignal | undefined;
  cache: MessengerMessagesCacheDeps;
  ownReactionSync: MessengerMessagesOwnReactionSyncDeps | undefined;
  clientOptions: MessengerRequestOptionsOverrides | undefined;
  store: MessengerMessagesStoreApi;
  isRequestStale: () => boolean;
  onCacheReadError: () => void;
}): Promise<MessengerConversationCacheWindow | null> {
  const initialStoreState = store.getState();
  const expectedRevision =
    initialStoreState.conversationWindowsById[conversationId]?.revision ?? null;
  const capturedMutationRevision = initialStoreState.messageMutationRevision;
  let cachedWindow: MessengerConversationCacheWindow;
  try {
    cachedWindow = await (
      cache.readConversationMessageWindow ?? defaultReadMessengerConversationWindowCache
    )(ownerKey, conversationId);
  } catch (error) {
    if (isRequestStale()) return null;
    onCacheReadError();
    throw error;
  }
  if (isRequestStale()) return null;

  const effectiveMessages = applyMessengerReadBoundaries(cachedWindow.messages, ownerKey);
  const effectiveWindow = effectiveMessages.every(
    (message, index) => message === cachedWindow.messages[index],
  )
    ? cachedWindow
    : { ...cachedWindow, messages: effectiveMessages };

  const cachedStore = store.getState();
  cachedStore.replaceConversationWindow({
    conversationId,
    expectedRevision,
    capturedMutationRevision,
    mode: "tail",
    anchorMessageUuid: null,
    messages: effectiveMessages,
    markers: {
      beforePageMarker: cachedWindow.nextPageMarker,
      afterPageMarker: null,
    },
  });
  const cachedOwnReactionSyncUuids = await hydrateVisibleOwnReactionsFromCache({
    runtimeContext,
    getRuntimeContext,
    signal,
    ownReactionSync,
    messages: effectiveMessages,
  });
  if (isRequestStale()) return null;
  if (cachedOwnReactionSyncUuids.length > 0) {
    void scheduleVisibleOwnReactionSync({
      runtimeContext,
      getRuntimeContext,
      clientOptions,
      signal,
      ownReactionSync,
      messageUuids: cachedOwnReactionSyncUuids,
    });
  }
  return effectiveWindow;
}

function buildMessengerMessagesPageQuery({
  conversation,
  pageLimit,
  pageMarker,
  sortDir,
}: {
  conversation: NonNullable<ReturnType<typeof parseMessengerConversationId>>;
  pageLimit: number;
  pageMarker: string | number | undefined;
  sortDir: "asc" | "desc";
}): MessengerMessagesPageQuery {
  const baseQuery = {
    streamUuid: conversation.streamUuid,
    pageLimit,
    pageMarker,
    sortKey: "created_at" as const,
    sortDir,
  };
  return conversation.kind === "topic"
    ? { ...baseQuery, topicUuid: conversation.topicUuid }
    : baseQuery;
}

async function synchronizeLoadedConversationMessages({
  runtimeContext,
  getRuntimeContext,
  clientOptions,
  signal,
  ownReactionSync,
  messages,
  cachedMessages,
}: {
  runtimeContext: WorkspaceRuntimeContext;
  getRuntimeContext: WorkspaceRuntimeContextGetter;
  clientOptions: MessengerRequestOptionsOverrides | undefined;
  signal: AbortSignal | undefined;
  ownReactionSync: MessengerMessagesOwnReactionSyncDeps | undefined;
  messages: readonly MessengerMessage[];
  cachedMessages: readonly MessengerMessage[];
}): Promise<void> {
  const serverMessageUuids = messageUuidsForOwnReactionSync(messages);
  const cachedMessageUuids = messageUuidsForOwnReactionSync(cachedMessages);
  if (
    serverMessageUuids.length === 0 ||
    haveSameMessageUuids(serverMessageUuids, cachedMessageUuids)
  ) {
    return;
  }
  await syncVisibleOwnReactionsFromCacheThenServer({
    runtimeContext,
    getRuntimeContext,
    clientOptions,
    signal,
    ownReactionSync,
    messages,
  });
}

function writeLoadedConversationMessagesCache({
  ownerKey,
  conversationId,
  nextPageMarker,
  hasMore,
  appliedRevision,
  cache,
  store,
  isRequestStale,
}: {
  ownerKey: string;
  conversationId: MessengerConversationId;
  nextPageMarker: string | null;
  hasMore: boolean;
  appliedRevision: number;
  cache: MessengerMessagesCacheDeps;
  store: MessengerMessagesStoreApi;
  isRequestStale: () => boolean;
}): void {
  const cacheStoreState = store.getState();
  const cacheWindow = cacheStoreState.conversationWindowsById[conversationId];
  if (cacheWindow?.revision !== appliedRevision) return;

  const effectiveMessages = cacheWindow.messageUuids
    .map((messageUuid) => cacheStoreState.messagesById[messageUuid])
    .filter((message): message is MessengerMessage => message != null);
  const cacheMutationRevision = cacheStoreState.messageMutationRevision;
  writeMessagesCacheBestEffort(() =>
    (cache.writeConversationMessagePage ?? defaultWriteMessengerConversationWindowCache)(
      ownerKey,
      conversationId,
      {
        messages: effectiveMessages,
        nextPageMarker,
        hasMore,
      },
      () => {
        const currentState = store.getState();
        return (
          !isRequestStale() &&
          currentState.messageMutationRevision === cacheMutationRevision &&
          currentState.conversationWindowsById[conversationId]?.revision === appliedRevision
        );
      },
    ),
  );
}

async function loadConversationMessagesFromServer({
  runtimeContext,
  conversationId,
  pageLimit,
  pageMarker,
  parsedConversationId,
  ownerKey,
  requestToken,
  isRequestStale,
  getRuntimeContext,
  client,
  cache,
  ownReactionSync,
  clientOptions,
  signal,
  store,
  cachedWindow,
}: {
  runtimeContext: WorkspaceRuntimeContext;
  conversationId: MessengerConversationId;
  pageLimit: number;
  pageMarker: string | number | undefined;
  parsedConversationId: NonNullable<ReturnType<typeof parseMessengerConversationId>>;
  ownerKey: string;
  requestToken: symbol;
  isRequestStale: () => boolean;
  getRuntimeContext: WorkspaceRuntimeContextGetter;
  client: MessengerMessagesClientDeps;
  cache: MessengerMessagesCacheDeps;
  ownReactionSync: MessengerMessagesOwnReactionSyncDeps | undefined;
  clientOptions: MessengerRequestOptionsOverrides | undefined;
  signal: AbortSignal | undefined;
  store: MessengerMessagesStoreApi;
  cachedWindow: MessengerConversationCacheWindow;
}): Promise<MessengerConversationMessagesResult> {
  const requestOptions = buildMessengerRequestOptions(runtimeContext, clientOptions, signal);
  const query = buildMessengerMessagesPageQuery({
    conversation: parsedConversationId,
    pageLimit,
    pageMarker,
    sortDir: "desc",
  });
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const requestStoreState = store.getState();
      const expectedWindowRevision =
        requestStoreState.conversationWindowsById[conversationId]?.revision ?? null;
      const capturedMutationRevision = requestStoreState.messageMutationRevision;
      const page = await (client.getMessagesPage ?? defaultGetMessagesPage)(requestOptions, query);

      if (isRequestStale()) {
        return { status: "skipped", ownerKey, reason: "stale-owner" };
      }

      const nextPageMarker = page.nextPageMarker;
      const hasMore = nextPageMarker != null;
      const messages = applyMessengerReadBoundaries(
        page.items.map(adaptMessengerMessage),
        ownerKey,
      );
      const appliedRevision =
        pageMarker == null
          ? store.getState().replaceConversationWindow({
              conversationId,
              expectedRevision: expectedWindowRevision,
              capturedMutationRevision,
              mode: "tail",
              anchorMessageUuid: null,
              messages,
              markers: { beforePageMarker: nextPageMarker, afterPageMarker: null },
            })
          : store.getState().mergeConversationWindowPage({
              conversationId,
              expectedRevision: expectedWindowRevision ?? 0,
              expectedPageMarker: String(pageMarker),
              capturedMutationRevision,
              direction: "before",
              messages,
              pageMarker: nextPageMarker,
            });
      if (appliedRevision == null) {
        if (pageMarker == null && attempt === 0) continue;
        finishMessageLoadingRequest(store, conversationId, requestToken, undefined);
        return { status: "skipped", ownerKey, reason: "stale-window" };
      }

      await synchronizeLoadedConversationMessages({
        runtimeContext,
        getRuntimeContext,
        clientOptions,
        signal,
        ownReactionSync,
        messages,
        cachedMessages: cachedWindow.messages,
      });
      if (isRequestStale()) {
        return { status: "skipped", ownerKey, reason: "stale-owner" };
      }

      writeLoadedConversationMessagesCache({
        ownerKey,
        conversationId,
        nextPageMarker,
        hasMore,
        appliedRevision,
        cache,
        store,
        isRequestStale,
      });
      finishMessageLoadingRequest(store, conversationId, requestToken, null);
      return {
        status: "applied",
        ownerKey,
        conversationId,
        nextPageMarker,
        hasMore,
        pageLimit: page.pageLimit,
      };
    }
    finishMessageLoadingRequest(store, conversationId, requestToken, undefined);
    return { status: "skipped", ownerKey, reason: "stale-window" };
  } catch (error) {
    if (isRequestStale()) {
      return { status: "skipped", ownerKey, reason: "stale-owner" };
    }

    const message = normalizeMessagesError(error);
    finishMessageLoadingRequest(store, conversationId, requestToken, message);
    return {
      status: "failed",
      ownerKey,
      conversationId,
      error: message,
    };
  }
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

  const requestToken = Symbol("conversation-messages-request");
  claimMessageLoadingRequest(store, conversationId, requestToken);
  store.getState().setMessagesLoading(conversationId, true);
  store.getState().setMessagesError(conversationId, null);
  const isRequestStale = (): boolean =>
    isMessageLoadingRequestStale({
      conversationId,
      isInvalidated: () =>
        isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal),
      requestToken,
      store,
    });

  if (
    !(await restoreReadBoundariesForRequest({
      ownerKey,
      boundaryCache: cache,
      isRequestStale,
    }))
  ) {
    return { status: "skipped", ownerKey, reason: "stale-owner" };
  }

  const cachedWindow =
    pageMarker == null
      ? await restoreCachedConversationMessages({
          ownerKey,
          conversationId,
          runtimeContext,
          getRuntimeContext,
          signal,
          cache,
          ownReactionSync,
          clientOptions,
          store,
          isRequestStale,
          onCacheReadError: () =>
            finishMessageLoadingRequest(store, conversationId, requestToken, undefined),
        })
      : { messages: [], nextPageMarker: null, hasMore: false };
  if (cachedWindow == null || isRequestStale()) {
    return { status: "skipped", ownerKey, reason: "stale-owner" };
  }

  return loadConversationMessagesFromServer({
    runtimeContext,
    conversationId,
    pageLimit,
    pageMarker,
    parsedConversationId,
    ownerKey,
    requestToken,
    isRequestStale,
    getRuntimeContext,
    client,
    cache,
    ownReactionSync,
    clientOptions,
    signal,
    store,
    cachedWindow,
  });
}

export async function resolveMessengerMessageAnchor({
  runtimeContext,
  messageUuid,
  getRuntimeContext = () => runtimeContext,
  client = {},
  clientOptions,
  signal,
  store = useWorkspaceMessageStore,
}: ResolveMessengerMessageAnchorOptions): Promise<MessengerMessageAnchorResolveResult> {
  const requestContext = captureWorkspaceRuntimeRequestContext(() => runtimeContext);
  if (requestContext == null) {
    return { status: "skipped", ownerKey: null, reason: "missing-context" };
  }

  const ownerKey = workspaceRuntimeOwnerKey(requestContext);
  if (isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal)) {
    return { status: "skipped", ownerKey, reason: "stale-owner" };
  }

  const capturedMutationRevision = store.getState().messageMutationRevision;
  const requestOptions = buildMessengerRequestOptions(runtimeContext, clientOptions, signal);
  try {
    const anchorDto = await (client.getMessage ?? defaultGetMessage)(requestOptions, messageUuid);
    if (isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal)) {
      return { status: "skipped", ownerKey, reason: "stale-owner" };
    }
    if (anchorDto.project_id !== runtimeContext.projectId || anchorDto.uuid !== messageUuid) {
      return {
        status: "failed",
        ownerKey,
        conversationId: null,
        error: "Message anchor does not belong to the current project",
      };
    }
    const conversationId = conversationIdFromMessageAnchor(anchorDto);
    if (conversationId == null) {
      return {
        status: "failed",
        ownerKey,
        conversationId: null,
        error: "Expected message anchor with valid stream uuid",
      };
    }
    const message = adaptMessengerMessage(anchorDto);
    const messageStore = store.getState();
    const snapshotApplied = messageStore.upsertMessageBodyFromSnapshot(
      message,
      capturedMutationRevision,
    );
    const effectiveMessage = snapshotApplied
      ? message
      : (store.getState().messagesById[messageUuid] ?? null);
    if (effectiveMessage == null) {
      return { status: "skipped", ownerKey, reason: "stale-window" };
    }
    return {
      status: "resolved",
      ownerKey,
      conversationId: effectiveMessage.conversationId,
      message: effectiveMessage,
    };
  } catch (error) {
    if (isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal)) {
      return { status: "skipped", ownerKey, reason: "stale-owner" };
    }
    return {
      status: "failed",
      ownerKey,
      conversationId: null,
      error: normalizeMessagesError(error),
    };
  }
}

export async function fetchMessengerMessageWindow({
  runtimeContext,
  anchor,
  targetConversationId,
  beforeLimit,
  afterLimit,
  getRuntimeContext = () => runtimeContext,
  client = {},
  clientOptions,
  signal,
  store = useWorkspaceMessageStore,
}: FetchMessengerMessageWindowOptions): Promise<MessengerMessageWindowFetchResult> {
  const requestContext = captureWorkspaceRuntimeRequestContext(() => runtimeContext);
  if (requestContext == null) {
    return { status: "skipped", ownerKey: null, reason: "missing-context" };
  }

  const ownerKey = workspaceRuntimeOwnerKey(requestContext);
  const isStale = (): boolean =>
    ownerKey !== anchor.ownerKey ||
    isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal);
  if (isStale()) {
    return { status: "skipped", ownerKey, reason: "stale-owner" };
  }

  const parsedConversationId = parseMessengerConversationId(targetConversationId);
  const targetStreamMismatch = parsedConversationId?.streamUuid !== anchor.message.streamUuid;
  const targetTopicMismatch =
    parsedConversationId?.kind === "topic" &&
    anchor.message.topicUuid !== parsedConversationId.topicUuid;
  if (targetStreamMismatch || targetTopicMismatch || parsedConversationId == null) {
    return {
      status: "failed",
      ownerKey,
      conversationId: targetConversationId,
      error: "Message anchor does not belong to the target conversation",
    };
  }

  const requestOptions = buildMessengerRequestOptions(runtimeContext, clientOptions, signal);
  const query = {
    messageUuid: anchor.message.uuid,
    streamUuid: parsedConversationId.streamUuid,
    topicUuid: parsedConversationId.kind === "topic" ? parsedConversationId.topicUuid : undefined,
    beforeLimit,
    afterLimit,
  };
  const requestStoreState = store.getState();
  const expectedWindowRevision =
    requestStoreState.conversationWindowsById[targetConversationId]?.revision ?? null;
  const capturedMutationRevision = requestStoreState.messageMutationRevision;

  try {
    const pages = await (
      client.getMessagePagesAroundResolvedMessage ?? defaultGetMessagePagesAroundResolvedMessage
    )(requestOptions, query);
    if (isStale()) {
      return { status: "skipped", ownerKey, reason: "stale-owner" };
    }

    const messagesByUuid = new Map<MessengerUuid, MessengerMessage>();
    for (const dto of pages.before) {
      const message = adaptMessengerMessage(dto);
      messagesByUuid.set(message.uuid, message);
    }
    messagesByUuid.set(anchor.message.uuid, anchor.message);
    for (const dto of pages.after) {
      const message = adaptMessengerMessage(dto);
      messagesByUuid.set(message.uuid, message);
    }

    return {
      status: "fetched",
      window: {
        ownerKey,
        conversationId: targetConversationId,
        anchorUuid: anchor.message.uuid,
        messages: [...messagesByUuid.values()],
        beforePageMarker: pages.beforePageMarker,
        afterPageMarker: pages.afterPageMarker,
        expectedWindowRevision,
        capturedMutationRevision,
      },
    };
  } catch (error) {
    if (isStale()) {
      return { status: "skipped", ownerKey, reason: "stale-owner" };
    }
    return {
      status: "failed",
      ownerKey,
      conversationId: targetConversationId,
      error: normalizeMessagesError(error),
    };
  }
}

const claimedMessageWindows = new WeakSet<MessengerFetchedMessageWindow>();

export async function applyMessengerMessageWindow({
  runtimeContext,
  window,
  isRequestCurrent,
  mode = "around-anchor",
  getRuntimeContext = () => runtimeContext,
  boundaryCache,
  ownReactionSync,
  clientOptions,
  signal,
  store = useWorkspaceMessageStore,
}: ApplyMessengerMessageWindowOptions): Promise<MessengerMessageWindowApplyResult> {
  const requestContext = captureWorkspaceRuntimeRequestContext(() => runtimeContext);
  if (requestContext == null) {
    return { status: "skipped", ownerKey: null, reason: "missing-context" };
  }

  const ownerKey = workspaceRuntimeOwnerKey(requestContext);
  const requestToken = Symbol("message-window-apply-request");
  const isStale = (): boolean =>
    !isRequestCurrent() ||
    ownerKey !== window.ownerKey ||
    isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal);
  if (isStale()) {
    return { status: "skipped", ownerKey, reason: "stale-owner" };
  }
  if (claimedMessageWindows.has(window)) {
    return { status: "skipped", ownerKey, reason: "stale-owner" };
  }
  claimedMessageWindows.add(window);

  if (
    !(await restoreReadBoundariesForRequest({
      ownerKey,
      boundaryCache,
      isRequestStale: isStale,
    })) ||
    isStale()
  ) {
    return { status: "skipped", ownerKey, reason: "stale-owner" };
  }

  const messages = applyMessengerReadBoundaries(window.messages, ownerKey);
  claimMessageLoadingRequest(store, window.conversationId, requestToken);
  if (isStale() || !ownsMessageLoadingRequest(store, window.conversationId, requestToken)) {
    releaseMessageLoadingRequest(store, window.conversationId, requestToken);
    return { status: "skipped", ownerKey, reason: "stale-owner" };
  }

  try {
    const appliedRevision = store.getState().replaceConversationWindow({
      conversationId: window.conversationId,
      expectedRevision: window.expectedWindowRevision,
      capturedMutationRevision: window.capturedMutationRevision,
      mode,
      anchorMessageUuid: mode === "around-anchor" ? window.anchorUuid : null,
      messages,
      markers: {
        beforePageMarker: window.beforePageMarker,
        afterPageMarker: window.afterPageMarker,
      },
    });
    if (appliedRevision == null) {
      releaseMessageLoadingRequest(store, window.conversationId, requestToken);
      return { status: "skipped", ownerKey, reason: "stale-window" };
    }
    const isReactionRequestCurrent = (): boolean =>
      !isStale() && ownsMessageLoadingRequest(store, window.conversationId, requestToken);
    void hydrateVisibleOwnReactionsFromCache({
      runtimeContext,
      getRuntimeContext,
      signal,
      ownReactionSync,
      messages,
      isRequestCurrent: isReactionRequestCurrent,
    })
      .then((messageUuids) => {
        if (messageUuids.length === 0 || !isReactionRequestCurrent()) return;
        return scheduleVisibleOwnReactionSync({
          runtimeContext,
          getRuntimeContext,
          clientOptions,
          signal,
          ownReactionSync,
          messageUuids,
          isRequestCurrent: isReactionRequestCurrent,
        });
      })
      .finally(() => {
        releaseMessageLoadingRequest(store, window.conversationId, requestToken);
      })
      .catch(() => {
        log.warn("Failed to complete visible own reaction synchronization");
      });
    return {
      status: "applied",
      ownerKey,
      conversationId: window.conversationId,
      anchorUuid: window.anchorUuid,
    };
  } catch (error) {
    releaseMessageLoadingRequest(store, window.conversationId, requestToken);
    if (isStale()) {
      return { status: "skipped", ownerKey, reason: "stale-owner" };
    }
    return {
      status: "failed",
      ownerKey,
      conversationId: window.conversationId,
      error: normalizeMessagesError(error),
    };
  }
}

async function applyLoadedMessengerMessageWindowPage({
  runtimeContext,
  conversationId,
  direction,
  pageMarker,
  expectedRevision,
  page,
  boundariesReady,
  isRequestInvalidated,
  ownerKey,
  requestToken,
  capturedMutationRevision,
  getRuntimeContext,
  ownReactionSync,
  clientOptions,
  signal,
  store,
}: {
  runtimeContext: WorkspaceRuntimeContext;
  conversationId: MessengerConversationId;
  direction: MessengerMessageWindowPageDirection;
  pageMarker: string;
  expectedRevision: number;
  page: MessengerCollectionPage<WorkspaceMessengerMessageDto>;
  boundariesReady: Promise<boolean>;
  isRequestInvalidated: () => boolean;
  ownerKey: string;
  requestToken: symbol;
  capturedMutationRevision: number;
  getRuntimeContext: WorkspaceRuntimeContextGetter;
  ownReactionSync: MessengerMessagesOwnReactionSyncDeps | undefined;
  clientOptions: MessengerRequestOptionsOverrides | undefined;
  signal: AbortSignal | undefined;
  store: MessengerMessagesStoreApi;
}): Promise<MessengerMessageWindowPageResult> {
  if (!(await boundariesReady) || isRequestInvalidated()) {
    finishMessageLoadingRequest(store, conversationId, requestToken, undefined);
    return { status: "skipped", ownerKey, reason: "stale-owner" };
  }
  if (!ownsMessageLoadingRequest(store, conversationId, requestToken)) {
    return { status: "skipped", ownerKey, reason: "stale-owner" };
  }

  const pageItems = direction === "before" ? [...page.items].reverse() : page.items;
  const messages = applyMessengerReadBoundaries(pageItems.map(adaptMessengerMessage), ownerKey);
  const nextPageMarker = page.nextPageMarker;
  const appliedRevision = store.getState().mergeConversationWindowPage({
    conversationId,
    expectedRevision,
    expectedPageMarker: pageMarker,
    capturedMutationRevision,
    direction,
    messages,
    pageMarker: nextPageMarker,
  });
  if (appliedRevision == null) {
    finishMessageLoadingRequest(store, conversationId, requestToken, undefined);
    return { status: "skipped", ownerKey, reason: "stale-window" };
  }

  await syncVisibleOwnReactionsFromCacheThenServer({
    runtimeContext,
    getRuntimeContext,
    clientOptions,
    signal,
    ownReactionSync,
    messages,
  });
  if (!ownsMessageLoadingRequest(store, conversationId, requestToken)) {
    return { status: "skipped", ownerKey, reason: "stale-owner" };
  }
  finishMessageLoadingRequest(store, conversationId, requestToken, null);
  return {
    status: "applied",
    ownerKey,
    conversationId,
    direction,
    nextPageMarker,
    pageLimit: page.pageLimit,
  };
}

export async function loadMessengerMessageWindowPage({
  runtimeContext,
  conversationId,
  direction,
  pageMarker,
  expectedRevision,
  pageLimit = DEFAULT_MESSAGES_PAGE_LIMIT,
  getRuntimeContext = () => runtimeContext,
  client = {},
  boundaryCache,
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

  const boundariesReady = restoreReadBoundariesForRequest({
    ownerKey,
    boundaryCache,
    isRequestStale: () =>
      isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal),
  });

  const requestToken = Symbol("message-window-page-request");
  claimMessageLoadingRequest(store, conversationId, requestToken);
  store.getState().setMessagesLoading(conversationId, true);
  store.getState().setMessagesError(conversationId, null);
  const capturedMutationRevision = store.getState().messageMutationRevision;

  const requestOptions = buildMessengerRequestOptions(runtimeContext, clientOptions, signal);
  const query = buildMessengerMessagesPageQuery({
    conversation: parsedConversationId,
    pageLimit,
    pageMarker,
    sortDir: direction === "before" ? "desc" : "asc",
  });

  try {
    const page = await (client.getMessagesPage ?? defaultGetMessagesPage)(requestOptions, query);
    return await applyLoadedMessengerMessageWindowPage({
      runtimeContext,
      conversationId,
      direction,
      pageMarker,
      expectedRevision,
      page,
      boundariesReady,
      isRequestInvalidated: () =>
        isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal),
      ownerKey,
      requestToken,
      capturedMutationRevision,
      getRuntimeContext,
      ownReactionSync,
      clientOptions,
      signal,
      store,
    });
  } catch (error) {
    if (isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal)) {
      finishMessageLoadingRequest(store, conversationId, requestToken, undefined);
      return { status: "skipped", ownerKey, reason: "stale-owner" };
    }
    if (!ownsMessageLoadingRequest(store, conversationId, requestToken)) {
      return { status: "skipped", ownerKey, reason: "stale-owner" };
    }

    const message = normalizeMessagesError(error);
    finishMessageLoadingRequest(store, conversationId, requestToken, message);
    return {
      status: "failed",
      ownerKey,
      conversationId,
      direction,
      error: message,
    };
  }
}
