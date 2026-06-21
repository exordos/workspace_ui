/**
 * Unread @mention tracking for sidebar badge and personal indicator.
 */
import type { MockMessage, WorkspaceRawMessage } from "~/shared/api/messenger.types";
import type { MessageId } from "~/shared/lib/message-id.lib";
import { numericUserIdOrNull, type UserId } from "~/shared/lib/user-id.lib";

export type MentionFlagMessage = Pick<WorkspaceRawMessage, "id" | "sender_id" | "flags">;

export function isUnreadMentionFromOthers(
  m: MentionFlagMessage,
  currentUserId: UserId | null,
): boolean {
  const numericCurrentUserId = numericUserIdOrNull(currentUserId);
  if (numericCurrentUserId != null && m.sender_id === numericCurrentUserId) return false;
  const flags = m.flags ?? [];
  return flags.includes("mentioned") && !flags.includes("read");
}

export function collectUnreadMentionIdsFromMessages(
  messages: readonly MentionFlagMessage[],
  currentUserId: UserId | null,
): MessageId[] {
  const ids: MessageId[] = [];
  for (const message of messages) {
    if (!isUnreadMentionFromOthers(message, currentUserId)) continue;
    ids.push(message.id);
  }
  return ids;
}

export function buildMentionUnreadSetFromIds(messageIds: readonly MessageId[]): Set<MessageId> {
  return new Set(messageIds);
}

export function tryIncrementMentionUnread(
  mentionedUnreadMessageIds: ReadonlySet<MessageId>,
  message: MentionFlagMessage,
  currentUserId: UserId | null,
): { mentionedUnreadMessageIds: Set<MessageId>; mentionsUnreadCount: number } | null {
  if (!isUnreadMentionFromOthers(message, currentUserId)) return null;
  if (mentionedUnreadMessageIds.has(message.id)) return null;
  const next = new Set(mentionedUnreadMessageIds);
  next.add(message.id);
  return { mentionedUnreadMessageIds: next, mentionsUnreadCount: next.size };
}

export function decrementMentionUnreadForMessageIds(
  mentionedUnreadMessageIds: ReadonlySet<MessageId>,
  messageIds: readonly MessageId[],
): { mentionedUnreadMessageIds: Set<MessageId>; mentionsUnreadCount: number } {
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
  mentionedUnreadMessageIds: ReadonlySet<MessageId>,
  messages: readonly MentionFlagMessage[],
  currentUserId: UserId | null,
): { mentionedUnreadMessageIds: Set<MessageId>; mentionsUnreadCount: number } | null {
  let next: Set<MessageId> | null = null;
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

export function mergeMentionUnreadPatch<T extends { mentionedUnreadMessageIds: Set<MessageId> }>(
  state: T,
  message: MentionFlagMessage,
  currentUserId: UserId | null,
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
  currentUserId: UserId | null,
): MessageId[] {
  return collectUnreadMentionIdsFromMessages(messages, currentUserId);
}
