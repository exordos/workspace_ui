/**
 * Zulip realtime handlers: message, flags, reactions, delete, update.
 */
import { applyChatListReadDecrementGrouped } from "~/entities/chat-list/chat-list-apply-read-decrement.lib";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { isMessageForContext, useCurrentChatMessagesStore } from "~/entities/message/message.model";
import { resolveIncomingDmCallInvite } from "~/features/jitsi-call/jitsi-call-invite.lib";
import { getCurrentInstance } from "~/shared/api/client";
import { rawMessageToMockMessage } from "~/shared/api/zulip-messages";
import type { ZulipEvent, ZulipRawMessage } from "~/shared/api/zulip.types";
import {
  applyZulipEventToMessageIndexedDb,
  isChatMessagesPersistToIndexedDbEnabled,
} from "~/shared/lib/message-idb-from-zulip.lib";
import {
  logSidebarUnreadFlow,
  summarizeMessageIdsForFlowDebug,
} from "~/shared/lib/sidebar-unread-debug.lib";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";
import { isTabVisible } from "~/shared/lib/visibility";
import { closeReadMessageNotifications } from "./layout-notification-tags.lib";
import { maybeNotifyNewMessage } from "./layout-zulip-event-notify.lib";
import {
  collectUnreadLoadedMessageIds,
  EMPTY_MARK_ALL_READ_SNAPSHOT,
  parseUpdateMessageFlagsEvent,
  zulipRawMessagesFromMarkUnreadDetails,
  type ZulipMarkUnreadMessageDetail,
} from "./layout-zulip-event-read-flags.lib";
import {
  applyRenderingOnlyLinkPreviews,
  applyTopicMoveFromUpdateMessage,
  applyUpdateMessageContent,
} from "./layout-zulip-event-update-message.lib";
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
  }).catch((err) => {
    reportUnexpectedError("message-idb", err, { eventType: event.type });
  });
}

// ---
// Per-event-type handlers keep `dispatchZulipEvent` cognitive complexity low.
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
  const currentUserId = chatList.currentUserId;
  const isForCurrentChat =
    currentChat.context != null &&
    !currentChat.hasNewerMessages &&
    isMessageForContext(raw, currentChat.context, currentUserId);
  const suppressUnreadBump = isForCurrentChat && isTabVisible();
  chatList.addMessage(raw, { suppressUnreadBump });
  // Fallback when channel rename arrives via message display_recipient instead of a stream event.
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

  if (isForCurrentChat) {
    currentChat.appendMessage(rawMessageToMockMessage(raw));
  }

  inbox.markStale();

  const isFromSelf = raw.sender_id === currentUserId;
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

export { readViewportState } from "./layout-zulip-event-viewport.lib";
export { maybeNotifyNewMessage } from "./layout-zulip-event-notify.lib";

function applyMarkAllReadFromQueueEvent(
  ctx: LayoutZulipEventDispatchContext,
  notifications: LayoutZulipEventDispatchContext["notifications"],
): void {
  const { currentChat } = ctx;
  const chatListStore = useChatListStore.getState();
  chatListStore.reconcileUnreadFromSnapshot(
    EMPTY_MARK_ALL_READ_SNAPSHOT,
    chatListStore.currentUserId,
  );

  const unreadLoadedIds = collectUnreadLoadedMessageIds(
    useCurrentChatMessagesStore.getState().messages,
  );
  if (unreadLoadedIds.length > 0) {
    currentChat.updateMessageFlags(unreadLoadedIds, "read", "add");
  }

  const indexedIds = [...chatListStore.messageIdToLocation.keys()];
  closeReadMessageNotifications(notifications.closeByTag, indexedIds);

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
  event: ZulipEvent,
  ctx: LayoutZulipEventDispatchContext,
): void {
  const parsed = parseUpdateMessageFlagsEvent(event);
  if (parsed == null) return;

  const { chatList, currentChat, activity, inbox, notifications } = ctx;
  const { op, flag, messageIds, markAllRead } = parsed;

  activity.markStale();
  if (flag === "starred") {
    activity.markStarredSummaryStale();
  }
  if (flag !== "read") return;

  inbox.markStale();

  if (markAllRead) {
    applyMarkAllReadFromQueueEvent(ctx, notifications);
    return;
  }

  if (messageIds.length === 0) return;

  logSidebarUnreadFlow("event:update_message_flags:read", {
    op,
    ...summarizeMessageIdsForFlowDebug(messageIds),
    openChatContext: currentChat.context,
  });

  if (op === "add") {
    closeReadMessageNotifications(notifications.closeByTag, messageIds);
    const chatListStore = useChatListStore.getState();
    applyChatListReadDecrementGrouped(() => useChatListStore.getState(), chatListStore, {
      messageIds,
      source: "event:update_message_flags:read:add",
    });
    currentChat.updateMessageFlags(messageIds, "read", "add");
    return;
  }

  const messageDetails = event.message_details as
    | Record<string, ZulipMarkUnreadMessageDetail>
    | undefined;
  const locationRows = zulipRawMessagesFromMarkUnreadDetails(
    messageIds,
    messageDetails,
    chatList.currentUserId,
  );
  if (locationRows.length > 0) {
    useChatListStore.getState().upsertUnreadMessageLocations(locationRows);
  }

  logSidebarUnreadFlow("event:update_message_flags:read:remove", {
    ...summarizeMessageIdsForFlowDebug(messageIds),
  });
  chatList.incrementUnreadForMessages(messageIds);
  currentChat.updateMessageFlags(messageIds, "read", "remove");
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
  const { activity } = ctx;
  activity.markStale();
  activity.markStarredSummaryStale();
  if (event.message_id == null) return;
  applyUpdateMessageContent(event, ctx);
  applyRenderingOnlyLinkPreviews(event, ctx);
  applyTopicMoveFromUpdateMessage(event, ctx);
}
