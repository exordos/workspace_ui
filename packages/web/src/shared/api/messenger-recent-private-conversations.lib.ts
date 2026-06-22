/**
 * Parses `recent_private_conversations` arrays from backend metadata snapshots.
 */
import { normalizeMessageId } from "~/shared/lib/message-id.lib";
import type { MessengerRecentPrivateConversation } from "./messenger.types";

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function parseRecentPrivateConversationEntry(
  record: Record<string, unknown>,
): MessengerRecentPrivateConversation | null {
  if (!Array.isArray(record.user_ids)) {
    return null;
  }
  const userIds = record.user_ids.filter(isPositiveInteger);
  if (userIds.length === 0) {
    return null;
  }
  const unreadMessageIds = Array.isArray(record.unread_message_ids)
    ? record.unread_message_ids.flatMap((id) => {
        const normalized = normalizeMessageId(id);
        return normalized == null ? [] : [normalized];
      })
    : [];
  const maxMessageId = normalizeMessageId(record.max_message_id);
  return {
    user_ids: Array.from(new Set(userIds)).sort((left, right) => left - right),
    max_message_id: maxMessageId,
    unread_message_ids: unreadMessageIds,
  };
}

function conversationKeyForUserIds(userIds: readonly number[]): string {
  return Array.from(new Set(userIds))
    .sort((left, right) => left - right)
    .join(",");
}

/** Normalizes `recent_private_conversations` array for the app. */
export function parseRecentPrivateConversations(
  data: unknown,
): Record<string, MessengerRecentPrivateConversation> | null {
  if (data == null) {
    return null;
  }
  if (!Array.isArray(data)) {
    return null;
  }
  const parsed: Record<string, MessengerRecentPrivateConversation> = {};
  for (const item of data) {
    if (item == null || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const entry = parseRecentPrivateConversationEntry(item as Record<string, unknown>);
    if (entry == null) {
      continue;
    }
    const key = conversationKeyForUserIds(entry.user_ids);
    parsed[key] = entry;
  }
  return parsed;
}
