import { describe, expect, it } from "vitest";
import {
  collectUnreadMentionIdsFromMessages,
  decrementMentionUnreadForMessageIds,
  incrementMentionUnreadFromBatch,
  isUnreadMentionFromOthers,
  tryIncrementMentionUnread,
} from "./chat-list-mentions.lib";

describe("chat-list-mentions.lib", () => {
  it("isUnreadMentionFromOthers requires mentioned flag without read and not self", () => {
    expect(isUnreadMentionFromOthers({ id: 1, sender_id: 10, flags: ["mentioned"] }, 7)).toBe(true);
    expect(
      isUnreadMentionFromOthers({ id: 2, sender_id: 10, flags: ["mentioned", "read"] }, 7),
    ).toBe(false);
    expect(isUnreadMentionFromOthers({ id: 3, sender_id: 7, flags: ["mentioned"] }, 7)).toBe(false);
    expect(isUnreadMentionFromOthers({ id: 4, sender_id: 10, flags: [] }, 7)).toBe(false);
  });

  it("collectUnreadMentionIdsFromMessages filters self and read", () => {
    expect(
      collectUnreadMentionIdsFromMessages(
        [
          { id: 1, sender_id: 10, flags: ["mentioned"] },
          { id: 2, sender_id: 10, flags: ["mentioned", "read"] },
          { id: 3, sender_id: 7, flags: ["mentioned"] },
          { id: 4, sender_id: 11, flags: ["mentioned"] },
        ],
        7,
      ),
    ).toEqual([1, 4]);
  });

  it("tryIncrementMentionUnread dedups by message id", () => {
    const first = tryIncrementMentionUnread(
      new Set(),
      { id: 5, sender_id: 10, flags: ["mentioned"] },
      7,
    );
    expect(first?.mentionsUnreadCount).toBe(1);
    const second = tryIncrementMentionUnread(
      first!.mentionedUnreadMessageIds,
      { id: 5, sender_id: 10, flags: ["mentioned"] },
      7,
    );
    expect(second).toBeNull();
  });

  it("incrementMentionUnreadFromBatch returns null when nothing new to add", () => {
    expect(
      incrementMentionUnreadFromBatch(
        new Set([1]),
        [{ id: 1, sender_id: 10, flags: ["mentioned"] }],
        7,
      ),
    ).toBeNull();
    expect(
      incrementMentionUnreadFromBatch(
        new Set(),
        [{ id: 2, sender_id: 10, flags: ["mentioned", "read"] }],
        7,
      ),
    ).toBeNull();
  });

  it("incrementMentionUnreadFromBatch adds multiple unread mentions in one pass", () => {
    const result = incrementMentionUnreadFromBatch(
      new Set([1]),
      [
        { id: 1, sender_id: 10, flags: ["mentioned"] },
        { id: 2, sender_id: 11, flags: ["mentioned"] },
        { id: 3, sender_id: 11, flags: ["mentioned"] },
        { id: 2, sender_id: 11, flags: ["mentioned"] },
      ],
      7,
    );
    expect(result?.mentionsUnreadCount).toBe(3);
    expect([...result!.mentionedUnreadMessageIds].sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });

  it("decrementMentionUnreadForMessageIds removes only tracked ids", () => {
    const result = decrementMentionUnreadForMessageIds(new Set([1, 2, 3]), [2, 4, 99]);
    expect(result.mentionsUnreadCount).toBe(2);
    expect([...result.mentionedUnreadMessageIds]).toEqual([1, 3]);
  });
});
