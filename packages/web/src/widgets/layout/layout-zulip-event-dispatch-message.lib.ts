/**
 * Zulip realtime handlers: message, flags, reactions, delete, update.
 */
import { useInstancesStore } from "~/entities/instance/instance.model";
import { isMessageForContext } from "~/entities/message/message.model";
import { resolveIncomingDmCallInvite } from "~/features/jitsi-call/jitsi-call-invite.lib";
import { getCurrentInstance } from "~/shared/api/client";
import type { ZulipEvent, ZulipRawMessage } from "~/shared/api/zulip";
import { rawMessageToMockMessage } from "~/shared/api/zulip";
import {
  applyZulipEventToMessageIndexedDb,
  isChatMessagesPersistToIndexedDbEnabled,
} from "~/shared/lib/message-idb-from-zulip.lib";
import { closeReadMessageNotifications } from "./layout-notification-tags.lib";
import { maybeNotifyNewMessage } from "./layout-zulip-event-notify.lib";
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

export { readViewportState } from "./layout-zulip-event-viewport.lib";
export { maybeNotifyNewMessage } from "./layout-zulip-event-notify.lib";

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
  const { activity } = ctx;
  activity.markStale();
  activity.markStarredSummaryStale();
  if (event.message_id == null) return;
  applyUpdateMessageContent(event, ctx);
  applyRenderingOnlyLinkPreviews(event, ctx);
  applyTopicMoveFromUpdateMessage(event, ctx);
}
