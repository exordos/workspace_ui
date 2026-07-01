import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import { compareUserIds, userIdStorageKey, type UserId } from "~/shared/lib/user-id.lib";

export function buildDmTypingChatKey(
  userIds: readonly UserId[],
  currentUserId: UserId | null,
): string | null {
  if (userIds.length === 0 || currentUserId == null) return null;
  const byKey = new Map<string, UserId>();
  for (const userId of userIds) {
    byKey.set(userIdStorageKey(userId), userId);
  }
  byKey.set(userIdStorageKey(currentUserId), currentUserId);
  return Array.from(byKey.values()).sort(compareUserIds).map(userIdStorageKey).join(",");
}

export function buildStreamTypingChatKey(streamId: string, topic: string): string {
  return `stream:${streamId}:${normalizeTopicForIdentity(topic)}`;
}
