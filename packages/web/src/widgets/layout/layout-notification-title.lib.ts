import { t } from "~/i18n/i18n";
import type { ZulipRawMessage } from "~/shared/api/zulip.types";

const DEFAULT_NOTIFICATION_SENDER = "New message";

export type NotificationTitleMessage = Pick<
  ZulipRawMessage,
  "display_recipient" | "sender_full_name" | "sender_id" | "stream_id" | "subject" | "type"
> & {
  channel?: string;
};

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

function trimNonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveNotificationSenderName(senderName: string | undefined): string {
  return trimNonEmpty(senderName) ?? DEFAULT_NOTIFICATION_SENDER;
}

function resolveNotificationChannelName(message: NotificationTitleMessage): string | null {
  const directChannel = trimNonEmpty(message.channel);
  if (directChannel != null) {
    return directChannel;
  }

  if (typeof message.display_recipient === "string") {
    return trimNonEmpty(message.display_recipient);
  }

  return null;
}

function resolveDmConversationName(
  message: NotificationTitleMessage,
  currentUserId: number | null,
  senderName: string,
): string {
  if (!Array.isArray(message.display_recipient) || message.display_recipient.length === 0) {
    return senderName;
  }

  const recipients = [...message.display_recipient].sort((left, right) => left.id - right.id);
  const currentUserFiltered =
    currentUserId != null ? recipients.filter((recipient) => recipient.id !== currentUserId) : null;
  const oneToOneFallback =
    currentUserFiltered == null && recipients.length === 2
      ? recipients.filter((recipient) => recipient.id !== message.sender_id)
      : null;
  const targets =
    currentUserFiltered != null && currentUserFiltered.length > 0
      ? currentUserFiltered
      : oneToOneFallback != null && oneToOneFallback.length > 0
        ? oneToOneFallback
        : recipients;

  const names = targets
    .map((recipient) => trimNonEmpty(recipient.full_name))
    .filter((name): name is string => name != null);

  return names.length > 0 ? names.join(", ") : senderName;
}

export function buildNotificationTitleContextFromMessage(
  message: NotificationTitleMessage,
  currentUserId: number | null,
): NotificationTitleContext {
  const senderName = resolveNotificationSenderName(message.sender_full_name);
  const isStreamMessage = message.type === "stream" || message.stream_id != null;
  if (!isStreamMessage) {
    return {
      kind: "dm",
      senderName,
      conversationName: resolveDmConversationName(message, currentUserId, senderName),
    };
  }

  const channelName = resolveNotificationChannelName(message);
  if (channelName == null) {
    return {
      kind: "dm",
      senderName,
      conversationName: senderName,
    };
  }

  return {
    kind: "stream",
    senderName,
    channelName,
    topicName: trimNonEmpty(message.subject),
  };
}

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
