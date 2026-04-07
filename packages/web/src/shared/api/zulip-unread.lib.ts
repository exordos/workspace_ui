function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function toSafeCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.trunc(value));
}

function sumUnreadMessageIds(entries: unknown): number {
  if (!Array.isArray(entries)) {
    return 0;
  }
  return entries.reduce((sum, entry) => {
    if (!isRecord(entry)) return sum;
    const unreadIds = entry.unread_message_ids;
    if (!Array.isArray(unreadIds)) return sum;
    return sum + unreadIds.length;
  }, 0);
}

/**
 * Parses GET /users/me/unread_messages response and returns total unread count.
 * Returns null when payload shape does not match expected unread response.
 */
export function parseUnreadMessagesCount(payload: unknown): number | null {
  if (!isRecord(payload)) {
    return null;
  }

  const unreadMsgs = payload.unread_msgs;
  if (!isRecord(unreadMsgs)) {
    return null;
  }

  const directCount = toSafeCount(unreadMsgs.count);
  if (directCount > 0) {
    return directCount;
  }

  const streamCount = sumUnreadMessageIds(unreadMsgs.streams);
  const dmCount = sumUnreadMessageIds(unreadMsgs.pms);
  const huddleCount = sumUnreadMessageIds(unreadMsgs.huddles);
  const mentionCount = sumUnreadMessageIds(unreadMsgs.mentions);

  return streamCount + dmCount + huddleCount + mentionCount;
}
