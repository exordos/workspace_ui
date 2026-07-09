import { t } from "~/i18n/i18n";

export type NotificationTitleContext =
  | {
      kind: "stream";
      senderName: string;
      channelName: string;
      topicName: string | null;
    }
  | {
      kind: "dm";
      senderName: string;
      conversationName: string;
    };

export function formatNotificationTitle(
  context: NotificationTitleContext,
  messageCount = 1,
): string {
  if (context.kind === "dm") {
    if (messageCount <= 1) {
      return context.senderName;
    }
    return `${t("notifications.messageCount", { count: messageCount })} · ${context.conversationName}`;
  }

  const base =
    context.topicName != null
      ? `${context.channelName} · ${context.topicName}`
      : context.channelName;

  if (messageCount <= 1) {
    return `${context.senderName} · ${base}`;
  }

  return `${t("notifications.messagesFromSender", {
    count: messageCount,
    sender: context.senderName,
  })} · ${base}`;
}
