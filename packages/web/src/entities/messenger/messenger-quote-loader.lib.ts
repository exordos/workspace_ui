import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import {
  captureWorkspaceRuntimeRequestContext,
  isWorkspaceRuntimeRequestInvalidated,
  workspaceRuntimeOwnerKey,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContextGetter } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import {
  getMessagesByUuids as defaultGetMessagesByUuids,
  type MessengerClientOptions,
} from "~/shared/api/messenger-client";
import type { WorkspaceMessengerMessageDto } from "~/shared/api/messenger.types";
import { adaptMessengerMessage } from "./messenger-adapters.lib";
import {
  deleteMessengerCachedMessage as defaultDeleteMessengerCachedMessage,
  readMessengerMessageBodyCache as defaultReadMessengerMessageBodyCache,
  writeMessengerMessageBodyCache as defaultWriteMessengerMessageBodyCache,
} from "./messenger-cache.lib";
import { applyMessengerReadBoundary } from "./messenger-read-boundary.lib";
import { buildMessengerRequestOptions } from "./messenger-request-options.lib";
import type { MessengerConversationId, MessengerMessage, MessengerUuid } from "./messenger.types";

export type MessengerQuoteMessageLoadResult =
  | { status: "resolved"; message: MessengerMessage; source: "cache" | "server" }
  | { status: "unavailable" }
  | { status: "stale" };

export interface LoadMessengerQuoteMessageOptions {
  runtimeContext: WorkspaceRuntimeContext;
  getRuntimeContext: WorkspaceRuntimeContextGetter;
  messageUuid: MessengerUuid;
  signal?: AbortSignal;
  client?: {
    getMessagesByUuids?: (
      options: MessengerClientOptions,
      messageUuids: readonly string[],
    ) => Promise<WorkspaceMessengerMessageDto[]>;
  };
  cache?: {
    readMessageBodies?: (
      ownerKey: string,
      messageUuids: readonly MessengerUuid[],
    ) => Promise<MessengerMessage[]>;
    writeMessageBodies?: (ownerKey: string, messages: readonly MessengerMessage[]) => Promise<void>;
    deleteMessage?: (
      ownerKey: string,
      messageUuid: MessengerUuid,
      conversationIds: readonly MessengerConversationId[],
    ) => Promise<void>;
  };
  store?: {
    getState: () => Pick<
      ReturnType<typeof useWorkspaceMessageStore.getState>,
      | "messagesById"
      | "messageMutationRevision"
      | "removeMessageFromSnapshot"
      | "upsertMessageBodyFromSnapshot"
    >;
  };
}

const inFlightQuoteMessageLoads = new Map<string, Promise<MessengerQuoteMessageLoadResult>>();
type QuoteMessageStore = NonNullable<LoadMessengerQuoteMessageOptions["store"]>;
type QuoteRequestContext = ReturnType<typeof captureWorkspaceRuntimeRequestContext>;

function isRequestStale(
  requestContext: QuoteRequestContext,
  getRuntimeContext: WorkspaceRuntimeContextGetter,
  signal: AbortSignal | undefined,
): boolean {
  return isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal);
}

async function restoreQuoteFallbackFromCache({
  ownerKey,
  messageUuid,
  readMessageBodies,
  store,
  requestContext,
  getRuntimeContext,
  signal,
  capturedMutationRevision,
}: {
  ownerKey: string;
  messageUuid: MessengerUuid;
  readMessageBodies: (
    ownerKey: string,
    messageUuids: readonly MessengerUuid[],
  ) => Promise<MessengerMessage[]>;
  store: QuoteMessageStore;
  requestContext: QuoteRequestContext;
  getRuntimeContext: WorkspaceRuntimeContextGetter;
  signal?: AbortSignal;
  capturedMutationRevision: number;
}): Promise<{ status: "ready"; message: MessengerMessage | null } | { status: "stale" }> {
  let cachedMessages: MessengerMessage[] = [];
  try {
    cachedMessages = await readMessageBodies(ownerKey, [messageUuid]);
  } catch {
    // Cache availability must not block the server fallback.
  }
  if (isRequestStale(requestContext, getRuntimeContext, signal)) {
    return { status: "stale" };
  }

  const activeMessage = store.getState().messagesById[messageUuid] ?? null;
  const restoredMessage =
    activeMessage ?? cachedMessages.find((candidate) => candidate.uuid === messageUuid) ?? null;
  const message =
    activeMessage == null && restoredMessage != null
      ? applyMessengerReadBoundary(restoredMessage, ownerKey)
      : restoredMessage;
  if (activeMessage == null && message != null) {
    store.getState().upsertMessageBodyFromSnapshot(message, capturedMutationRevision);
  }
  return {
    status: "ready",
    message: store.getState().messagesById[messageUuid] ?? null,
  };
}

async function removeUnavailableQuoteMessage({
  ownerKey,
  messageUuid,
  deleteMessage,
  store,
  requestContext,
  getRuntimeContext,
  signal,
  capturedMutationRevision,
}: {
  ownerKey: string;
  messageUuid: MessengerUuid;
  deleteMessage: (
    ownerKey: string,
    messageUuid: MessengerUuid,
    conversationIds: readonly MessengerConversationId[],
  ) => Promise<void>;
  store: QuoteMessageStore;
  requestContext: QuoteRequestContext;
  getRuntimeContext: WorkspaceRuntimeContextGetter;
  signal?: AbortSignal;
  capturedMutationRevision: number;
}): Promise<MessengerQuoteMessageLoadResult> {
  if (!store.getState().removeMessageFromSnapshot(messageUuid, capturedMutationRevision)) {
    return { status: "stale" };
  }
  if (isRequestStale(requestContext, getRuntimeContext, signal)) {
    return { status: "stale" };
  }
  try {
    // An empty conversation list means "all buckets for this UUID" in the
    // durable cache API. Topic messages are also indexed into their stream.
    await deleteMessage(ownerKey, messageUuid, []);
  } catch {
    // A successful authoritative miss still wins when cache cleanup fails.
  }
  return isRequestStale(requestContext, getRuntimeContext, signal)
    ? { status: "stale" }
    : { status: "unavailable" };
}

async function loadMessengerQuoteMessageUncached({
  runtimeContext,
  getRuntimeContext,
  messageUuid,
  signal,
  client,
  cache,
  store = useWorkspaceMessageStore,
}: LoadMessengerQuoteMessageOptions): Promise<MessengerQuoteMessageLoadResult> {
  const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
  const requestContext = captureWorkspaceRuntimeRequestContext(() => runtimeContext);
  const readMessageBodies = cache?.readMessageBodies ?? defaultReadMessengerMessageBodyCache;
  const writeMessageBodies = cache?.writeMessageBodies ?? defaultWriteMessengerMessageBodyCache;
  const deleteMessage = cache?.deleteMessage ?? defaultDeleteMessengerCachedMessage;
  const getMessagesByUuids = client?.getMessagesByUuids ?? defaultGetMessagesByUuids;
  const capturedMutationRevision = store.getState().messageMutationRevision;
  const fallbackMessage = store.getState().messagesById[messageUuid] ?? null;

  if (fallbackMessage == null) {
    const restored = await restoreQuoteFallbackFromCache({
      ownerKey,
      messageUuid,
      readMessageBodies,
      store,
      requestContext,
      getRuntimeContext,
      signal,
      capturedMutationRevision,
    });
    if (restored.status === "stale") {
      return restored;
    }
  }

  if (isRequestStale(requestContext, getRuntimeContext, signal)) {
    return { status: "stale" };
  }

  try {
    const requestOptions = buildMessengerRequestOptions(runtimeContext, undefined, signal);
    const dtos = await getMessagesByUuids(requestOptions, [messageUuid]);
    if (isRequestStale(requestContext, getRuntimeContext, signal)) {
      return { status: "stale" };
    }
    const dto = dtos.find((item) => item.uuid === messageUuid);
    if (dto == null) {
      return removeUnavailableQuoteMessage({
        ownerKey,
        messageUuid,
        deleteMessage,
        store,
        requestContext,
        getRuntimeContext,
        signal,
        capturedMutationRevision,
      });
    }

    const message = applyMessengerReadBoundary(adaptMessengerMessage(dto), ownerKey);
    if (!store.getState().upsertMessageBodyFromSnapshot(message, capturedMutationRevision)) {
      const currentMessage = store.getState().messagesById[messageUuid] ?? null;
      return currentMessage == null
        ? { status: "stale" }
        : { status: "resolved", message: currentMessage, source: "server" };
    }
    const effectiveMessage = store.getState().messagesById[messageUuid] ?? message;
    if (isRequestStale(requestContext, getRuntimeContext, signal)) {
      return { status: "stale" };
    }
    try {
      await writeMessageBodies(ownerKey, [effectiveMessage]);
    } catch {
      // Durable cache writes are best effort after the active store is current.
    }
    if (isRequestStale(requestContext, getRuntimeContext, signal)) {
      return { status: "stale" };
    }
    return { status: "resolved", message: effectiveMessage, source: "server" };
  } catch {
    if (isRequestStale(requestContext, getRuntimeContext, signal)) {
      return { status: "stale" };
    }
    const currentMessage = store.getState().messagesById[messageUuid] ?? null;
    return currentMessage == null
      ? { status: "unavailable" }
      : { status: "resolved", message: currentMessage, source: "cache" };
  }
}

export function loadMessengerQuoteMessage(
  options: LoadMessengerQuoteMessageOptions,
): Promise<MessengerQuoteMessageLoadResult> {
  const key = `${workspaceRuntimeOwnerKey(options.runtimeContext)}:${options.runtimeContext.runtimeGeneration}:${options.messageUuid}`;
  let shared = inFlightQuoteMessageLoads.get(key);
  if (shared == null) {
    // Consumer abort signals must not cancel a request shared by another quote
    // or by the edit flow. Owner/generation checks still guard every write.
    const sharedOptions = { ...options, signal: undefined };
    shared = loadMessengerQuoteMessageUncached(sharedOptions).finally(() => {
      if (inFlightQuoteMessageLoads.get(key) === shared) {
        inFlightQuoteMessageLoads.delete(key);
      }
    });
    inFlightQuoteMessageLoads.set(key, shared);
  }

  const signal = options.signal;
  if (signal == null) {
    return shared;
  }
  if (signal.aborted) {
    return Promise.resolve({ status: "stale" });
  }

  return new Promise((resolve) => {
    const handleAbort = (): void => {
      resolve({ status: "stale" });
    };
    signal.addEventListener("abort", handleAbort, { once: true });
    void shared.then((result) => {
      signal.removeEventListener("abort", handleAbort);
      resolve(signal.aborted ? { status: "stale" } : result);
    });
  });
}
