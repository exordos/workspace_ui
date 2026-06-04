/**
 * Unread @mention tracking for sidebar badge and personal indicator.
 */
import type { MockMessage, ZulipRawMessage } from "~/shared/api/zulip.types";

export type MentionFlagMessage = Pick<ZulipRawMessage, "id" | "sender_id" | "flags">;

export function isUnreadMentionFromOthers(
  m: MentionFlagMessage,
  currentUserId: number | null,
): boolean {
  if (currentUserId != null && m.sender_id === currentUserId) return false;
  const flags = m.flags ?? [];
  return flags.includes("mentioned") && !flags.includes("read");
}

export function collectUnreadMentionIdsFromMessages(
  messages: readonly MentionFlagMessage[],
  currentUserId: number | null,
): number[] {
  const ids: number[] = [];
  for (const message of messages) {
    if (!isUnreadMentionFromOthers(message, currentUserId)) continue;
    ids.push(message.id);
  }
  return ids;
}

export function buildMentionUnreadSetFromIds(messageIds: readonly number[]): Set<number> {
  return new Set(messageIds);
}

export function tryIncrementMentionUnread(
  mentionedUnreadMessageIds: ReadonlySet<number>,
  message: MentionFlagMessage,
  currentUserId: number | null,
): { mentionedUnreadMessageIds: Set<number>; mentionsUnreadCount: number } | null {
  if (!isUnreadMentionFromOthers(message, currentUserId)) return null;
  if (mentionedUnreadMessageIds.has(message.id)) return null;
  const next = new Set(mentionedUnreadMessageIds);
  next.add(message.id);
  return { mentionedUnreadMessageIds: next, mentionsUnreadCount: next.size };
}

export function decrementMentionUnreadForMessageIds(
  mentionedUnreadMessageIds: ReadonlySet<number>,
  messageIds: readonly number[],
): { mentionedUnreadMessageIds: Set<number>; mentionsUnreadCount: number } {
  if (messageIds.length === 0) {
    return {
      mentionedUnreadMessageIds: new Set(mentionedUnreadMessageIds),
      mentionsUnreadCount: mentionedUnreadMessageIds.size,
    };
  }
  const next = new Set(mentionedUnreadMessageIds);
  for (const id of messageIds) {
    next.delete(id);
  }
  return { mentionedUnreadMessageIds: next, mentionsUnreadCount: next.size };
}

export function incrementMentionUnreadFromBatch(
  mentionedUnreadMessageIds: ReadonlySet<number>,
  messages: readonly MentionFlagMessage[],
  currentUserId: number | null,
): { mentionedUnreadMessageIds: Set<number>; mentionsUnreadCount: number } | null {
  let next: Set<number> | null = null;
  for (const message of messages) {
    if (isUnreadMentionFromOthers(message, currentUserId)) {
      if (next === null) {
        if (mentionedUnreadMessageIds.has(message.id)) continue;
        next = new Set(mentionedUnreadMessageIds);
      } else if (next.has(message.id)) {
        continue;
      }
      next.add(message.id);
    }
  }
  if (next === null) return null;
  return { mentionedUnreadMessageIds: next, mentionsUnreadCount: next.size };
}

export function mergeMentionUnreadPatch<T extends { mentionedUnreadMessageIds: Set<number> }>(
  state: T,
  message: MentionFlagMessage,
  currentUserId: number | null,
  patch: Partial<T & { mentionsUnreadCount: number }>,
): Partial<T & { mentionsUnreadCount: number }> {
  const increment = tryIncrementMentionUnread(
    state.mentionedUnreadMessageIds,
    message,
    currentUserId,
  );
  if (increment == null) return patch;
  return { ...patch, ...increment };
}

/** Maps API page messages (MockMessage) to mention ids for authoritative reconcile. */
export function collectUnreadMentionIdsFromMockMessages(
  messages: readonly MockMessage[],
  currentUserId: number | null,
): number[] {
  return collectUnreadMentionIdsFromMessages(messages, currentUserId);
}
