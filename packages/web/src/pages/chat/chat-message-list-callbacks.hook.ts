/**
 * Message list action callbacks for the chat page (reply, edit, reactions, navigation).
 */
import { useMemo } from "react";
import { useMessageReadersStore } from "~/features/message-readers/message-readers.model";
import { t } from "~/i18n/i18n";
import { addMessageFlag, addReaction, removeMessageFlag, removeReaction } from "~/shared/api/zulip";
import { plainTextPreviewFromMessageBody } from "~/shared/lib/message-markdown-display.lib";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { buildMessageRedirectRouteFromZulipPermalink } from "~/shared/lib/push-click";
import { encodeTopicForRoute } from "~/shared/lib/topic-identity.lib";
import { buildZulipMessageWebPermalink } from "~/shared/lib/zulip-web-permalink.lib";
import type { MessageListCallbacks } from "~/widgets/message-list/message-list.types";
import { slugForStream } from "~/widgets/sidebar/sidebar.lib";
import { resolveReplyQuoteContent } from "./chat-reply-quote.lib";
import type { UseChatMessageListCallbacksParams } from "./chat-message-list-callbacks.types";

export function useChatMessageListCallbacks(
  params: UseChatMessageListCallbacksParams,
): MessageListCallbacks {
  const {
    selectionMode,
    currentUserId,
    realmBaseUrl,
    streams,
    locationPathname,
    navigate,
    rightDrawer,
    setReplyQuote,
    requestMessageEdit,
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
    onRetryFailedOutgoing: retryFailedOutgoing,
    onRemoveFailedOutgoing: removeFailedOutgoing,
  } = params;

  return useMemo(
    () => ({
      onMessageReply(msg, selectedText) {
        const permalinkUrl =
          realmBaseUrl.trim().length > 0
            ? buildZulipMessageWebPermalink(
                realmBaseUrl,
                msg,
                (streamId) => streams.find((s) => s.stream_id === streamId)?.name,
              )
            : null;
        setReplyQuote({
          id: msg.id,
          content: resolveReplyQuoteContent(msg, selectedText),
          sender_full_name: msg.sender_full_name,
          sender_id: msg.sender_id,
          permalinkUrl,
        });
      },
      onMessageEdit(msg) {
        requestMessageEdit(msg);
      },
      onMessageDelete(msg) {
        setDeleteConfirm({ type: "single", messageId: msg.id });
      },
      onMessageCopy(msg) {
        const text = plainTextPreviewFromMessageBody(msg.content);
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
      onMessageAddReaction(messageId, payload) {
        setActionError(null);
        addReaction(messageId, payload.emojiName, {
          reactionType: payload.reactionType,
          emojiCode: payload.emojiCode,
        })
          .then(() => {
            updateMessageReactionInStore(
              messageId,
              {
                emoji_name: payload.emojiName,
                emoji_code: payload.emojiCode ?? "",
                reaction_type: payload.reactionType,
                user_id: currentUserId ?? 0,
              },
              "add",
            );
          })
          .catch((err) =>
            setActionError(err instanceof Error ? err.message : t("message.reactionError")),
          );
      },
      onMessageRemoveReaction(messageId, payload) {
        setActionError(null);
        removeReaction(messageId, payload.emojiName, {
          reactionType: payload.reactionType,
          emojiCode: payload.emojiCode,
        })
          .then(() => {
            updateMessageReactionInStore(
              messageId,
              {
                emoji_name: payload.emojiName,
                emoji_code: payload.emojiCode ?? "",
                reaction_type: payload.reactionType,
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
      onMessagePermalinkClick(href) {
        const redirectRoute = buildMessageRedirectRouteFromZulipPermalink(href);
        if (redirectRoute == null) return false;
        void navigate(redirectRoute);
        return true;
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
        const route = `/stream/${slugForStream({ stream_id: msg.stream_id, name: streamName })}/topic/${encodeURIComponent(
          encodeTopicForRoute(topic),
        )}`;
        if (route === locationPathname) return;
        void navigate(route);
      },
      onMessageAuthorClick(userId) {
        rightDrawer?.openUserProfile?.(userId);
      },
      onOpenDirectMessage(userId) {
        void navigate(withCurrentOrgRoute(`/dm/${userId}`));
      },
      onRetryFailedOutgoing(msg) {
        void retryFailedOutgoing(msg);
      },
      onRemoveFailedOutgoing(msg) {
        removeFailedOutgoing(msg);
      },
    }),
    [
      selectionMode,
      currentUserId,
      realmBaseUrl,
      updateMessageFlagsInStore,
      updateMessageReactionInStore,
      streams,
      locationPathname,
      navigate,
      rightDrawer,
      setReplyQuote,
      requestMessageEdit,
      setDeleteConfirm,
      setToastMessage,
      setForwardMessages,
      setForwardSelectedText,
      setActionError,
      setSelectedMessageIds,
      setSelectionMode,
      openJitsiCall,
      setReadReceiptsOpen,
      retryFailedOutgoing,
      removeFailedOutgoing,
    ],
  );
}
