import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";

export function buildDmTypingChatKey(
  userIds: number[],
  currentUserId: number | null,
): string | null {
  if (userIds.length === 0 || currentUserId == null) return null;
  return [...userIds, currentUserId]
    .filter((id, index, arr) => arr.indexOf(id) === index)
    .sort((a, b) => a - b)
    .join(",");
}

export function buildStreamTypingChatKey(streamId: number, topic: string): string {
  return `stream:${streamId}:${normalizeTopicForIdentity(topic)}`;
}
