import { describe, expect, it } from "vitest";
import type { UserRecord } from "~/entities/user/user.model";
import type { TypingUser } from "~/features/typing-indicator/typing-indicator.types";
import { isDmPartnerTyping, sortDmAllUsersForDisplay } from "./sidebar-dm-list.lib";

function createUser(
  user: Partial<UserRecord> & { user_id: number; full_name: string },
): UserRecord {
  return {
    user_id: user.user_id,
    full_name: user.full_name,
    email: user.email,
    avatar_url: user.avatar_url,
    role: user.role,
    presence: user.presence,
  };
}

describe("sidebar-dm-list.lib", () => {
  it("sorts users by unread desc, then presence, then name", () => {
    const users: UserRecord[] = [
      createUser({
        user_id: 101,
        full_name: "Bob",
        presence: { status: "active", timestamp: 1 },
      }),
      createUser({
        user_id: 102,
        full_name: "Alice",
        presence: { status: "idle", timestamp: 1 },
      }),
      createUser({
        user_id: 103,
        full_name: "Carol",
      }),
      createUser({
        user_id: 999,
        full_name: "Self",
      }),
    ];
    const unreadByUserId = new Map<number, number>([
      [102, 3],
      [101, 0],
      [103, 0],
    ]);

    const sorted = sortDmAllUsersForDisplay(users, unreadByUserId, 999);
    expect(sorted.map((u) => u.user_id)).toEqual([102, 101, 103]);
  });

  it("returns true when typing map contains partner typing in DM key", () => {
    const typingMap = new Map<string, TypingUser[]>([
      [
        "42,100",
        [
          {
            userId: 42,
            startedAt: 1,
          },
        ],
      ],
    ]);

    expect(
      isDmPartnerTyping({
        partnerUserId: 42,
        currentUserId: 100,
        typingMap,
      }),
    ).toBe(true);
  });

  it("returns false for invalid partner/current user", () => {
    const typingMap = new Map<string, TypingUser[]>();
    expect(
      isDmPartnerTyping({
        partnerUserId: null,
        currentUserId: 100,
        typingMap,
      }),
    ).toBe(false);
    expect(
      isDmPartnerTyping({
        partnerUserId: 42,
        currentUserId: null,
        typingMap,
      }),
    ).toBe(false);
  });
});
