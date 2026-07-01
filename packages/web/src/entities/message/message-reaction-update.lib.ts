import type { MockMessage } from "~/shared/api/messenger.types";

function normalizedReactionCount(value: number | undefined): number {
  return Number.isFinite(value) && value != null && value > 0 ? Math.floor(value) : 0;
}

export function applyMessageReactionUpdate(
  message: MockMessage,
  emojiName: string,
  op: "add" | "remove",
): MockMessage {
  const current = message.reactions ?? {};
  const currentCount = normalizedReactionCount(current[emojiName]);
  const nextCount = op === "add" ? currentCount + 1 : Math.max(0, currentCount - 1);
  if (nextCount === currentCount) {
    return message;
  }

  const nextReactions = { ...current };
  if (nextCount === 0) {
    delete nextReactions[emojiName];
  } else {
    nextReactions[emojiName] = nextCount;
  }
  return { ...message, reactions: nextReactions };
}
