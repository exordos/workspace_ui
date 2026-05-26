import { beforeEach, describe, expect, it } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import type { StreamEntryInternal } from "~/shared/types/sidebar-chat";
import { getInMemoryLatestMessageId, maxMessageId } from "./layout-chat-list-latest-message-id.lib";

function createStreamEntry(streamId: number, topicLastMessageId: number): StreamEntryInternal {
  return {
    stream_id: streamId,
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
    expect(maxMessageId(10, 20)).toBe(20);
    expect(maxMessageId(null, 15)).toBe(15);
  });

  it("getInMemoryLatestMessageId scans streams, dms, and location index", () => {
    useChatListStore.setState({
      streamsMap: new Map([[1, createStreamEntry(1, 42)]]),
      messageIdToLocation: new Map([[99, { type: "stream", stream_id: 1, topic: "t" }]]),
    });

    expect(getInMemoryLatestMessageId()).toBe(99);
  });
});
