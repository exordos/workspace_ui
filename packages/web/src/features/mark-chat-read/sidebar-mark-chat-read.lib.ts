/**
 * Sidebar context-menu mark-all-read: server API request + inbox surface cleanup.
 */
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInboxStore } from "~/entities/inbox/inbox.model";
import { markDmAsRead, markStreamAsRead, markTopicAsRead } from "~/shared/api/messenger-read-state";
import { logSidebarUnreadFlow } from "~/shared/lib/sidebar-unread-debug.lib";
import { numericUserIdOrNull } from "~/shared/lib/user-id.lib";

export type SidebarMarkReadTarget =
  | { type: "dm"; userIds: number[]; streamId?: string }
  | { type: "stream"; streamId: string }
  | { type: "topic"; streamId: string; topic: string; topicUuid?: string };

async function requestSidebarMarkReadApi(target: SidebarMarkReadTarget): Promise<boolean> {
  if (target.type === "dm") {
    return markDmAsRead(target.userIds, target.streamId);
  }
  if (target.type === "stream") {
    return markStreamAsRead(target.streamId);
  }
  return markTopicAsRead(target.streamId, target.topic, target.topicUuid);
}

/** Marks a sidebar chat/topic read and updates the open chat + inbox surfaces. */
export async function applySidebarMarkChatAsRead(target: SidebarMarkReadTarget): Promise<boolean> {
  logSidebarUnreadFlow("sidebar:markAsRead:start", { target });

  const ok = await requestSidebarMarkReadApi(target);
  if (!ok) {
    logSidebarUnreadFlow("sidebar:markAsRead:failed", { target });
    return false;
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
