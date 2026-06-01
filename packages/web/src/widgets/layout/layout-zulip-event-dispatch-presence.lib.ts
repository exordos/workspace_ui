/**
 * Zulip realtime handlers: presence, user status, typing, user settings.
 */
import { useNotificationSettingsStore } from "~/entities/notification-settings/notification-settings.model";
import { resolveTypingEventRoute } from "~/features/typing-indicator/typing-event-routing";
import type { ZulipEvent } from "~/shared/api/zulip.types";
import type { LayoutZulipEventDispatchContext } from "./layout-zulip-event-dispatch.types";

export function handleUserSettings(event: ZulipEvent): void {
  if (event.type !== "user_settings") return;
  const property =
    (typeof event.property === "string" && event.property) ||
    (typeof event.setting_name === "string" && event.setting_name) ||
    null;
  if (property == null) return;
  const value = "value" in event ? event.value : event.setting;
  useNotificationSettingsStore.getState().patchSetting(property, value);
}
export function handlePresence(event: ZulipEvent, ctx: LayoutZulipEventDispatchContext): void {
  if (event.type !== "presence") return;
  const { users } = ctx;
  const email = event.email as string | undefined;
  const presenceData = event.presence as
    | Record<string, { status?: string; timestamp?: number }>
    | undefined;
  if (!email || !presenceData) return;
  const agg = presenceData.aggregated ?? presenceData.website;
  if (agg?.status == null || agg?.timestamp == null) return;
  users.setPresenceByEmail(email, {
    status: agg.status === "idle" ? "idle" : "active",
    timestamp: agg.timestamp,
  });
}

export function handleUserStatus(event: ZulipEvent, ctx: LayoutZulipEventDispatchContext): void {
  if (event.type !== "user_status") return;
  const { users } = ctx;
  const userId = event.user_id as number | undefined;
  if (userId == null) return;
  const statusText = typeof event.status_text === "string" ? event.status_text.trim() : "";
  const emojiName = typeof event.emoji_name === "string" ? event.emoji_name.trim() : "";
  const emojiCode = typeof event.emoji_code === "string" ? event.emoji_code.trim() : "";
  const reactionTypeRaw = typeof event.reaction_type === "string" ? event.reaction_type : undefined;
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
export function handleTyping(event: ZulipEvent, ctx: LayoutZulipEventDispatchContext): void {
  if (event.type !== "typing") return;
  const { typing, chatList } = ctx;
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
}
