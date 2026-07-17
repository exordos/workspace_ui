import { describe, expect, it } from "vitest";
import {
  formatDraftMessageContext,
  getActivityPeerReactionGroups,
  hasReactionCounts,
  resolveDraftDmDisplayName,
} from "./activity-page.lib";

describe("hasReactionCounts", () => {
  it("returns true when at least one aggregate reaction count is positive", () => {
    expect(hasReactionCounts({ thumbs_up: 2 })).toBe(true);
  });

  it("returns false for empty or zero-count reactions", () => {
    expect(hasReactionCounts({})).toBe(false);
    expect(hasReactionCounts({ thumbs_up: 0 })).toBe(false);
  });
});

describe("getActivityPeerReactionGroups", () => {
  it("groups aggregate reactions by emoji", () => {
    const groups = getActivityPeerReactionGroups({ thumbs_up: 2, heart: 1 });

    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.emojiName).sort()).toEqual(["heart", "thumbs_up"]);
    expect(groups.find((group) => group.emojiName === "thumbs_up")?.count).toBe(2);
  });
});

describe("resolveDraftDmDisplayName", () => {
  it("returns partner name for a 1:1 DM draft", () => {
    expect(
      resolveDraftDmDisplayName({
        recipientIds: [7, 42],
        currentUserId: 42,
        getUserDisplayName: (id) => (id === 7 ? "Bob" : "Me"),
      }),
    ).toBe("Bob");
  });

  it("returns null for 3+ recipient drafts (group DMs removed)", () => {
    expect(
      resolveDraftDmDisplayName({
        recipientIds: [7, 8, 42],
        currentUserId: 42,
        getUserDisplayName: (id) => {
          if (id === 7) return "Bob";
          if (id === 8) return "Carol";
          return "Me";
        },
      }),
    ).toBeNull();
  });
});

describe("formatDraftMessageContext", () => {
  const STREAM_UUID = "00000000-0000-4000-8000-000000000010";
  const labels = {
    generalChatLabel: "General Chat",
    privateLabel: "DM",
  };

  it("formats stream drafts as channel and topic", () => {
    const draft = {
      stream_uuid: STREAM_UUID,
      topic_uuid: "00000000-0000-4000-8000-000000000020",
    };
    const streamsMap = new Map([
      [
        STREAM_UUID,
        {
          name: "engineering",
          topics: new Map([
            [
              "bugs",
              {
                topicUuid: "00000000-0000-4000-8000-000000000020",
                subject: "bugs",
              },
            ],
          ]),
        },
      ],
    ]);

    expect(
      formatDraftMessageContext({
        draft,
        streamsMap,
        ...labels,
      }),
    ).toBe("#engineering · bugs");
  });

  it("formats drafts for unknown DM streams with the private label", () => {
    const draft = {
      stream_uuid: "00000000-0000-4000-8000-000000000099",
      topic_uuid: "00000000-0000-4000-8000-000000000020",
    };

    expect(
      formatDraftMessageContext({
        draft,
        streamsMap: new Map(),
        ...labels,
      }),
    ).toBe("DM");
  });
});
