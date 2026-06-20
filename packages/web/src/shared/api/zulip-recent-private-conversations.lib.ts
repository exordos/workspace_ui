/**
 * Parses `recent_private_conversations` from POST /register.
 *
 * Zulip returns an array of conversation objects; older fixtures may use a string-keyed map.
 */
import type { ZulipRecentPrivateConversation } from "./zulip.types";

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function parseRecentPrivateConversationEntry(
  record: Record<string, unknown>,
): ZulipRecentPrivateConversation | null {
  if (!Array.isArray(record.user_ids)) {
    return null;
  }
  const userIds = record.user_ids.filter(isPositiveInteger);
  if (userIds.length === 0) {
    return null;
  }
  const unreadMessageIds = Array.isArray(record.unread_message_ids)
    ? record.unread_message_ids.filter(isPositiveInteger)
    : [];
  const maxMessageId = isPositiveInteger(record.max_message_id) ? record.max_message_id : null;
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

function parseRecentPrivateConversationsFromArray(
  data: unknown[],
): Record<string, ZulipRecentPrivateConversation> {
  const parsed: Record<string, ZulipRecentPrivateConversation> = {};
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

function parseRecentPrivateConversationsFromMap(
  data: Record<string, unknown>,
): Record<string, ZulipRecentPrivateConversation> {
  const parsed: Record<string, ZulipRecentPrivateConversation> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
      continue;
    }
    const entry = parseRecentPrivateConversationEntry(value as Record<string, unknown>);
    if (entry == null) {
      continue;
    }
    parsed[key] = entry;
  }
  return parsed;
}

/** Normalizes register `recent_private_conversations` (array or legacy map) for the app. */
export function parseRecentPrivateConversations(
  data: unknown,
): Record<string, ZulipRecentPrivateConversation> | null {
  if (data == null) {
    return null;
  }
  if (Array.isArray(data)) {
    return parseRecentPrivateConversationsFromArray(data);
  }
  if (typeof data === "object") {
    return parseRecentPrivateConversationsFromMap(data as Record<string, unknown>);
  }
  return null;
}
