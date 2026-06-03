import {
  clearRemainingContextUnread,
  type ChatListReadFallbackContext,
} from "~/entities/chat-list/chat-list-apply-read-decrement.lib";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import type { MessageLocation } from "~/entities/chat-list/chat-list.model.types";
import { markMessagesAsRead } from "~/shared/api/zulip-read-state";
import { dmRouteKey } from "~/shared/lib/dm-key";
import { buildMessageIdMap } from "~/shared/lib/message-id-index.lib";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";

interface ResolveMarkAllAsReadTargetOptions {
  isDmView: boolean;
  activeDmUserIds: number[] | null;
  activeStreamId: number | null;
  activeTopic: string | undefined;
}

export type MarkAllAsReadTarget =
  | {
      type: "dm";
      userIds: number[];
    }
  | {
      type: "topic";
      streamId: number;
      topic: string;
    };

export function resolveMarkAllAsReadTarget({
  isDmView,
  activeDmUserIds,
  activeStreamId,
  activeTopic,
}: ResolveMarkAllAsReadTargetOptions): MarkAllAsReadTarget | null {
  if (isDmView) {
    if (activeDmUserIds == null || activeDmUserIds.length === 0) return null;
    return { type: "dm", userIds: activeDmUserIds };
  }

  if (activeStreamId == null) return null;
  // Stream-wide route (no topic in URL): do not resolve a mark-all target — reading is per-topic only.
  if (activeTopic == null) return null;
  return { type: "topic", streamId: activeStreamId, topic: activeTopic };
}

export function collectUnreadMessageIds(
  messages: readonly {
    id: number;
    flags?: string[];
  }[],
): number[] {
  return messages
    .filter((message) => !(message.flags ?? []).includes("read"))
    .map((message) => message.id);
}

function messageLocationMatchesMarkAllTarget(
  location: MessageLocation,
  target: MarkAllAsReadTarget,
  currentUserId: number | null,
): boolean {
  if (target.type === "dm") {
    if (location.type !== "dm") return false;
    return location.dmKey === dmRouteKey(target.userIds, currentUserId);
  }
  if (location.type !== "stream") return false;
  if (location.stream_id !== target.streamId) return false;
  return normalizeTopicForIdentity(location.topic) === normalizeTopicForIdentity(target.topic);
}

/** Loaded-window unread ids plus index ids for the current narrow (server unreads outside the window). */
export function collectMarkAllAsReadMessageIds(
  loadedMessages: readonly { id: number; flags?: string[] }[],
  messageIdToLocation: ReadonlyMap<number, MessageLocation>,
  target: MarkAllAsReadTarget,
  currentUserId: number | null,
): number[] {
  const ids = new Set(collectUnreadMessageIds(loadedMessages));
  for (const [messageId, location] of messageIdToLocation) {
    if (messageLocationMatchesMarkAllTarget(location, target, currentUserId)) {
      ids.add(messageId);
    }
  }
  return Array.from(ids).sort((a, b) => a - b);
}

export function markAllAsReadFallbackContext(
  target: MarkAllAsReadTarget,
  currentUserId: number | null,
): ChatListReadFallbackContext {
  if (target.type === "dm") {
    return { type: "dm", dmKey: dmRouteKey(target.userIds, currentUserId) };
  }
  return {
    type: "stream",
    streamId: target.streamId,
    topic: normalizeTopicForIdentity(target.topic),
  };
}

export interface ApplyOpenChatMarkAllAsReadOptions {
  target: MarkAllAsReadTarget;
  loadedMessages: readonly { id: number; flags?: string[] }[];
  currentUserId: number | null;
  applyOptimistic: (messageIds: number[], fallbackContext: ChatListReadFallbackContext) => void;
}

/** Marks all unread in the open chat via per-id flags API (never narrow). */
export async function applyOpenChatMarkAllAsRead(
  options: ApplyOpenChatMarkAllAsReadOptions,
): Promise<boolean> {
  const chatListState = useChatListStore.getState();
  const messageIds = collectMarkAllAsReadMessageIds(
    options.loadedMessages,
    chatListState.messageIdToLocation,
    options.target,
    options.currentUserId,
  );
  const fallbackContext = markAllAsReadFallbackContext(options.target, options.currentUserId);

  if (messageIds.length > 0) {
    await markMessagesAsRead(messageIds);
    options.applyOptimistic(messageIds, fallbackContext);
  }

  clearRemainingContextUnread(
    () => useChatListStore.getState(),
    chatListState,
    fallbackContext,
    "chat:markAllClearRemaining",
  );
  return true;
}

/** Message shape needed to decide if an id still counts as unread for optimistic read application. */
export interface MessageReadFlagSlice {
  id: number;
  flags?: string[];
}

/**
 * Resolves each message id against the in-memory store first, then the effective on-screen list
 * (e.g. IndexedDB hook merge). Skips ids that are already marked read.
 *
 * Store-only lookup fails when the visible list is ahead of or wider than `store.messages` — then
 * optimistic flag updates and chat-list decrements were skipped even after a successful API call.
 */
export function filterMessageIdsStillUnreadForOptimisticApply(
  messageIds: readonly number[],
  options: {
    storeMessages: readonly MessageReadFlagSlice[];
    effectiveMessages: readonly MessageReadFlagSlice[];
  },
): number[] {
  const { storeMessages, effectiveMessages } = options;
  const storeById = buildMessageIdMap(storeMessages);
  const effectiveById = buildMessageIdMap(effectiveMessages);
  const out: number[] = [];
  for (const messageId of messageIds) {
    const message = storeById.get(messageId) ?? effectiveById.get(messageId);
    if (message != null && !(message.flags ?? []).includes("read")) {
      out.push(messageId);
    }
  }
  return out;
}
