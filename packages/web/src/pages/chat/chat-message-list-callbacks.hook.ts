/**
 * Message list action callbacks for the chat page (reply, edit, reactions, navigation).
 */
import { useMemo } from "react";
import { useMessageReadersStore } from "~/features/message-readers/message-readers.model";
import { t } from "~/i18n/i18n";
import { addMessageFlag, addReaction, removeMessageFlag, removeReaction } from "~/shared/api/zulip";
import { stripHtml } from "~/shared/lib/html";
import type { MessageListCallbacks } from "~/widgets/message-list/message-list.types";
import { slugForStream } from "~/widgets/sidebar/sidebar.lib";
import type { UseChatMessageListCallbacksParams } from "./chat-message-list-callbacks.types";

export function useChatMessageListCallbacks(
  params: UseChatMessageListCallbacksParams,
): MessageListCallbacks {
  const {
    selectionMode,
    currentUserId,
    streams,
    locationPathname,
    navigate,
    rightDrawer,
    setReplyQuote,
    setEditingMessage,
    setDeleteConfirm,
    setToastMessage,
    setForwardMessages,
    setForwardSelectedText,
    setActionError,
    setSelectedMessageIds,
    setSelectionMode,
    updateMessageFlagsInStore,
    updateMessageReactionInStore,
    openJitsiCall,
    setReadReceiptsOpen,
  } = params;

  return useMemo(
    () => ({
      onMessageReply(msg, selectedText) {
        const trimmedSelectedText = selectedText?.trim();
        setReplyQuote({
          id: msg.id,
          content:
            trimmedSelectedText != null && trimmedSelectedText.length > 0
              ? trimmedSelectedText
              : msg.content,
          sender_full_name: msg.sender_full_name,
        });
      },
      onMessageEdit(msg) {
        setEditingMessage(msg);
      },
      onMessageDelete(msg) {
        setDeleteConfirm({ type: "single", messageId: msg.id });
      },
      onMessageCopy(msg) {
        const text = stripHtml(msg.content);
        void navigator.clipboard.writeText(text).then(
          () => setToastMessage(t("message.copied")),
          () => setToastMessage(t("message.copyFailed")),
        );
      },
      onMessageForward(msg, selectedText) {
        setForwardMessages([msg]);
        const normalizedSelectedText = selectedText?.trim();
        setForwardSelectedText(
          normalizedSelectedText != null && normalizedSelectedText.length > 0
            ? normalizedSelectedText
            : undefined,
        );
      },
      onMessageStar(msg) {
        const hasStar = msg.flags?.includes("starred");
        setActionError(null);
        (hasStar ? removeMessageFlag([msg.id], "starred") : addMessageFlag([msg.id], "starred"))
          .then(() => {
            updateMessageFlagsInStore([msg.id], "starred", hasStar ? "remove" : "add");
          })
          .catch((err) => setActionError(err instanceof Error ? err.message : t("app.error")));
      },
      onMessageSelect(msg) {
        setSelectedMessageIds((prev) => {
          const next = new Set(prev);
          if (next.has(msg.id)) next.delete(msg.id);
          else next.add(msg.id);
          return next;
        });
        if (!selectionMode) setSelectionMode(true);
      },
      onMessageAddReaction(messageId, emojiName) {
        setActionError(null);
        addReaction(messageId, emojiName)
          .then(() => {
            updateMessageReactionInStore(
              messageId,
              {
                emoji_name: emojiName,
                emoji_code: "",
                reaction_type: "unicode_emoji" as const,
                user_id: currentUserId ?? 0,
              },
              "add",
            );
          })
          .catch((err) =>
            setActionError(err instanceof Error ? err.message : t("message.reactionError")),
          );
      },
      onMessageRemoveReaction(messageId, emojiName) {
        setActionError(null);
        removeReaction(messageId, emojiName)
          .then(() => {
            updateMessageReactionInStore(
              messageId,
              {
                emoji_name: emojiName,
                emoji_code: "",
                reaction_type: "unicode_emoji" as const,
                user_id: currentUserId ?? 0,
              },
              "remove",
            );
          })
          .catch((err) =>
            setActionError(err instanceof Error ? err.message : t("message.reactionError")),
          );
      },
      onOpenJitsiCall(url: string, locationName?: string) {
        openJitsiCall(url, locationName?.trim() ?? "");
      },
      onMessageViews(msg) {
        void useMessageReadersStore.getState().fetchReadReceipts(msg.id);
        setReadReceiptsOpen(true);
      },
      onTopicSeparatorClick(msg) {
        if (msg.stream_id == null || msg.subject == null) return;
        const topic = msg.subject.trim();
        if (topic.length === 0) return;
        const streamName =
          streams.find((stream) => stream.stream_id === msg.stream_id)?.name ??
          (typeof msg.display_recipient === "string" ? msg.display_recipient : undefined);
        if (!streamName) return;
        const route = `/stream/${slugForStream({ stream_id: msg.stream_id, name: streamName })}/topic/${encodeURIComponent(topic)}`;
        if (route === locationPathname) return;
        void navigate(route);
      },
      onMessageAuthorClick(userId) {
        rightDrawer?.openUserProfile?.(userId);
      },
    }),
    [
      selectionMode,
      currentUserId,
      updateMessageFlagsInStore,
      updateMessageReactionInStore,
      streams,
      locationPathname,
      navigate,
      rightDrawer,
      setReplyQuote,
      setEditingMessage,
      setDeleteConfirm,
      setToastMessage,
      setForwardMessages,
      setForwardSelectedText,
      setActionError,
      setSelectedMessageIds,
      setSelectionMode,
      openJitsiCall,
      setReadReceiptsOpen,
    ],
  );
}
