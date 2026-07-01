import { describe, expect, it } from "vitest";
import type { Draft } from "~/entities/draft/draft.types";
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
    const draft: Pick<Draft, "type" | "to" | "topic"> = {
      type: "stream",
      to: [STREAM_UUID],
      topic: "bugs",
    };
    const streamsMap = new Map<string, { name: string }>([[STREAM_UUID, { name: "engineering" }]]);

    expect(
      formatDraftMessageContext({
        draft,
        streamsMap,
        currentUserId: 42,
        getUserDisplayName: () => "Unknown",
        ...labels,
      }),
    ).toBe("#engineering · bugs");
  });

  it("formats private drafts with recipient display name", () => {
    const draft: Pick<Draft, "type" | "to" | "topic"> = {
      type: "private",
      to: [7, 42],
      topic: "",
    };

    expect(
      formatDraftMessageContext({
        draft,
        streamsMap: new Map(),
        currentUserId: 42,
        getUserDisplayName: (id) => (id === 7 ? "Bob" : "Me"),
        ...labels,
      }),
    ).toBe("DM · Bob");
  });
});
