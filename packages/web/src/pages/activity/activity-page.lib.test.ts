import { describe, expect, it } from "vitest";
import type { Draft } from "~/entities/draft/draft.types";
import { formatDraftMessageContext, resolveDraftDmDisplayName } from "./activity-page.lib";

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
