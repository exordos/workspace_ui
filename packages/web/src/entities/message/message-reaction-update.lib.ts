import type { MessageReactions, MockMessage } from "~/shared/api/messenger.types";

function normalizedReactionCount(value: number | undefined): number {
  return Number.isFinite(value) && value != null && value > 0 ? Math.floor(value) : 0;
}

export function normalizedMessageReactionsSnapshot(
  reactions: MessageReactions | undefined,
): MessageReactions {
  const next: MessageReactions = {};
  for (const [emojiName, rawCount] of Object.entries(reactions ?? {})) {
    const count = normalizedReactionCount(rawCount);
    if (emojiName.trim().length > 0 && count > 0) {
      next[emojiName] = count;
    }
  }
  return next;
}

function reactionsEqual(left: MessageReactions | undefined, right: MessageReactions): boolean {
  const normalizedLeft = normalizedMessageReactionsSnapshot(left);
  const leftEntries = Object.entries(normalizedLeft);
  const rightEntries = Object.entries(right);
  if (leftEntries.length !== rightEntries.length) return false;
  return leftEntries.every(([emojiName, count]) => right[emojiName] === count);
}

export function applyMessageReactionSnapshot(
  message: MockMessage,
  reactions: MessageReactions,
): MockMessage {
  const nextReactions = normalizedMessageReactionsSnapshot(reactions);
  if (reactionsEqual(message.reactions, nextReactions)) {
    return message;
  }
  return { ...message, reactions: nextReactions };
}
