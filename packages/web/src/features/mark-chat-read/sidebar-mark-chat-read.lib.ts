/**
 * Sidebar context-menu mark-all-read: API request + open-chat flag sync.
 */
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInboxStore } from "~/entities/inbox/inbox.model";
import { useCurrentChatMessagesStore } from "~/entities/message/message.model";
import { markDmAsRead, markStreamAsRead, markTopicAsRead } from "~/shared/api/messenger-read-state";
import { dmConversationKey } from "~/shared/lib/dm-key";
import { logSidebarUnreadFlow } from "~/shared/lib/sidebar-unread-debug.lib";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import { numericUserIdOrNull, type UserId } from "~/shared/lib/user-id.lib";

export type SidebarMarkReadTarget =
  | { type: "dm"; userIds: number[] }
  | { type: "stream"; streamId: string }
  | { type: "topic"; streamId: string; topic: string };

async function requestSidebarMarkReadApi(target: SidebarMarkReadTarget): Promise<boolean> {
  if (target.type === "dm") {
    return markDmAsRead(target.userIds);
  }
  if (target.type === "stream") {
    return markStreamAsRead(target.streamId);
  }
  return markTopicAsRead(target.streamId, target.topic);
}

/** Marks a sidebar chat/topic read and updates the open chat + inbox surfaces. */
export async function applySidebarMarkChatAsRead(target: SidebarMarkReadTarget): Promise<boolean> {
  const currentUserId = useChatListStore.getState().currentUserId;
  logSidebarUnreadFlow("sidebar:markAsRead:start", { target });

  const ok = await requestSidebarMarkReadApi(target);
  if (!ok) {
    logSidebarUnreadFlow("sidebar:markAsRead:failed", { target });
    return false;
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
        .messages.filter((m) => m.read !== true)
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
        .messages.filter((m) => m.read !== true)
        .map((m) => m.id);
      if (unreadIds.length > 0) {
        useCurrentChatMessagesStore.getState().updateMessageFlags(unreadIds, "read", "add");
      }
    }
  }

  useInboxStore
    .getState()
    .removeEntriesForTarget(target, numericUserIdOrNull(useChatListStore.getState().currentUserId));

  logSidebarUnreadFlow("sidebar:markAsRead:done", {
    target,
    totalsAfter: {
      sidebarStreamsUnread: useChatListStore.getState().sidebarStreamsUnread,
      sidebarDmsUnread: useChatListStore.getState().sidebarDmsUnread,
    },
  });
  return true;
}
