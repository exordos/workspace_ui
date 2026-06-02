import type { MockMessage, Reaction } from "~/shared/api/zulip.types";

export function messageReactionMatches(
  reaction: Reaction,
  emojiName: string,
  userId: number,
): boolean {
  return reaction.emoji_name === emojiName && reaction.user_id === userId;
}

export function applyMessageReactionUpdate(
  message: MockMessage,
  reaction: Reaction,
  op: "add" | "remove",
): MockMessage {
  const list = message.reactions ?? [];
  const exists = list.some((row) =>
    messageReactionMatches(row, reaction.emoji_name, reaction.user_id),
  );
  if (op === "add") {
    if (exists) {
      return message;
    }
    return { ...message, reactions: [...list, reaction] };
  }
  return {
    ...message,
    reactions: list.filter(
      (row) => !messageReactionMatches(row, reaction.emoji_name, reaction.user_id),
    ),
  };
}
