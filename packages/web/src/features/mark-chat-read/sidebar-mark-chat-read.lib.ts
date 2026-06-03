/**
 * Sidebar context-menu mark-all-read: narrow API + local unread badge clear.
 */
import {
  clearRemainingContextUnread,
  type ChatListReadFallbackContext,
} from "~/entities/chat-list/chat-list-apply-read-decrement.lib";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useCurrentChatMessagesStore } from "~/entities/message/message.model";
import { markDmAsRead, markStreamAsRead, markTopicAsRead } from "~/shared/api/zulip-read-state";
import { dmConversationKey } from "~/shared/lib/dm-key";
import { logSidebarUnreadFlow } from "~/shared/lib/sidebar-unread-debug.lib";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";

export type SidebarMarkReadTarget =
  | { type: "dm"; userIds: number[] }
  | { type: "stream"; streamId: number }
  | { type: "topic"; streamId: number; topic: string };

function fallbackContextForTarget(
  target: SidebarMarkReadTarget,
  currentUserId: number | null,
): ChatListReadFallbackContext {
  if (target.type === "dm") {
    const dmKey = dmConversationKey(
      target.userIds.map((id) => ({ id })),
      currentUserId,
    );
    return { type: "dm", dmKey };
  }
  if (target.type === "stream") {
    return { type: "stream", streamId: target.streamId, topic: "" };
  }
  return {
    type: "stream",
    streamId: target.streamId,
    topic: normalizeTopicForIdentity(target.topic),
  };
}

function clearStreamWideUnread(streamId: number): void {
  const chatListState = useChatListStore.getState();
  const stream = chatListState.streamsMap.get(streamId);
  if (stream == null) return;

  let totalRemaining = 0;
  for (const topic of stream.topics.values()) {
    totalRemaining += topic.unreadCount;
  }
  if (totalRemaining <= 0) return;

  for (const [topicKey, topic] of stream.topics.entries()) {
    if (topic.unreadCount <= 0) continue;
    chatListState.decrementUnreadForTopic(streamId, topicKey, topic.unreadCount);
  }
}

async function requestSidebarMarkReadApi(target: SidebarMarkReadTarget): Promise<boolean> {
  if (target.type === "dm") {
    return markDmAsRead(target.userIds);
  }
  if (target.type === "stream") {
    return markStreamAsRead(target.streamId);
  }
  return markTopicAsRead(target.streamId, target.topic);
}

/** Marks a sidebar chat/topic read via flags/narrow and clears local unread badges. */
export async function applySidebarMarkChatAsRead(target: SidebarMarkReadTarget): Promise<boolean> {
  const currentUserId = useChatListStore.getState().currentUserId;
  logSidebarUnreadFlow("sidebar:markAsRead:start", { target });

  const ok = await requestSidebarMarkReadApi(target);
  if (!ok) {
    logSidebarUnreadFlow("sidebar:markAsRead:failed", { target });
    return false;
  }

  const chatListState = useChatListStore.getState();
  if (target.type === "stream") {
    clearStreamWideUnread(target.streamId);
  } else {
    const fallbackContext = fallbackContextForTarget(target, currentUserId);
    clearRemainingContextUnread(
      () => useChatListStore.getState(),
      chatListState,
      fallbackContext,
      "sidebar:markAsRead",
    );
  }

  const openContext = useCurrentChatMessagesStore.getState().context;
  if (openContext != null) {
    if (
      target.type === "dm" &&
      openContext.type === "dm" &&
      dmConversationKey(
        target.userIds.map((id) => ({ id })),
        currentUserId,
      ) === openContext.dmKey
    ) {
      const unreadIds = useCurrentChatMessagesStore
        .getState()
        .messages.filter((m) => !(m.flags ?? []).includes("read"))
        .map((m) => m.id);
      if (unreadIds.length > 0) {
        useCurrentChatMessagesStore.getState().updateMessageFlags(unreadIds, "read", "add");
      }
    }
    if (
      target.type === "topic" &&
      openContext.type === "stream" &&
      !openContext.streamWideView &&
      openContext.streamId === target.streamId &&
      normalizeTopicForIdentity(openContext.topic) === normalizeTopicForIdentity(target.topic)
    ) {
      const unreadIds = useCurrentChatMessagesStore
        .getState()
        .messages.filter((m) => !(m.flags ?? []).includes("read"))
        .map((m) => m.id);
      if (unreadIds.length > 0) {
        useCurrentChatMessagesStore.getState().updateMessageFlags(unreadIds, "read", "add");
      }
    }
  }

  logSidebarUnreadFlow("sidebar:markAsRead:done", {
    target,
    totalsAfter: {
      sidebarStreamsUnread: useChatListStore.getState().sidebarStreamsUnread,
      sidebarDmsUnread: useChatListStore.getState().sidebarDmsUnread,
    },
  });
  return true;
}
