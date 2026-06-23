import { beforeEach, describe, expect, it } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import type { StreamEntryInternal } from "~/shared/types/sidebar-chat";
import { testMessageId } from "~/test/factories";
import { getInMemoryLatestMessageId, maxMessageId } from "./layout-chat-list-latest-message-id.lib";

const STREAM_UUID = "00000000-0000-4000-8000-000000000001";

function createStreamEntry(streamUuid: string, topicLastMessageId: string): StreamEntryInternal {
  return {
    streamUuid,
    name: "general",
    lastMessage: "hello",
    time: "12:00",
    ts: 1,
    topics: new Map([
      [
        "t",
        {
          subject: "t",
          lastMessage: "hello",
          time: "12:00",
          ts: 1,
          unreadCount: 0,
          lastMessageId: topicLastMessageId,
        },
      ],
    ]),
  };
}

describe("layout-chat-list-latest-message-id", () => {
  beforeEach(() => {
    useChatListStore.getState().clear();
  });

  it("maxMessageId picks the greater anchor", () => {
    expect(maxMessageId(testMessageId(10), testMessageId(20))).toBe(testMessageId(20));
    expect(maxMessageId(null, testMessageId(15))).toBe(testMessageId(15));
  });

  it("getInMemoryLatestMessageId scans streams, dms, and location index", () => {
    useChatListStore.setState({
      streamsMap: new Map([[STREAM_UUID, createStreamEntry(STREAM_UUID, testMessageId(42))]]),
      messageIdToLocation: new Map([
        [testMessageId(99), { type: "stream", streamUuid: STREAM_UUID, topic: "t" }],
      ]),
    });

    expect(getInMemoryLatestMessageId()).toBe(testMessageId(99));
  });
});
