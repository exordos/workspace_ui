/**
 * Shared sidebar unread decrement when messages are marked read (API, optimistic, or Zulip events).
 */
import type { CurrentChatContext } from "~/entities/message/message.model";
import {
  logSidebarUnreadFlow,
  summarizeContextBadge,
  summarizeMessageIdsForFlowDebug,
  summarizeSidebarUnreadTotals,
} from "~/shared/lib/sidebar-unread-debug.lib";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import type { DmEntryInternal, StreamEntryInternal } from "~/shared/types/sidebar-chat";
import type { MessageLocation } from "./chat-list.model.types";

export type ChatListReadFallbackContext =
  | { type: "stream"; streamId: number; topic: string }
  | { type: "dm"; dmKey: string };

export interface ChatListUnreadDecrementActions {
  decrementUnreadForMessages: (messageIds: number[]) => void;
  decrementUnreadForTopic: (streamId: number, topic: string, count: number) => void;
  decrementUnreadForDmKey: (dmKey: string, count: number) => void;
  decrementMentionsForReadMessages: (messageIds: readonly number[]) => void;
}

export interface ChatListUnreadDecrementState {
  messageIdToLocation: ReadonlyMap<number, MessageLocation>;
  streamsMap: ReadonlyMap<number, StreamEntryInternal>;
  dmsMap: ReadonlyMap<string, DmEntryInternal>;
  sidebarStreamsUnread: number;
  sidebarDmsUnread: number;
}

export interface ApplyChatListReadDecrementOptions {
  /** Message ids reported read (API batch, Zulip event, or optimistic). */
  messageIds: readonly number[];
  fallbackContext?: ChatListReadFallbackContext;
  /**
   * When local message flags are already `read` but sidebar badge is stale, apply extra
   * decrement up to `min(remaining, messageIds.length)` after the index/fallback path.
   */
  clampWhenAlreadyRead?: boolean;
  /** Caller label for `[sidebar-unread]` traces (e.g. `event:flagsRead`, `chat:optimistic`). */
  source?: string;
}

/** Maps open-chat context to stream/topic or DM keys for fallback decrement. */
export function readFallbackContextFromCurrentChat(
  context: CurrentChatContext | null,
): ChatListReadFallbackContext | undefined {
  if (context == null) {
    return undefined;
  }
  if (context.type === "dm") {
    return { type: "dm", dmKey: context.dmKey };
  }
  if (context.type === "stream" && !context.streamWideView) {
    return {
      type: "stream",
      streamId: context.streamId,
      topic: context.topic,
    };
  }
  return undefined;
}

function fallbackContextFromMessageLocation(
  location: MessageLocation,
): ChatListReadFallbackContext {
  if (location.type === "stream") {
    return {
      type: "stream",
      streamId: location.stream_id,
      topic: location.topic,
    };
  }
  return { type: "dm", dmKey: location.dmKey };
}

function readLocationGroupKey(location: MessageLocation): string {
  if (location.type === "stream") {
    return `stream:${location.stream_id}\t${normalizeTopicForIdentity(location.topic)}`;
  }
  return `dm:${location.dmKey.trim()}`;
}

/** Partitions read message ids by sidebar location for per-context fallback decrement. */
export function groupMessageIdsByReadLocation(
  state: ChatListUnreadDecrementState,
  messageIds: readonly number[],
): {
  groups: { fallbackContext: ChatListReadFallbackContext; messageIds: number[] }[];
  unindexedIds: number[];
} {
  const byKey = new Map<
    string,
    { fallbackContext: ChatListReadFallbackContext; messageIds: number[] }
  >();
  const unindexedIds: number[] = [];

  for (const messageId of messageIds) {
    const location = state.messageIdToLocation.get(messageId);
    if (location == null) {
      unindexedIds.push(messageId);
      continue;
    }
    const key = readLocationGroupKey(location);
    const fallbackContext = fallbackContextFromMessageLocation(location);
    const existing = byKey.get(key);
    if (existing != null) {
      existing.messageIds.push(messageId);
    } else {
      byKey.set(key, { fallbackContext, messageIds: [messageId] });
    }
  }

  return { groups: [...byKey.values()], unindexedIds };
}

/**
 * Applies read decrement per location group so fallback never targets the wrong open chat.
 */
export function applyChatListReadDecrementGrouped(
  getState: () => ChatListUnreadDecrementState,
  actions: ChatListUnreadDecrementActions,
  options: {
    messageIds: readonly number[];
    clampWhenAlreadyRead?: boolean;
    source?: string;
  },
): void {
  const {
    messageIds,
    clampWhenAlreadyRead = false,
    source = "apply:readDecrementGrouped",
  } = options;
  if (messageIds.length === 0) {
    return;
  }

  const stateBefore = getState();
  const { groups, unindexedIds } = groupMessageIdsByReadLocation(stateBefore, messageIds);

  logSidebarUnreadFlow(`${source}:start`, {
    ...summarizeMessageIdsForFlowDebug(messageIds),
    groupCount: groups.length,
    unindexedCount: unindexedIds.length,
    totalsBefore: summarizeSidebarUnreadTotals(stateBefore),
  });

  for (const group of groups) {
    applyChatListReadDecrement(getState, actions, {
      messageIds: group.messageIds,
      fallbackContext: group.fallbackContext,
      clampWhenAlreadyRead,
      source: `${source}:loc`,
    });
  }

  if (unindexedIds.length > 0) {
    const soleGroupFallback = groups.length === 1 ? groups[0]!.fallbackContext : undefined;
    applyChatListReadDecrement(getState, actions, {
      messageIds: unindexedIds,
      fallbackContext: soleGroupFallback,
      source: `${source}:unindexed`,
    });
  }
}

export function getContextUnreadCount(
  state: ChatListUnreadDecrementState,
  context: ChatListReadFallbackContext,
): number {
  if (context.type === "stream") {
    const topicKey = normalizeTopicForIdentity(context.topic);
    return state.streamsMap.get(context.streamId)?.topics.get(topicKey)?.unreadCount ?? 0;
  }
  const dmKey = context.dmKey.trim();
  if (dmKey.length === 0) {
    return 0;
  }
  return state.dmsMap.get(dmKey)?.unreadCount ?? 0;
}

function applyReadDecrementFallback(
  getState: () => ChatListUnreadDecrementState,
  actions: ChatListUnreadDecrementActions,
  options: {
    fallbackContext: ChatListReadFallbackContext;
    neverIndexedCount: number;
    source: string;
  },
): void {
  const { fallbackContext, neverIndexedCount, source } = options;
  const contextUnreadAfterPerMessage = getContextUnreadCount(getState(), fallbackContext);
  const fallbackCount =
    neverIndexedCount > 0 ? Math.min(neverIndexedCount, contextUnreadAfterPerMessage) : 0;

  if (fallbackCount > 0) {
    if (fallbackContext.type === "stream") {
      actions.decrementUnreadForTopic(
        fallbackContext.streamId,
        fallbackContext.topic,
        fallbackCount,
      );
      logSidebarUnreadFlow(`${source}:fallbackTopic`, {
        streamId: fallbackContext.streamId,
        topic: fallbackContext.topic,
        count: fallbackCount,
        contextUnreadAfterPerMessage,
      });
    } else {
      actions.decrementUnreadForDmKey(fallbackContext.dmKey, fallbackCount);
      logSidebarUnreadFlow(`${source}:fallbackDm`, {
        dmKey: fallbackContext.dmKey,
        count: fallbackCount,
        contextUnreadAfterPerMessage,
      });
    }
    return;
  }

  if (neverIndexedCount > 0) {
    logSidebarUnreadFlow(`${source}:fallbackSkipped`, {
      neverIndexedCount,
      contextUnreadAfterPerMessage,
      reason: "context_already_zero",
    });
  }
}

function applyReadDecrementStaleClamp(
  getState: () => ChatListUnreadDecrementState,
  actions: ChatListUnreadDecrementActions,
  options: {
    fallbackContext: ChatListReadFallbackContext;
    messageIds: readonly number[];
    source: string;
  },
): void {
  const { fallbackContext, messageIds, source } = options;
  const remaining = getContextUnreadCount(getState(), fallbackContext);
  if (remaining <= 0) {
    return;
  }
  const extraDecrement = Math.min(remaining, messageIds.length);
  if (fallbackContext.type === "stream") {
    actions.decrementUnreadForTopic(
      fallbackContext.streamId,
      fallbackContext.topic,
      extraDecrement,
    );
  } else {
    actions.decrementUnreadForDmKey(fallbackContext.dmKey, extraDecrement);
  }
  logSidebarUnreadFlow(`${source}:clampStale`, {
    remainingBeforeClamp: remaining,
    extraDecrement,
  });
}

/**
 * Decrements sidebar unread for read message ids: per-id index, topic/DM fallback, optional stale clamp.
 */
export function applyChatListReadDecrement(
  getState: () => ChatListUnreadDecrementState,
  actions: ChatListUnreadDecrementActions,
  options: ApplyChatListReadDecrementOptions,
): void {
  const {
    messageIds,
    fallbackContext,
    clampWhenAlreadyRead = false,
    source = "apply:readDecrement",
  } = options;
  if (messageIds.length === 0) {
    return;
  }

  const stateBefore = getState();
  let knownIdsCount = 0;
  let neverIndexedCount = 0;
  for (const messageId of messageIds) {
    if (stateBefore.messageIdToLocation.has(messageId)) {
      knownIdsCount += 1;
    } else {
      neverIndexedCount += 1;
    }
  }

  logSidebarUnreadFlow(`${source}:start`, {
    ...summarizeMessageIdsForFlowDebug(messageIds),
    knownInLocationIndex: knownIdsCount,
    neverIndexedCount,
    missingFromLocationIndex: neverIndexedCount,
    clampWhenAlreadyRead,
    fallbackContext,
    badgeBefore: summarizeContextBadge(stateBefore, fallbackContext),
    totalsBefore: summarizeSidebarUnreadTotals(stateBefore),
  });

  actions.decrementUnreadForMessages([...messageIds]);

  if (fallbackContext != null) {
    applyReadDecrementFallback(getState, actions, {
      fallbackContext,
      neverIndexedCount,
      source,
    });
  }

  if (clampWhenAlreadyRead && fallbackContext != null) {
    applyReadDecrementStaleClamp(getState, actions, {
      fallbackContext,
      messageIds,
      source,
    });
  }

  actions.decrementMentionsForReadMessages(messageIds);

  const stateAfter = getState();
  logSidebarUnreadFlow(`${source}:done`, {
    badgeAfter: summarizeContextBadge(stateAfter, fallbackContext),
    totalsAfter: summarizeSidebarUnreadTotals(stateAfter),
  });
}

/** Zeros sidebar unread for a stream topic or DM when narrow/bulk read cleared more than local ids listed. */
export function clearRemainingContextUnread(
  getState: () => ChatListUnreadDecrementState,
  actions: ChatListUnreadDecrementActions,
  context: ChatListReadFallbackContext,
  source = "apply:clearRemaining",
): void {
  const stateBefore = getState();
  const remaining = getContextUnreadCount(stateBefore, context);
  logSidebarUnreadFlow(`${source}:start`, {
    remaining,
    context,
    totalsBefore: summarizeSidebarUnreadTotals(stateBefore),
  });
  if (remaining <= 0) {
    logSidebarUnreadFlow(`${source}:skip`, { reason: "already_zero" });
    return;
  }
  if (context.type === "stream") {
    actions.decrementUnreadForTopic(context.streamId, context.topic, remaining);
  } else {
    actions.decrementUnreadForDmKey(context.dmKey, remaining);
  }
  logSidebarUnreadFlow(`${source}:done`, {
    cleared: remaining,
    totalsAfter: summarizeSidebarUnreadTotals(getState()),
  });
}
