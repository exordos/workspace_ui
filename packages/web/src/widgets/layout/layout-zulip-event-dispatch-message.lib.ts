/**
 * Zulip realtime handlers: message, flags, reactions, delete, update.
 */
import { useInstancesStore } from "~/entities/instance/instance.model";
import { isMessageForContext, useCurrentChatMessagesStore } from "~/entities/message/message.model";
import { useNotificationSettingsStore } from "~/entities/notification-settings/notification-settings.model";
import { resolveIncomingDmCallInvite } from "~/features/jitsi-call/jitsi-call-invite.lib";
import { useSettingsStore } from "~/features/settings/settings.model";
import { getCurrentInstance } from "~/shared/api/client";
import type { ZulipEvent, ZulipRawMessage } from "~/shared/api/zulip";
import { rawMessageToMockMessage } from "~/shared/api/zulip";
import {
  applyZulipEventToMessageIndexedDb,
  isChatMessagesPersistToIndexedDbEnabled,
} from "~/shared/lib/message-idb-from-zulip.lib";
import { parseAllMessageEmbedsFromRenderedHtml } from "~/shared/lib/message-link-preview-fetch.lib";
import { enqueuePendingLinkPreview } from "~/shared/lib/message-link-preview-pending.lib";
import { linkPreviewUrlsMatch } from "~/shared/lib/message-link-preview-url-match.lib";
import { extractLinkPreviewUrls } from "~/shared/lib/message-link-preview-urls.lib";
import { plainTextPreviewFromMessageBody } from "~/shared/lib/message-markdown-display.lib";
import { registerNotifiedMessageId } from "~/shared/lib/notification-dedup.lib";
import { resolveNotificationSoundPreset } from "~/shared/lib/notification-sound-preset.lib";
import { shouldDesktopNotify } from "~/shared/lib/notifications-policy";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import { extractTopicMoveFromUpdateEvent } from "~/shared/lib/update-message-topic-move.lib";
import { closeReadMessageNotifications } from "./layout-notification-tags.lib";
import type {
  LayoutMessageFlagOp,
  LayoutZulipEventDispatchContext,
} from "./layout-zulip-event-dispatch.types";

export function applyMessageCacheIndexedDb(
  event: ZulipEvent,
  ctx: LayoutZulipEventDispatchContext,
): void {
  const instance = getCurrentInstance();
  if (!instance?.id || !isChatMessagesPersistToIndexedDbEnabled()) return;
  void applyZulipEventToMessageIndexedDb({
    instanceId: instance.id,
    currentUserId: ctx.chatList.currentUserId,
    event,
  }).catch(() => {});
}

// ---
// Обработчики по типам событий.
// Это держит cognitive complexity у `dispatchZulipEvent` на низком уровне.
// ---

export function handleIncomingMessage(
  event: ZulipEvent,
  ctx: LayoutZulipEventDispatchContext,
): void {
  if (event.type !== "message" || !event.message) return;
  const { chatList, currentChat, users, activity, inbox, jitsiCall } = ctx;
  const raw = event.message as unknown as ZulipRawMessage;
  ctx.onMessage?.(raw);
  users.mergeFromMessage(raw);
  chatList.addMessage(raw);
  // Что делает: fallback для серверов/сценариев, где rename канала приходит не отдельным stream-event,
  // а заметен только через новое display_recipient в message-событии.
  if (
    raw.type === "stream" &&
    Number.isInteger(raw.stream_id) &&
    raw.stream_id != null &&
    typeof raw.display_recipient === "string" &&
    raw.display_recipient.trim().length > 0
  ) {
    chatList.renameStream(raw.stream_id, raw.display_recipient);
  }
  ctx.updateLatestMessageId(raw.id);
  activity.markStale();

  const currentUserId = chatList.currentUserId;
  const isForCurrentChat =
    currentChat.context != null &&
    !currentChat.hasNewerMessages &&
    isMessageForContext(raw, currentChat.context, currentUserId);
  if (isForCurrentChat) {
    currentChat.appendMessage(rawMessageToMockMessage(raw));
  }

  inbox.markStale();

  const isFromSelf = raw.sender_id === currentUserId;
  if (!isFromSelf && !isForCurrentChat) {
    maybeNotifyNewMessage(ctx, raw, currentUserId, isForCurrentChat, isFromSelf);
  }

  const jitsiMeetBaseUrl = useInstancesStore.getState().jitsiMeetBaseUrl;
  const incomingInvite = resolveIncomingDmCallInvite(raw, currentUserId, {
    serverBaseUrl: jitsiMeetBaseUrl,
  });
  if (incomingInvite != null) {
    jitsiCall.ingestIncomingInvite(incomingInvite);
  }
}

export function readViewportState(): { windowFocused: boolean; windowHidden: boolean } {
  if (typeof document === "undefined") {
    return { windowFocused: true, windowHidden: false };
  }
  return {
    windowFocused: document.hasFocus(),
    windowHidden: document.hidden,
  };
}

export function maybeNotifyNewMessage(
  ctx: LayoutZulipEventDispatchContext,
  raw: ZulipRawMessage,
  _currentUserId: number | null,
  isForCurrentChat: boolean,
  isFromSelf: boolean,
): void {
  const { mute, notifications } = ctx;
  let isMuted = false;
  let isTopicFollowed = false;
  if (raw.type === "stream" && raw.stream_id != null) {
    const topic = normalizeTopicForIdentity(raw.subject ?? "");
    isMuted = mute.isEffectivelyMuted(raw.stream_id, topic);
    isTopicFollowed = mute.isTopicFollowed(raw.stream_id, topic);
  }

  const isOnScreenInCurrentChat = isForCurrentChat;
  const serverSettings = useNotificationSettingsStore.getState().settings;
  const localSound = useSettingsStore.getState().notificationSound;
  const resolvedPreset = resolveNotificationSoundPreset(
    serverSettings.notificationSound,
    localSound,
  );

  const decision = shouldDesktopNotify({
    message: {
      type: raw.type ?? "stream",
      flags: raw.flags,
      isTopicFollowed,
    },
    viewport: {
      isFromSelf,
      isOnScreenInCurrentChat,
      isMuted,
      ...readViewportState(),
    },
    settings: serverSettings,
  });

  if (!decision.notify) return;

  registerNotifiedMessageId(raw.id);

  const senderName = raw.sender_full_name ?? "New message";
  const contentPreview = plainTextPreviewFromMessageBody(raw.content ?? "").slice(0, 100);
  const playSound = decision.playSound && resolvedPreset !== "none";

  notifications
    .show({
      title: senderName,
      body: contentPreview,
      tag: `msg-${raw.id}`,
      silent: true,
    })
    .catch(() => {});

  if (playSound) {
    notifications.playSound(resolvedPreset);
  }

  notifications.requestAttentionIfNotFocused();
}

export function handleUpdateMessageFlags(
  event: ZulipEvent,
  ctx: LayoutZulipEventDispatchContext,
): void {
  if (event.type !== "update_message_flags") return;
  const { chatList, currentChat, activity, inbox, notifications } = ctx;
  const op = event.op as LayoutMessageFlagOp;
  const flag = event.flag as string;
  const messageIds = (event.messages ?? []) as number[];
  if (messageIds.length === 0) return;
  activity.markStale();
  if (flag === "starred") {
    activity.markStarredSummaryStale();
  }
  if (flag !== "read") return;
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

export function handleReaction(event: ZulipEvent, ctx: LayoutZulipEventDispatchContext): void {
  if (event.type !== "reaction") return;
  const { currentChat, activity } = ctx;
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
  if (!reaction) return;
  const op = (event.op as LayoutMessageFlagOp) ?? "add";
  currentChat.updateMessageReaction(messageId, reaction, op);
}

export function deleteMessageIdsFromEvent(event: ZulipEvent): number[] {
  if (event.type !== "delete_message") return [];
  if (event.message_ids) return event.message_ids as number[];
  if (event.message_id != null) return [event.message_id as number];
  return [];
}

export function handleDeleteMessage(event: ZulipEvent, ctx: LayoutZulipEventDispatchContext): void {
  if (event.type !== "delete_message") return;
  const { chatList, currentChat, activity } = ctx;
  activity.markStale();
  activity.markStarredSummaryStale();
  const messageIds = deleteMessageIdsFromEvent(event);
  if (messageIds.length === 0) return;
  chatList.handleDeleteMessages(messageIds);
  currentChat.removeMessages(messageIds);
}

export function handleUpdateMessage(event: ZulipEvent, ctx: LayoutZulipEventDispatchContext): void {
  if (event.type !== "update_message") return;
  const { currentChat, chatList, activity } = ctx;
  activity.markStale();
  activity.markStarredSummaryStale();
  const messageId = event.message_id as number | undefined;
  const renderingOnly = event.rendering_only === true;
  const newMarkdown =
    !renderingOnly && typeof event.content === "string" ? event.content : undefined;
  if (messageId == null) return;
  if (newMarkdown != null) {
    const trimmed = newMarkdown.trim();
    currentChat.updateMessageContent(
      messageId,
      newMarkdown,
      trimmed.length > 0 ? newMarkdown : undefined,
    );
  }

  if (renderingOnly && typeof event.rendered_content === "string") {
    const embeds = parseAllMessageEmbedsFromRenderedHtml(event.rendered_content);
    if (embeds.length > 0) {
      const row = useCurrentChatMessagesStore.getState().messages.find((m) => m.id === messageId);
      if (row == null) {
        for (const preview of embeds) {
          enqueuePendingLinkPreview(messageId, preview);
        }
      } else {
        const markdownBody = row.markdown_source ?? row.content;
        const expectedUrls = extractLinkPreviewUrls(markdownBody);
        for (const preview of embeds) {
          const matchesExpected = expectedUrls.some((url) =>
            linkPreviewUrlsMatch(url, preview.targetUrl),
          );
          if (matchesExpected) {
            currentChat.updateMessageLinkPreview(messageId, preview);
          }
        }
      }
    }
  }

  const topicMovePayload = extractTopicMoveFromUpdateEvent(event);
  if (topicMovePayload == null) return;
  chatList.moveStreamTopic(topicMovePayload);
  currentChat.moveStreamTopicMessages(topicMovePayload);
}
