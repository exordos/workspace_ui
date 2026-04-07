import type { UserRecord } from "~/entities/user/user.model";
import { buildDmTypingChatKey } from "~/features/typing-indicator/typing-key";
import type { TypingUser } from "~/features/typing-indicator/typing-indicator.types";

function presenceRank(status: "active" | "idle" | undefined): number {
  if (status === "active") return 0;
  if (status === "idle") return 1;
  return 2;
}

export function sortDmAllUsersForDisplay(
  users: UserRecord[],
  unreadByUserId: Map<number, number>,
  currentUserId: number | null,
): UserRecord[] {
  return users
    .filter((user) => user.full_name.trim().length > 0)
    .filter((user) => (currentUserId == null ? true : user.user_id !== currentUserId))
    .sort((left, right) => {
      const unreadDiff =
        (unreadByUserId.get(right.user_id) ?? 0) - (unreadByUserId.get(left.user_id) ?? 0);
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
  partnerUserId: number | null;
  currentUserId: number | null;
  typingMap: Map<string, TypingUser[]>;
}): boolean {
  if (partnerUserId == null || currentUserId == null) return false;
  const chatKey = buildDmTypingChatKey([partnerUserId], currentUserId);
  if (chatKey == null) return false;
  const typingUsers = typingMap.get(chatKey) ?? [];
  return typingUsers.some((typingUser) => typingUser.userId === partnerUserId);
}
