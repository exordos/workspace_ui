import { describe, expect, it } from "vitest";
import {
  buildMentionLocationFlags,
  buildTopicMentionKey,
  messageLocationFromMockMessage,
} from "./chat-list-mention-locations.lib";

describe("buildMentionLocationFlags", () => {
  const STREAM_UUID = "00000000-0000-4000-8000-000000000005";

  it("returns empty flags when there are no mention ids", () => {
    const flags = buildMentionLocationFlags(new Set(), new Map());
    expect(flags.streamIds.size).toBe(0);
    expect(flags.topicKeys.size).toBe(0);
    expect(flags.dmKeys.size).toBe(0);
  });

  it("maps stream and topic mention ids from messageIdToLocation", () => {
    const flags = buildMentionLocationFlags(
      new Set([
        "00000000-0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-000000000002",
        "00000000-0000-4000-8000-000000000099",
      ]),
      new Map([
        [
          "00000000-0000-4000-8000-000000000001",
          { type: "stream", streamUuid: STREAM_UUID, topic: "alpha" },
        ],
        [
          "00000000-0000-4000-8000-000000000002",
          { type: "stream", streamUuid: STREAM_UUID, topic: "beta" },
        ],
        ["00000000-0000-4000-8000-000000000099", { type: "dm", dmKey: "10,20" }],
      ]),
    );

    expect([...flags.streamIds]).toEqual([STREAM_UUID]);
    expect([...flags.topicKeys]).toEqual([
      buildTopicMentionKey(STREAM_UUID, "alpha"),
      buildTopicMentionKey(STREAM_UUID, "beta"),
    ]);
    expect([...flags.dmKeys]).toEqual(["10,20"]);
  });
});

describe("messageLocationFromMockMessage", () => {
  it("derives stream topic location from mock message", () => {
    expect(
      messageLocationFromMockMessage(
        {
          stream_uuid: "00000000-0000-4000-8000-000000000007",
          subject: "release",
          display_recipient: "general",
        },
        10,
      ),
    ).toEqual({
      type: "stream",
      streamUuid: "00000000-0000-4000-8000-000000000007",
      topic: "release",
    });
  });

  it("derives dm location from mock message recipients", () => {
    expect(
      messageLocationFromMockMessage(
        {
          stream_uuid: null,
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
