import { describe, expect, it } from "vitest";
import {
  buildMentionLocationFlags,
  buildTopicMentionKey,
  messageLocationFromMockMessage,
} from "./chat-list-mention-locations.lib";

describe("buildMentionLocationFlags", () => {
  it("returns empty flags when there are no mention ids", () => {
    const flags = buildMentionLocationFlags(new Set(), new Map());
    expect(flags.streamIds.size).toBe(0);
    expect(flags.topicKeys.size).toBe(0);
    expect(flags.dmKeys.size).toBe(0);
  });

  it("maps stream and topic mention ids from messageIdToLocation", () => {
    const flags = buildMentionLocationFlags(
      new Set([1, 2, 99]),
      new Map([
        [1, { type: "stream", stream_id: 5, topic: "alpha" }],
        [2, { type: "stream", stream_id: 5, topic: "beta" }],
        [99, { type: "dm", dmKey: "10,20" }],
      ]),
    );

    expect([...flags.streamIds]).toEqual([5]);
    expect([...flags.topicKeys]).toEqual([
      buildTopicMentionKey(5, "alpha"),
      buildTopicMentionKey(5, "beta"),
    ]);
    expect([...flags.dmKeys]).toEqual(["10,20"]);
  });
});

describe("messageLocationFromMockMessage", () => {
  it("derives stream topic location from mock message", () => {
    expect(
      messageLocationFromMockMessage(
        {
          stream_id: 7,
          subject: "release",
          display_recipient: "general",
        },
        10,
      ),
    ).toEqual({ type: "stream", stream_id: 7, topic: "release" });
  });

  it("derives dm location from mock message recipients", () => {
    expect(
      messageLocationFromMockMessage(
        {
          stream_id: null,
          subject: "",
          display_recipient: [
            { id: 10, full_name: "Me" },
            { id: 20, full_name: "Peer" },
          ],
        },
        10,
      ),
    ).toEqual({ type: "dm", dmKey: "10,20" });
  });
});
