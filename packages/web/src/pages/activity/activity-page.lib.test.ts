import { describe, expect, it } from "vitest";
import type { Draft } from "~/entities/draft/draft.types";
import {
  filterPeerReactions,
  formatDraftMessageContext,
  getActivityPeerReactionGroups,
  resolveDraftDmDisplayName,
} from "./activity-page.lib";

describe("filterPeerReactions", () => {
  it("excludes reactions from the current user", () => {
    const reactions = [
      {
        emoji_name: "thumbs_up",
        emoji_code: "1f44d",
        reaction_type: "unicode_emoji" as const,
        user_id: 42,
      },
      {
        emoji_name: "heart",
        emoji_code: "2764",
        reaction_type: "unicode_emoji" as const,
        user_id: 7,
      },
    ];

    expect(filterPeerReactions(reactions, 42)).toEqual([reactions[1]]);
  });

  it("returns empty when current user id is unknown", () => {
    expect(
      filterPeerReactions(
        [
          {
            emoji_name: "heart",
            emoji_code: "2764",
            reaction_type: "unicode_emoji",
            user_id: 7,
          },
        ],
        null,
      ),
    ).toEqual([]);
  });
});

describe("getActivityPeerReactionGroups", () => {
  it("groups peer reactions by emoji", () => {
    const groups = getActivityPeerReactionGroups(
      [
        {
          emoji_name: "thumbs_up",
          emoji_code: "1f44d",
          reaction_type: "unicode_emoji",
          user_id: 42,
        },
        {
          emoji_name: "thumbs_up",
          emoji_code: "1f44d",
          reaction_type: "unicode_emoji",
          user_id: 7,
        },
        {
          emoji_name: "heart",
          emoji_code: "2764",
          reaction_type: "unicode_emoji",
          user_id: 8,
        },
      ],
      42,
    );

    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.emojiName).sort()).toEqual(["heart", "thumbs_up"]);
    expect(groups.find((group) => group.emojiName === "thumbs_up")?.userIds).toEqual([7]);
  });
});

describe("resolveDraftDmDisplayName", () => {
  it("returns partner name for a 1:1 DM draft", () => {
    expect(
      resolveDraftDmDisplayName({
        recipientIds: [7, 42],
        currentUserId: 42,
        getUserDisplayName: (id) => (id === 7 ? "Bob" : "Me"),
        groupChatLabel: "Group chat",
      }),
    ).toBe("Bob");
  });

  it("returns comma-separated names for group DM drafts", () => {
    expect(
      resolveDraftDmDisplayName({
        recipientIds: [7, 8, 42],
        currentUserId: 42,
        getUserDisplayName: (id) => {
          if (id === 7) return "Bob";
          if (id === 8) return "Carol";
          return "Me";
        },
        groupChatLabel: "Group chat",
      }),
    ).toBe("Bob, Carol");
  });
});

describe("formatDraftMessageContext", () => {
  const labels = {
    generalChatLabel: "General chat",
    privateLabel: "DM",
    groupChatLabel: "Group chat",
  };

  it("formats stream drafts as channel and topic", () => {
    const draft: Pick<Draft, "type" | "to" | "topic"> = {
      type: "stream",
      to: [10],
      topic: "bugs",
    };
    const streamsMap = new Map<number, { name: string }>([[10, { name: "engineering" }]]);

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
