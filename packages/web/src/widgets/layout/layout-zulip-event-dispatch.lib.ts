import { isMessageForContext } from "~/entities/message/message.model";
import { resolveIncomingDmCallInvite } from "~/features/jitsi-call/jitsi-call-invite.lib";
import { resolveTypingEventRoute } from "~/features/typing-indicator/typing-event-routing";
import { getCurrentInstance } from "~/shared/api/client";
import type { ZulipEvent, ZulipRawMessage } from "~/shared/api/zulip";
import { rawMessageToMockMessage } from "~/shared/api/zulip";
import { getElectronAPI } from "~/shared/lib/electron";
import { plainTextPreviewFromMessageBody } from "~/shared/lib/message-markdown-display.lib";
import {
  applyZulipEventToMessageIndexedDb,
  isChatMessagesPersistToIndexedDbEnabled,
} from "~/shared/lib/message-idb-from-zulip.lib";
import { shouldNotify } from "~/shared/lib/notifications-policy";
import { closeReadMessageNotifications } from "./layout-notification-tags.lib";
import type {
  LayoutMessageFlagOp,
  LayoutNotificationsActions,
  LayoutZulipEventDispatchContext,
} from "./layout-zulip-event-dispatch.types";

export function dispatchZulipEvent(event: ZulipEvent, ctx: LayoutZulipEventDispatchContext): void {
  const { chatList, currentChat, users, typing, mute, activity, inbox, notifications, jitsiCall } =
    ctx;

  const instance = getCurrentInstance();
  if (instance?.id && isChatMessagesPersistToIndexedDbEnabled()) {
    void applyZulipEventToMessageIndexedDb({
      instanceId: instance.id,
      currentUserId: chatList.currentUserId,
      event,
    }).catch(() => {});
  }

  if (event.type === "message" && event.message) {
    const raw = event.message as unknown as ZulipRawMessage;
    users.mergeFromMessage(raw);
    chatList.addMessage(raw);
    ctx.updateLatestMessageId(raw.id);
    activity.markStale();

    const currentUserId = chatList.currentUserId;
    const isForCurrentChat = currentChat.context
      ? isMessageForContext(raw, currentChat.context, currentUserId)
      : false;
    if (isForCurrentChat) {
      currentChat.appendMessage(rawMessageToMockMessage(raw));
    }

    inbox.markStale();

    const isFromSelf = raw.sender_id === currentUserId;
    if (!isFromSelf && !isForCurrentChat) {
      let isMuted = false;
      if (raw.type === "stream" && raw.stream_id != null) {
        const topic = (raw.subject ?? "").trim() || "general";
        isMuted = mute.isEffectivelyMuted(raw.stream_id, topic);
      }

      if (shouldNotify({ isFromSelf, isForCurrentChat, isMuted })) {
        const senderName = raw.sender_full_name ?? "New message";
        const contentPreview = plainTextPreviewFromMessageBody(raw.content ?? "").slice(0, 100);
        notifications
          .show({
            title: senderName,
            body: contentPreview,
            tag: `msg-${raw.id}`,
          })
          .catch(() => {});

        const soundPreset = notifications.getSoundPreset();
        if (soundPreset !== "none") {
          notifications.playSound(soundPreset);
        }

        notifications.requestAttentionIfNotFocused();
      }
    }
    const incomingInvite = resolveIncomingDmCallInvite(raw, currentUserId);
    if (incomingInvite != null) {
      jitsiCall.ingestIncomingInvite(incomingInvite);
    }
    return;
  }

  if (event.type === "update_message_flags") {
    const op = event.op as LayoutMessageFlagOp;
    const flag = event.flag as string;
    const messageIds = (event.messages ?? []) as number[];
    if (messageIds.length === 0) return;
    activity.markStale();
    if (flag === "starred") {
      activity.markStarredSummaryStale();
    }
    if (flag === "read") {
      inbox.markStale();
      if (op === "add") {
        closeReadMessageNotifications(notifications.closeByTag, messageIds);
        chatList.decrementUnreadForMessages(messageIds);
        currentChat.updateMessageFlags(messageIds, "read", "add");
      } else {
        chatList.incrementUnreadForMessages(messageIds);
        currentChat.updateMessageFlags(messageIds, "read", "remove");
      }
    }
    return;
  }

  if (event.type === "reaction") {
    activity.markStale();
    const messageId = event.message_id as number;
    const reaction =
      event.emoji_name != null
        ? {
            emoji_name: event.emoji_name as string,
            emoji_code: (event.emoji_code as string) ?? "",
            reaction_type:
              (event.reaction_type as "unicode_emoji" | "realm_emoji" | "zulip_extra_emoji") ??
              "unicode_emoji",
            user_id: event.user_id as number,
          }
        : null;
    if (reaction) {
      const op = (event.op as LayoutMessageFlagOp) ?? "add";
      currentChat.updateMessageReaction(messageId, reaction, op);
    }
    return;
  }

  if (event.type === "delete_message") {
    activity.markStale();
    activity.markStarredSummaryStale();
    const messageIds = event.message_ids
      ? (event.message_ids as number[])
      : event.message_id != null
        ? [event.message_id as number]
        : [];
    if (messageIds.length > 0) {
      chatList.handleDeleteMessages(messageIds);
      currentChat.removeMessages(messageIds);
    }
    return;
  }

  if (event.type === "typing") {
    const sender = event.sender as { user_id: number } | undefined;
    const recipients = event.recipients as { user_id: number }[] | undefined;
    const currentUserId = chatList.currentUserId;
    const route = resolveTypingEventRoute({
      op: event.op as string | undefined,
      messageType: event.message_type as string | undefined,
      senderUserId: sender?.user_id,
      recipients,
      streamId: event.stream_id as number | undefined,
      topic: event.topic as string | undefined,
      currentUserId,
    });
    if (route) {
      typing.setTyping(route.chatKey, route.userId, route.isTyping);
    }
    return;
  }

  if (event.type === "update_message") {
    activity.markStale();
    activity.markStarredSummaryStale();
    const messageId = event.message_id as number | undefined;
    const renderingOnly = event.rendering_only === true;
    const newMarkdown =
      !renderingOnly && typeof event.content === "string" ? event.content : undefined;
    const newHtml = event.rendered_content as string | undefined;
    if (messageId == null) return;
    if (renderingOnly) {
      return;
    }
    if (newMarkdown != null) {
      const trimmed = newMarkdown.trim();
      currentChat.updateMessageContent(
        messageId,
        newMarkdown,
        trimmed.length > 0 ? newMarkdown : undefined,
      );
      return;
    }
    if (newHtml != null) {
      currentChat.updateMessageContent(messageId, newHtml);
    }
    return;
  }

  if (event.type === "presence") {
    const email = event.email as string | undefined;
    const presenceData = event.presence as
      | Record<string, { status?: string; timestamp?: number }>
      | undefined;
    if (email && presenceData) {
      const agg = presenceData.aggregated ?? presenceData.website;
      if (agg?.status != null && agg?.timestamp != null) {
        users.setPresenceByEmail(email, {
          status: agg.status === "idle" ? "idle" : "active",
          timestamp: agg.timestamp,
        });
      }
    }
    return;
  }

  if (event.type === "user_status") {
    const userId = event.user_id as number | undefined;
    if (userId != null) {
      const statusText = typeof event.status_text === "string" ? event.status_text.trim() : "";
      const emojiName = typeof event.emoji_name === "string" ? event.emoji_name.trim() : "";
      const emojiCode = typeof event.emoji_code === "string" ? event.emoji_code.trim() : "";
      const reactionTypeRaw =
        typeof event.reaction_type === "string" ? event.reaction_type : undefined;
      const reactionType =
        reactionTypeRaw === "unicode_emoji" ||
        reactionTypeRaw === "realm_emoji" ||
        reactionTypeRaw === "zulip_extra_emoji"
          ? reactionTypeRaw
          : undefined;
      const away = event.away === true;
      const hasStatus = statusText.length > 0 || emojiName.length > 0 || away;
      users.setStatus(
        userId,
        hasStatus
          ? {
              text: statusText,
              emojiName: emojiName || undefined,
              emojiCode: emojiCode || undefined,
              reactionType,
              away,
            }
          : null,
        Date.now(),
      );
    }
    return;
  }

  if (event.type === "subscription") {
    const op = event.op as "update" | "add" | "remove" | "peer_add" | "peer_remove" | undefined;
    if (op === "update") {
      const streamId = event.stream_id as number | undefined;
      const property = event.property as string | undefined;
      const value = event.value as boolean | undefined;
      if (streamId != null && property === "is_muted" && value != null) {
        if (value) {
          mute.muteStream(streamId);
        } else {
          mute.unmuteStream(streamId);
        }
      }
    }
    return;
  }

  if (event.type === "user_topic") {
    const streamId = event.stream_id as number | undefined;
    const topicName = event.topic_name as string | undefined;
    const visibilityPolicy = event.visibility_policy as number | undefined;
    if (streamId != null && topicName != null && visibilityPolicy != null) {
      if (visibilityPolicy === 1) {
        mute.muteTopic(streamId, topicName);
      } else if (visibilityPolicy === 2) {
        mute.unmuteTopic(streamId, topicName);
      } else {
        mute.unmuteTopic(streamId, topicName);
      }
    }
  }
}

export function buildLayoutNotificationsActions(options: {
  show: LayoutNotificationsActions["show"];
  closeByTag: LayoutNotificationsActions["closeByTag"];
  playSound: (preset?: string) => void;
  getSoundPreset: () => string;
}): LayoutNotificationsActions {
  return {
    show: options.show,
    closeByTag: options.closeByTag,
    playSound: options.playSound,
    getSoundPreset: options.getSoundPreset,
    requestAttentionIfNotFocused: () => {
      if (typeof document !== "undefined" && !document.hasFocus()) {
        // In web runtime, this is a no-op (no Electron API).
        getElectronAPI()?.os?.requestAttention?.();
      }
    },
  };
}
