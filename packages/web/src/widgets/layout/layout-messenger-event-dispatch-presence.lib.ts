/**
 * Workspace realtime handlers: typing and user settings.
 */
import { useNotificationSettingsStore } from "~/entities/notification-settings/notification-settings.model";
import { resolveTypingEventRoute } from "~/features/typing-indicator/typing-event-routing";
import type { MessengerEvent } from "~/shared/api/messenger.types";
import type { LayoutMessengerEventDispatchContext } from "./layout-messenger-event-dispatch.types";

export function handleUserSettings(event: MessengerEvent): void {
  if (event.type !== "user_settings") return;
  const property =
    (typeof event.property === "string" && event.property) ||
    (typeof event.setting_name === "string" && event.setting_name) ||
    null;
  if (property == null) return;
  const value = "value" in event ? event.value : event.setting;
  useNotificationSettingsStore.getState().patchSetting(property, value);
}
export function handleTyping(
  event: MessengerEvent,
  ctx: LayoutMessengerEventDispatchContext,
): void {
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
    streamId: event.stream_uuid as string | undefined,
    topic: event.topic as string | undefined,
    currentUserId,
  });
  if (route) {
    typing.setTyping(route.chatKey, route.userId, route.isTyping);
  }
}
