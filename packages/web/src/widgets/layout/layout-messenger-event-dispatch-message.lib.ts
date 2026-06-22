/**
 * Workspace realtime handlers: message, flags, reactions, delete, update.
 */
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { isMessageForContext, useCurrentChatMessagesStore } from "~/entities/message/message.model";
import { syncUnreadSurfacesFromEventDelta } from "~/entities/unread-sync/unread-surfaces-sync.lib";
import { resolveIncomingDmCallInvite } from "~/features/jitsi-call/jitsi-call-invite.lib";
import { getCurrentInstance } from "~/shared/api/client";
import { rawMessageToMockMessage } from "~/shared/api/messenger-messages";
import type { MessengerEvent, WorkspaceRawMessage } from "~/shared/api/messenger.types";
import { isMessageFromCurrentUser } from "~/shared/lib/message-author.lib";
import { normalizeMessageId } from "~/shared/lib/message-id.lib";
import type { MessageId } from "~/shared/lib/message-id.lib";
import {
  applyMessengerEventToMessageIndexedDb,
  isChatMessagesPersistToIndexedDbEnabled,
} from "~/shared/lib/message-idb-from-messenger.lib";
import {
  logSidebarUnreadFlow,
  summarizeMessageIdsForFlowDebug,
} from "~/shared/lib/sidebar-unread-debug.lib";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";
import { maybeNotifyNewMessage } from "./layout-messenger-event-notify.lib";
import {
  collectUnreadLoadedMessageIds,
  parseUpdateMessageFlagsEvent,
} from "./layout-messenger-event-read-flags.lib";
import {
  applyRenderingOnlyLinkPreviews,
  applyTopicMoveFromUpdateMessage,
  applyUpdateMessageContent,
} from "./layout-messenger-event-update-message.lib";
import {
  closeAllActiveMessageNotifications,
  closeReadMessageNotifications,
} from "./layout-notification-tags.lib";
import type {
  LayoutMessageFlagOp,
  LayoutMessengerEventDispatchContext,
} from "./layout-messenger-event-dispatch.types";

export function applyMessageCacheIndexedDb(
  event: MessengerEvent,
  ctx: LayoutMessengerEventDispatchContext,
): void {
  const instance = getCurrentInstance();
  if (!instance?.id || !isChatMessagesPersistToIndexedDbEnabled()) return;
  void applyMessengerEventToMessageIndexedDb({
    instanceId: instance.id,
    currentUserId: ctx.chatList.currentUserId,
    event,
  }).catch((err) => {
    reportUnexpectedError("message-idb", err, { eventType: event.type });
  });
}

// ---
// Per-event-type handlers keep `dispatchMessengerEvent` cognitive complexity low.
// ---

export function handleIncomingMessage(
  event: MessengerEvent,
  ctx: LayoutMessengerEventDispatchContext,
): void {
  if (event.type !== "message" || !event.message) return;
  const { chatList, currentChat, users, activity, inbox, jitsiCall } = ctx;
  const raw = event.message as unknown as WorkspaceRawMessage;
  ctx.onMessage?.(raw);
  users.mergeFromMessage(raw);
  const currentUserId = chatList.currentUserId;
  const isForCurrentChat =
    currentChat.context != null &&
    !currentChat.hasNewerMessages &&
    isMessageForContext(raw, currentChat.context, currentUserId);
  syncUnreadSurfacesFromEventDelta({
    source: "event-message",
    instanceId: ctx.currentInstanceId,
    isStreamMuted: ctx.mute.isStreamMuted,
    isEffectivelyMuted: ctx.mute.isEffectivelyMuted,
    applyDelta: () => {
      chatList.addMessage(raw);
    },
  });
  // Fallback when channel rename arrives via message display_recipient instead of a stream event.
  if (
    raw.type === "stream" &&
    typeof raw.stream_uuid === "string" &&
    raw.stream_uuid.trim().length > 0 &&
    typeof raw.display_recipient === "string" &&
    raw.display_recipient.trim().length > 0
  ) {
    chatList.renameStream(raw.stream_uuid, raw.display_recipient);
  }
  ctx.updateLatestMessageId(raw.id);
  activity.markStale();

  if (isForCurrentChat) {
    currentChat.appendMessage(rawMessageToMockMessage(raw));
  }

  inbox.markStale();

  const isFromSelf = isMessageFromCurrentUser(raw, currentUserId);
  if (!isFromSelf) {
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

export { readViewportState } from "./layout-messenger-event-viewport.lib";
export { maybeNotifyNewMessage } from "./layout-messenger-event-notify.lib";

function applyMarkAllReadFromQueueEvent(
  ctx: LayoutMessengerEventDispatchContext,
  notifications: LayoutMessengerEventDispatchContext["notifications"],
): void {
  const { currentChat } = ctx;
  const chatListStore = useChatListStore.getState();

  const unreadLoadedIds = collectUnreadLoadedMessageIds(
    useCurrentChatMessagesStore.getState().messages,
  );
  if (unreadLoadedIds.length > 0) {
    currentChat.updateMessageFlags(unreadLoadedIds, "read", "add");
  }

  const indexedIds = [...chatListStore.messageIdToLocation.keys()];
  closeAllActiveMessageNotifications(notifications, ctx.currentInstanceId);

  logSidebarUnreadFlow("event:update_message_flags:read:markAll", {
    markAllRead: true,
    unreadLoadedCount: unreadLoadedIds.length,
    indexedNotificationCount: indexedIds.length,
    openChatContext: currentChat.context,
    totalsAfter: {
      sidebarStreamsUnread: useChatListStore.getState().sidebarStreamsUnread,
      sidebarDmsUnread: useChatListStore.getState().sidebarDmsUnread,
    },
  });
}

export function handleUpdateMessageFlags(
  event: MessengerEvent,
  ctx: LayoutMessengerEventDispatchContext,
): void {
  const parsed = parseUpdateMessageFlagsEvent(event);
  if (parsed == null) return;

  const { currentChat, activity, inbox, notifications } = ctx;
  const { op, flag, messageIds, markAllRead } = parsed;

  activity.markStale();
  if (flag === "starred") {
    if (messageIds.length > 0) {
      activity.applyStarredSummaryFlagEvent(op, messageIds);
    } else {
      activity.markStarredSummaryStale();
    }
  }
  if (flag !== "read") return;

  if (markAllRead) {
    syncUnreadSurfacesFromEventDelta({
      source: "event-mark-all-read",
      instanceId: ctx.currentInstanceId,
      isStreamMuted: ctx.mute.isStreamMuted,
      isEffectivelyMuted: ctx.mute.isEffectivelyMuted,
      applyDelta: () => {
        inbox.clearEntries();
        applyMarkAllReadFromQueueEvent(ctx, notifications);
      },
    });
    return;
  }

  if (messageIds.length === 0) return;

  logSidebarUnreadFlow("event:update_message_flags:read", {
    op,
    ...summarizeMessageIdsForFlowDebug(messageIds),
    openChatContext: currentChat.context,
  });

  if (op === "add") {
    syncUnreadSurfacesFromEventDelta({
      source: "event-read-add",
      instanceId: ctx.currentInstanceId,
      isStreamMuted: ctx.mute.isStreamMuted,
      isEffectivelyMuted: ctx.mute.isEffectivelyMuted,
      applyDelta: () => {
        inbox.markAsRead(messageIds);
        closeReadMessageNotifications(notifications, messageIds, ctx.currentInstanceId);
        currentChat.updateMessageFlags(messageIds, "read", "add");
      },
    });
    return;
  }

  syncUnreadSurfacesFromEventDelta({
    source: "event-read-remove",
    instanceId: ctx.currentInstanceId,
    isStreamMuted: ctx.mute.isStreamMuted,
    isEffectivelyMuted: ctx.mute.isEffectivelyMuted,
    applyDelta: () => {
      inbox.markStale();

      logSidebarUnreadFlow("event:update_message_flags:read:remove", {
        ...summarizeMessageIdsForFlowDebug(messageIds),
      });
      currentChat.updateMessageFlags(messageIds, "read", "remove");
    },
  });
}

export function handleReaction(
  event: MessengerEvent,
  ctx: LayoutMessengerEventDispatchContext,
): void {
  if (event.type !== "reaction") return;
  const { currentChat, activity } = ctx;
  activity.markStale();
  const messageId = normalizeMessageId(event.message_id);
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
  if (messageId == null) return;
  const op = (event.op as LayoutMessageFlagOp) ?? "add";
  currentChat.updateMessageReaction(messageId, reaction, op);
}

export function deleteMessageIdsFromEvent(event: MessengerEvent): MessageId[] {
  if (event.type !== "delete_message") return [];
  if (Array.isArray(event.message_ids)) {
    return event.message_ids.map(normalizeMessageId).filter((id) => id != null);
  }
  const messageId = normalizeMessageId(event.message_id);
  if (messageId != null) return [messageId];
  return [];
}

export function handleDeleteMessage(
  event: MessengerEvent,
  ctx: LayoutMessengerEventDispatchContext,
): void {
  if (event.type !== "delete_message") return;
  const { chatList, currentChat, activity } = ctx;
  activity.markStale();
  activity.markStarredSummaryStale();
  const messageIds = deleteMessageIdsFromEvent(event);
  if (messageIds.length === 0) return;
  chatList.handleDeleteMessages(messageIds);
  currentChat.removeMessages(messageIds);
}

export function handleUpdateMessage(
  event: MessengerEvent,
  ctx: LayoutMessengerEventDispatchContext,
): void {
  if (event.type !== "update_message") return;
  const { activity } = ctx;
  activity.markStale();
  activity.markStarredSummaryStale();
  if (event.message_id == null) return;
  applyUpdateMessageContent(event, ctx);
  applyRenderingOnlyLinkPreviews(event, ctx);
  applyTopicMoveFromUpdateMessage(event, ctx);
}
