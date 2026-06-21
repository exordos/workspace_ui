/**
 * Route-driven initial message load pipeline (dm / stream-topic / stream-wide).
 *
 * Orchestrates cache-first hydrate, network refresh, and IDB persist without UI business logic.
 */
import type { MockMessage } from "~/shared/api/messenger.types";
import {
  getChatMessagesAscending,
  getChatMeta,
  getStreamMessagesAscending,
  updateChatMetaPatch,
  upsertChatMessages,
} from "~/shared/lib/message-cache-db";
import { chatKeyFromContext } from "~/shared/lib/message-cache-keys.lib";
import type { MessageId } from "~/shared/lib/message-id.lib";
import {
  MESSENGER_DM_ANCHOR_NUM_AFTER,
  MESSENGER_DM_ANCHOR_NUM_BEFORE,
  MESSENGER_STREAM_ANCHOR_NUM_AFTER,
  MESSENGER_STREAM_ANCHOR_NUM_BEFORE,
  messengerMessageCacheWindowN,
} from "~/shared/lib/messenger-message-window.lib";
import type { UserId } from "~/shared/lib/user-id.lib";
import { upsertMessagesByChatPartitions } from "./message-cache-partition.lib";
import { fetchChatMessagesPage } from "./message-fetch.lib";
import { deriveFocusedPaginationFlags } from "./message-pagination-helpers.lib";
import type { CurrentChatContext } from "./message.model.types";

export type InitialLoadMode = "dm" | "stream-topic" | "stream-wide";

interface CachedSnapshot {
  messages: MockMessage[];
  hasOlderMessages: boolean;
  hasNewerMessages: boolean;
}

export interface LoadInitialMessagesRouteDrivenOptions {
  context: CurrentChatContext;
  focusedMessageId: MessageId | null;
  currentUserId: UserId | null;
  persistToIndexedDb: boolean;
  instanceId: string | null;
  /** Propagate abort through the pipeline so stale route requests stop before applying results. */
  signal?: AbortSignal;
  /** Notifies caller that cache-first payload is ready so UI can drop the blocking loader. */
  onCacheHydrated?: (snapshot: CachedSnapshot) => void;
}

export interface LoadInitialMessagesRouteDrivenResult {
  mode: InitialLoadMode;
  messages: MockMessage[];
  nextContext: CurrentChatContext;
  hasOlderMessages: boolean;
  hasNewerMessages: boolean;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
}

export function resolveInitialLoadMode(context: CurrentChatContext): InitialLoadMode {
  if (context.type === "dm") return "dm";
  return context.streamWideView ? "stream-wide" : "stream-topic";
}

async function readCachedMessagesByMode(options: {
  mode: InitialLoadMode;
  context: CurrentChatContext;
  instanceId: string;
}): Promise<CachedSnapshot> {
  const { mode, context, instanceId } = options;
  if (mode === "stream-wide" && context.type === "stream") {
    const cached = await getStreamMessagesAscending(instanceId, context.streamId).catch(
      () => [] as MockMessage[],
    );
    // Match API bootstrap window size so wide cache and network slices stay aligned.
    const sliced = cached.slice(-MESSENGER_STREAM_ANCHOR_NUM_BEFORE);
    return {
      messages: sliced,
      hasOlderMessages: sliced.length >= MESSENGER_STREAM_ANCHOR_NUM_BEFORE,
      hasNewerMessages: false,
    };
  }

  const chatKey = chatKeyFromContext(context);
  const cached = await getChatMessagesAscending(instanceId, chatKey).catch(
    () => [] as MockMessage[],
  );
  const meta = await getChatMeta(instanceId, chatKey).catch(() => null);
  return {
    messages: cached,
    hasOlderMessages: meta?.reachedOldest !== true,
    hasNewerMessages: meta?.reachedNewest !== true,
  };
}

async function fetchNetworkMessagesByMode(options: {
  context: CurrentChatContext;
  focusedMessageId: MessageId | null;
  currentUserId: UserId | null;
  signal?: AbortSignal;
}): Promise<MockMessage[]> {
  const { context, focusedMessageId, currentUserId, signal } = options;
  throwIfAborted(signal);
  const isDm = context.type === "dm";
  const numBefore = isDm ? MESSENGER_DM_ANCHOR_NUM_BEFORE : MESSENGER_STREAM_ANCHOR_NUM_BEFORE;
  // Focused load fetches a window on both sides of the anchor; newest load only pulls older rows.
  let numAfter = 0;
  if (focusedMessageId != null) {
    numAfter = isDm ? MESSENGER_DM_ANCHOR_NUM_AFTER : MESSENGER_STREAM_ANCHOR_NUM_AFTER;
  }
  const page = await fetchChatMessagesPage({
    context,
    currentUserId,
    anchor: focusedMessageId ?? "newest",
    numBefore,
    numAfter,
    signal,
  });
  return page.messages;
}

function resolveNextContextFromApi(options: { context: CurrentChatContext }): CurrentChatContext {
  // Gateway `/messages/` rows carry no topic or recipient identity, so the active route context
  // is authoritative — no re-derivation of topic/DM key from message bodies.
  return options.context;
}

async function persistNetworkMessagesByMode(options: {
  mode: InitialLoadMode;
  context: CurrentChatContext;
  nextContext: CurrentChatContext;
  messages: readonly MockMessage[];
  currentUserId: UserId | null;
  persistToIndexedDb: boolean;
  instanceId: string | null;
}): Promise<void> {
  const { mode, context, nextContext, messages, currentUserId, persistToIndexedDb, instanceId } =
    options;
  if (!persistToIndexedDb || instanceId == null) return;

  if (mode === "stream-wide" && context.type === "stream") {
    if (messages.length === 0) return;
    await upsertMessagesByChatPartitions({
      instanceId,
      currentUserId,
      messages,
      resetBoundaries: true,
    });
    return;
  }

  // Gateway rows carry no recipient/topic identity to derive a key from, so the route context is
  // authoritative for the cache key (keeps read and write paths aligned).
  const chatKeyForMeta = chatKeyFromContext(nextContext);
  await updateChatMetaPatch(instanceId, chatKeyForMeta, {
    reachedOldest: false,
    reachedNewest: false,
  });
  if (messages.length === 0) return;
  await upsertChatMessages({
    instanceId,
    chatKey: chatKeyForMeta,
    messages,
    windowSizeN: messengerMessageCacheWindowN(nextContext),
  });
}

export async function loadInitialMessagesRouteDriven(
  options: LoadInitialMessagesRouteDrivenOptions,
): Promise<LoadInitialMessagesRouteDrivenResult> {
  throwIfAborted(options.signal);
  const mode = resolveInitialLoadMode(options.context);

  if (
    options.persistToIndexedDb &&
    options.instanceId != null &&
    options.focusedMessageId == null
  ) {
    const cachedSnapshot = await readCachedMessagesByMode({
      mode,
      context: options.context,
      instanceId: options.instanceId,
    });
    throwIfAborted(options.signal);
    if (cachedSnapshot.messages.length > 0) {
      options.onCacheHydrated?.(cachedSnapshot);
    }
  }

  const messages = await fetchNetworkMessagesByMode({
    context: options.context,
    focusedMessageId: options.focusedMessageId,
    currentUserId: options.currentUserId,
    signal: options.signal,
  });
  // Belt-and-suspenders: some transports/clients resolve failures as empty message lists while offline.
  if (messages.length === 0 && typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new Error("Network offline");
  }
  throwIfAborted(options.signal);
  const flags = deriveFocusedPaginationFlags(messages, options.focusedMessageId);
  const nextContext = resolveNextContextFromApi({ context: options.context });

  await persistNetworkMessagesByMode({
    mode,
    context: options.context,
    nextContext,
    messages,
    currentUserId: options.currentUserId,
    persistToIndexedDb: options.persistToIndexedDb,
    instanceId: options.instanceId,
  });
  throwIfAborted(options.signal);

  return {
    mode,
    messages,
    nextContext,
    hasOlderMessages: flags.hasOlderMessages,
    hasNewerMessages: flags.hasNewerMessages,
  };
}
