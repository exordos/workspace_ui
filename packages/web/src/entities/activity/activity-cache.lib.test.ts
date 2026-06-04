import { describe, expect, it } from "vitest";
import { createMessage } from "~/test/factories";
import { isActivityMessagesSnapshotFresher, matchesActivityFilter } from "./activity-cache.lib";

function activityMessage(overrides: Parameters<typeof createMessage>[0] = {}) {
  return createMessage(overrides);
}

describe("isActivityMessagesSnapshotFresher", () => {
  it("returns true when candidate has newer timestamp", () => {
    const current = [activityMessage({ id: 10, timestamp: 100 })];
    const candidate = [activityMessage({ id: 11, timestamp: 200 })];

    expect(isActivityMessagesSnapshotFresher(candidate, current)).toBe(true);
  });

  it("returns true when timestamp is equal but candidate has higher max message id", () => {
    const current = [activityMessage({ id: 100, timestamp: 200 })];
    const candidate = [activityMessage({ id: 101, timestamp: 200 })];

    expect(isActivityMessagesSnapshotFresher(candidate, current)).toBe(true);
  });

  it("returns false when candidate is not fresher", () => {
    const current = [activityMessage({ id: 101, timestamp: 200 })];
    const candidate = [activityMessage({ id: 100, timestamp: 200 })];

    expect(isActivityMessagesSnapshotFresher(candidate, current)).toBe(false);
  });
});

describe("matchesActivityFilter", () => {
  const currentUserId = 42;

  it("includes own message with reactions for reactions filter", () => {
    const message = activityMessage({
      sender_id: currentUserId,
      reactions: [
        {
          emoji_name: "thumbs_up",
          emoji_code: "1f44d",
          reaction_type: "unicode_emoji",
          user_id: 7,
        },
      ],
    });

    expect(matchesActivityFilter(message, "reactions", currentUserId)).toBe(true);
  });

  it("excludes own messages with no reactions from reactions filter", () => {
    const message = activityMessage({
      sender_id: currentUserId,
      reactions: [],
    });

    expect(matchesActivityFilter(message, "reactions", currentUserId)).toBe(false);
  });

  it("excludes others' messages even when current user reacted", () => {
    const message = activityMessage({
      sender_id: 7,
      reactions: [
        {
          emoji_name: "thumbs_up",
          emoji_code: "1f44d",
          reaction_type: "unicode_emoji",
          user_id: currentUserId,
        },
      ],
    });

    expect(matchesActivityFilter(message, "reactions", currentUserId)).toBe(false);
  });

  it("excludes reactions filter matches when current user id is unknown", () => {
    const message = activityMessage({
      sender_id: currentUserId,
      reactions: [
        {
          emoji_name: "heart",
          emoji_code: "2764",
          reaction_type: "unicode_emoji",
          user_id: 7,
        },
      ],
    });

    expect(matchesActivityFilter(message, "reactions", null)).toBe(false);
  });
});
