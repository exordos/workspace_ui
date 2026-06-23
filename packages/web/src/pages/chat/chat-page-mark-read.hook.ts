/**
 * Mark-as-read wiring for the chat page.
 *
 * Scroll-driven read writes are disabled; mark-read actions use server-owned targets.
 */
import { useCallback } from "react";
import type { MessageId } from "~/shared/lib/message-id.lib";
import { useShortcut } from "~/shared/lib/shortcuts";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";
import type { UserId } from "~/shared/lib/user-id.lib";
import { applyOpenChatMarkAllAsRead, resolveMarkAllAsReadTarget } from "./chat-mark-all-read.lib";

export interface UseChatPageMarkReadParams {
  currentUserId: UserId | null;
  isDmView: boolean;
  activeDmUserIds: UserId[] | null;
  activeStreamId: string | null | undefined;
  activeTopic: string | undefined;
  streamSlug: string | undefined;
  topicName: string | undefined;
  dmIdParam: string | undefined;
}

export interface UseChatPageMarkReadResult {
  handleUnreadMessagesVisible: (messageIds: MessageId[]) => void;
  handleUnreadMessagesAtBottom: (messageIds: MessageId[]) => void;
  handleMarkAllAsRead: () => void;
}

export function useChatPageMarkRead({
  currentUserId,
  isDmView,
  activeDmUserIds,
  activeStreamId,
  activeTopic,
}: UseChatPageMarkReadParams): UseChatPageMarkReadResult {
  const handleUnreadMessagesVisible = useCallback((_messageIds: MessageId[]) => {}, []);

  const handleUnreadMessagesAtBottom = useCallback((_messageIds: MessageId[]) => {}, []);

  const handleMarkAllAsRead = useCallback(() => {
    const target = resolveMarkAllAsReadTarget({
      isDmView,
      activeDmUserIds,
      activeStreamId: activeStreamId ?? null,
      activeTopic,
    });
    if (!target) return;

    void applyOpenChatMarkAllAsRead({
      target,
      currentUserId,
    }).catch((err) => reportUnexpectedError("chat:markAllRead", err));
  }, [isDmView, activeDmUserIds, activeStreamId, activeTopic, currentUserId]);

  useShortcut("mod+shift+m", handleMarkAllAsRead, {
    context: "chat",
    enabled: isDmView
      ? (activeDmUserIds?.length ?? 0) > 0
      : activeStreamId != null && activeTopic != null,
  });

  return {
    handleUnreadMessagesVisible,
    handleUnreadMessagesAtBottom,
    handleMarkAllAsRead,
  };
}
