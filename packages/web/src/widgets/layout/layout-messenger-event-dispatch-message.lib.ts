/**
 * Workspace realtime handlers: message, flags, reactions, delete, update.
 */
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { isMessageForContext, useCurrentChatMessagesStore } from "~/entities/message/message.model";
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
  collectLoadedMessageIds,
  parseMessagesReadEvent,
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
import type { LayoutMessengerEventDispatchContext } from "./layout-messenger-event-dispatch.types";

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
  chatList.addMessage(raw);
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

function readMessageEventKind(event: MessengerEvent): string | null {
  return typeof event.kind === "string" ? event.kind : null;
}

function applyBooleanMessageFlagSnapshot(
  ctx: LayoutMessengerEventDispatchContext,
  messageId: MessageId,
  flag: "read" | "pinned" | "starred",
  value: unknown,
): void {
  if (typeof value !== "boolean") return;
  ctx.currentChat.updateMessageFlags([messageId], flag, value ? "add" : "remove");
}

function applyMessageReactionSnapshot(
  ctx: LayoutMessengerEventDispatchContext,
  messageId: MessageId,
  raw: WorkspaceRawMessage,
): void {
  if (raw.reactions == null) return;
  ctx.currentChat.replaceMessageReactions(messageId, raw.reactions);
}

export function handleMessageUpdated(
  event: MessengerEvent,
  ctx: LayoutMessengerEventDispatchContext,
): void {
  if (event.type !== "message" || readMessageEventKind(event) !== "message.updated") return;
  if (!event.message) return;
  const { chatList, currentChat, users, activity, inbox, notifications } = ctx;
  const raw = event.message as unknown as WorkspaceRawMessage;
  const messageId = normalizeMessageId(raw.id);
  if (messageId == null) return;

  ctx.onMessage?.(raw);
  users.mergeFromMessage(raw);
  chatList.addMessage(raw);
  activity.markStale();
  activity.markStarredSummaryStale();
  inbox.markStale();

  const currentUserId = chatList.currentUserId;
  const isForCurrentChat =
    currentChat.context != null && isMessageForContext(raw, currentChat.context, currentUserId);
  if (!isForCurrentChat) {
    return;
  }

  const message = rawMessageToMockMessage(raw);
  currentChat.updateMessageContent(messageId, message.content, message.markdown_source);
  applyBooleanMessageFlagSnapshot(ctx, messageId, "read", raw.read);
  applyBooleanMessageFlagSnapshot(ctx, messageId, "pinned", raw.pinned);
  applyBooleanMessageFlagSnapshot(ctx, messageId, "starred", raw.starred);
  applyMessageReactionSnapshot(ctx, messageId, raw);
  if (raw.read === true) {
    closeReadMessageNotifications(notifications, [messageId], ctx.currentInstanceId);
  }
}

export { readViewportState } from "./layout-messenger-event-viewport.lib";
export { maybeNotifyNewMessage } from "./layout-messenger-event-notify.lib";

export function handleMessagesRead(
  event: MessengerEvent,
  ctx: LayoutMessengerEventDispatchContext,
): void {
  const parsed = parseMessagesReadEvent(event);
  if (parsed == null) return;

  const { currentChat, activity, inbox, notifications } = ctx;
  activity.markStale();
  inbox.markStale();

  logSidebarUnreadFlow("event:messages.read", {
    ...summarizeMessageIdsForFlowDebug(parsed.messageIds),
    openChatContext: currentChat.context,
  });

  closeReadMessageNotifications(notifications, parsed.messageIds, ctx.currentInstanceId);
  currentChat.updateMessageFlags(parsed.messageIds, "read", "add");
}

function applyMarkAllReadFromQueueEvent(
  ctx: LayoutMessengerEventDispatchContext,
  notifications: LayoutMessengerEventDispatchContext["notifications"],
): void {
  const { currentChat } = ctx;
  const chatListStore = useChatListStore.getState();

  const loadedIds = collectLoadedMessageIds(useCurrentChatMessagesStore.getState().messages);
  if (loadedIds.length > 0) {
    currentChat.updateMessageFlags(loadedIds, "read", "add");
  }

  const indexedIds = [...chatListStore.messageIdToLocation.keys()];
  closeAllActiveMessageNotifications(notifications, ctx.currentInstanceId);

  logSidebarUnreadFlow("event:update_message_flags:read:markAll", {
    markAllRead: true,
    loadedCount: loadedIds.length,
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
    inbox.clearEntries();
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
    inbox.markStale();
    closeReadMessageNotifications(notifications, messageIds, ctx.currentInstanceId);
    currentChat.updateMessageFlags(messageIds, "read", "add");
    return;
  }

  inbox.markStale();

  logSidebarUnreadFlow("event:update_message_flags:read:remove", {
    ...summarizeMessageIdsForFlowDebug(messageIds),
  });
  currentChat.updateMessageFlags(messageIds, "read", "remove");
}

export function deleteMessageIdsFromEvent(event: MessengerEvent): MessageId[] {
  if (event.type !== "delete_message" && readMessageEventKind(event) !== "message.deleted") {
    return [];
  }
  if (Array.isArray(event.message_ids)) {
    return event.message_ids.map(normalizeMessageId).filter((id) => id != null);
  }
  const messageId = normalizeMessageId(event.message_id);
  if (messageId != null) return [messageId];
  if (event.message != null && typeof event.message === "object") {
    const row = event.message as { id?: unknown; uuid?: unknown };
    const nestedMessageId = normalizeMessageId(row.id) ?? normalizeMessageId(row.uuid);
    if (nestedMessageId != null) return [nestedMessageId];
  }
  return [];
}

export function handleDeleteMessage(
  event: MessengerEvent,
  ctx: LayoutMessengerEventDispatchContext,
): void {
  if (event.type !== "delete_message" && readMessageEventKind(event) !== "message.deleted") return;
  const { chatList, currentChat, activity, inbox, notifications } = ctx;
  activity.markStale();
  activity.markStarredSummaryStale();
  const messageIds = deleteMessageIdsFromEvent(event);
  if (messageIds.length === 0) return;
  chatList.handleDeleteMessages(messageIds);
  currentChat.removeMessages(messageIds);
  inbox.markStale();
  closeReadMessageNotifications(notifications, messageIds, ctx.currentInstanceId);
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
