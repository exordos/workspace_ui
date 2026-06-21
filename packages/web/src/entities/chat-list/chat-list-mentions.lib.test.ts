import { describe, expect, it } from "vitest";
import { testMessageId } from "~/test/factories";
import {
  collectUnreadMentionIdsFromMessages,
  decrementMentionUnreadForMessageIds,
  incrementMentionUnreadFromBatch,
  isUnreadMentionFromOthers,
  tryIncrementMentionUnread,
} from "./chat-list-mentions.lib";

const MESSAGE_ID_1 = testMessageId(1);
const MESSAGE_ID_2 = testMessageId(2);
const MESSAGE_ID_3 = testMessageId(3);
const MESSAGE_ID_4 = testMessageId(4);
const MESSAGE_ID_5 = testMessageId(5);
const MESSAGE_ID_99 = testMessageId(99);

describe("chat-list-mentions.lib", () => {
  it("isUnreadMentionFromOthers requires mentioned flag without read and not self", () => {
    expect(
      isUnreadMentionFromOthers({ id: MESSAGE_ID_1, sender_id: 10, flags: ["mentioned"] }, 7),
    ).toBe(true);
    expect(
      isUnreadMentionFromOthers(
        { id: MESSAGE_ID_2, sender_id: 10, flags: ["mentioned", "read"] },
        7,
      ),
    ).toBe(false);
    expect(
      isUnreadMentionFromOthers({ id: MESSAGE_ID_3, sender_id: 7, flags: ["mentioned"] }, 7),
    ).toBe(false);
    expect(isUnreadMentionFromOthers({ id: MESSAGE_ID_4, sender_id: 10, flags: [] }, 7)).toBe(
      false,
    );
  });

  it("collectUnreadMentionIdsFromMessages filters self and read", () => {
    expect(
      collectUnreadMentionIdsFromMessages(
        [
          { id: MESSAGE_ID_1, sender_id: 10, flags: ["mentioned"] },
          { id: MESSAGE_ID_2, sender_id: 10, flags: ["mentioned", "read"] },
          { id: MESSAGE_ID_3, sender_id: 7, flags: ["mentioned"] },
          { id: MESSAGE_ID_4, sender_id: 11, flags: ["mentioned"] },
        ],
        7,
      ),
    ).toEqual([MESSAGE_ID_1, MESSAGE_ID_4]);
  });

  it("tryIncrementMentionUnread dedups by message id", () => {
    const first = tryIncrementMentionUnread(
      new Set(),
      { id: MESSAGE_ID_5, sender_id: 10, flags: ["mentioned"] },
      7,
    );
    expect(first?.mentionsUnreadCount).toBe(1);
    const second = tryIncrementMentionUnread(
      first!.mentionedUnreadMessageIds,
      { id: MESSAGE_ID_5, sender_id: 10, flags: ["mentioned"] },
      7,
    );
    expect(second).toBeNull();
  });

  it("incrementMentionUnreadFromBatch returns null when nothing new to add", () => {
    expect(
      incrementMentionUnreadFromBatch(
        new Set([MESSAGE_ID_1]),
        [{ id: MESSAGE_ID_1, sender_id: 10, flags: ["mentioned"] }],
        7,
      ),
    ).toBeNull();
    expect(
      incrementMentionUnreadFromBatch(
        new Set(),
        [{ id: MESSAGE_ID_2, sender_id: 10, flags: ["mentioned", "read"] }],
        7,
      ),
    ).toBeNull();
  });

  it("incrementMentionUnreadFromBatch adds multiple unread mentions in one pass", () => {
    const result = incrementMentionUnreadFromBatch(
      new Set([MESSAGE_ID_1]),
      [
        { id: MESSAGE_ID_1, sender_id: 10, flags: ["mentioned"] },
        { id: MESSAGE_ID_2, sender_id: 11, flags: ["mentioned"] },
        { id: MESSAGE_ID_3, sender_id: 11, flags: ["mentioned"] },
        { id: MESSAGE_ID_2, sender_id: 11, flags: ["mentioned"] },
      ],
      7,
    );
    expect(result?.mentionsUnreadCount).toBe(3);
    expect([...result!.mentionedUnreadMessageIds].sort()).toEqual([
      MESSAGE_ID_1,
      MESSAGE_ID_2,
      MESSAGE_ID_3,
    ]);
  });

  it("decrementMentionUnreadForMessageIds removes only tracked ids", () => {
    const result = decrementMentionUnreadForMessageIds(
      new Set([MESSAGE_ID_1, MESSAGE_ID_2, MESSAGE_ID_3]),
      [MESSAGE_ID_2, MESSAGE_ID_4, MESSAGE_ID_99],
    );
    expect(result.mentionsUnreadCount).toBe(2);
    expect([...result.mentionedUnreadMessageIds]).toEqual([MESSAGE_ID_1, MESSAGE_ID_3]);
  });
});
