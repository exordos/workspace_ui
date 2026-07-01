import type { PresenceStatus, UserRecord } from "~/entities/user/user.model";
import type { TypingUser } from "~/features/typing-indicator/typing-indicator.types";
import { buildDmTypingChatKey } from "~/features/typing-indicator/typing-key";
import type { UserId } from "~/shared/lib/user-id.lib";
import { numericUserIdOrNull, userIdStorageKey, userIdsEqual } from "~/shared/lib/user-id.lib";

function presenceRank(status: PresenceStatus | undefined): number {
  if (status === "active" || status === "do_not_disturb") return 0;
  if (status === "idle") return 1;
  return 2;
}

export function sortDmAllUsersForDisplay(
  users: UserRecord[],
  unreadByUserId: Map<string, number>,
  currentUserId: UserId | null,
): UserRecord[] {
  return users
    .filter((user) => user.full_name.trim().length > 0)
    .filter((user) => (currentUserId == null ? true : !userIdsEqual(user.user_id, currentUserId)))
    .sort((left, right) => {
      const unreadDiff =
        (unreadByUserId.get(userIdStorageKey(right.user_id)) ?? 0) -
        (unreadByUserId.get(userIdStorageKey(left.user_id)) ?? 0);
      if (unreadDiff !== 0) return unreadDiff;

      const presenceDiff =
        presenceRank(left.presence?.status) - presenceRank(right.presence?.status);
      if (presenceDiff !== 0) return presenceDiff;

      return left.full_name.localeCompare(right.full_name);
    });
}

export function isDmPartnerTyping({
  partnerUserId,
  currentUserId,
  typingMap,
}: {
  partnerUserId: UserId | null;
  currentUserId: UserId | null;
  typingMap: Map<string, TypingUser[]>;
}): boolean {
  if (partnerUserId == null || currentUserId == null) return false;
  const numericPartnerUserId = numericUserIdOrNull(partnerUserId);
  if (numericPartnerUserId == null) return false;
  const chatKey = buildDmTypingChatKey([numericPartnerUserId], currentUserId);
  if (chatKey == null) return false;
  const typingUsers = typingMap.get(chatKey) ?? [];
  return typingUsers.some((typingUser) => typingUser.userId === numericPartnerUserId);
}
