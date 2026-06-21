import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import { numericUserIdOrNull, type UserId } from "~/shared/lib/user-id.lib";

export function buildDmTypingChatKey(
  userIds: number[],
  currentUserId: UserId | null,
): string | null {
  const numericCurrentUserId = numericUserIdOrNull(currentUserId);
  if (userIds.length === 0 || numericCurrentUserId == null) return null;
  return [...userIds, numericCurrentUserId]
    .filter((id, index, arr) => arr.indexOf(id) === index)
    .sort((a, b) => a - b)
    .join(",");
}

export function buildStreamTypingChatKey(streamId: string, topic: string): string {
  return `stream:${streamId}:${normalizeTopicForIdentity(topic)}`;
}
