import { afterEach, describe, expect, it } from "vitest";
import {
  applyChatListReadDecrement,
  applyChatListReadDecrementGrouped,
  getContextUnreadCount,
  groupMessageIdsByReadLocation,
  readFallbackContextFromCurrentChat,
} from "./chat-list-apply-read-decrement.lib";
import { useChatListStore } from "./chat-list.model";

const OTHER_SENDER_ID = 20;

function streamMsg(overrides: Partial<import("~/shared/api/zulip.types").ZulipRawMessage> = {}) {
  return {
    id: 1,
    sender_id: OTHER_SENDER_ID,
    sender_full_name: "Sender",
    content: "hello",
    timestamp: 1000,
    type: "stream" as const,
    stream_id: 5,
    display_recipient: "general",
    subject: "topic1",
    flags: [] as string[],
    ...overrides,
  };
}

function resetStore() {
  useChatListStore.getState().clear();
}

describe("applyChatListReadDecrement", () => {
  afterEach(() => {
    resetStore();
  });

  it("decrements per indexed id and uses topic fallback for missing ids", () => {
    useChatListStore
      .getState()
      .setFromMessages(
        [
          streamMsg({ id: 1, flags: [] }),
          streamMsg({ id: 2, flags: [], timestamp: 2000 }),
          streamMsg({ id: 3, flags: [], timestamp: 3000 }),
        ],
        10,
      );

    const store = useChatListStore.getState();
    const context = { type: "stream" as const, streamId: 5, topic: "topic1" };
    applyChatListReadDecrement(() => useChatListStore.getState(), store, {
      messageIds: [1, 99, 100],
      fallbackContext: context,
    });

    expect(useChatListStore.getState().streamsMap.get(5)?.topics.get("topic1")?.unreadCount).toBe(
      0,
    );
  });

  it("clears stale badge when flags already read via clampWhenAlreadyRead", () => {
    useChatListStore
      .getState()
      .setFromMessages(
        [
          streamMsg({ id: 1, flags: ["read"] }),
          streamMsg({ id: 2, flags: ["read"], timestamp: 2000 }),
          streamMsg({ id: 3, flags: ["read"], timestamp: 3000 }),
        ],
        10,
      );
    useChatListStore.setState({
      streamsMap: new Map(useChatListStore.getState().streamsMap).set(5, {
        ...useChatListStore.getState().streamsMap.get(5)!,
        topics: new Map([
          [
            "topic1",
            {
              subject: "topic1",
              lastMessage: "x",
              time: "",
              ts: 3000,
              unreadCount: 3,
            },
          ],
        ]),
      }),
      sidebarStreamsUnread: 3,
    });

    const store = useChatListStore.getState();
    applyChatListReadDecrement(() => useChatListStore.getState(), store, {
      messageIds: [1, 2, 3],
      fallbackContext: { type: "stream", streamId: 5, topic: "topic1" },
      clampWhenAlreadyRead: true,
    });

    expect(useChatListStore.getState().streamsMap.get(5)?.topics.get("topic1")?.unreadCount).toBe(
      0,
    );
  });

  it("does not apply DM fallback on duplicate read event after optimistic decrement", () => {
    const dmMsg = (
      id: number,
      flags: string[] = [],
    ): import("~/shared/api/zulip.types").ZulipRawMessage => ({
      id,
      sender_id: OTHER_SENDER_ID,
      sender_full_name: "Peer",
      content: "hi",
      timestamp: id,
      type: "private",
      display_recipient: [
        { id: 23, email: "me@example.com", full_name: "Me" },
        { id: 35, email: "peer@example.com", full_name: "Peer" },
      ],
      flags,
    });

    useChatListStore
      .getState()
      .setFromMessages([dmMsg(3055), dmMsg(3056), dmMsg(3057), dmMsg(3058)], 23);
    const context = { type: "dm" as const, dmKey: "23,35" };
    const store = useChatListStore.getState();
    expect(useChatListStore.getState().dmsMap.get("23,35")?.unreadCount).toBe(4);

    applyChatListReadDecrement(() => useChatListStore.getState(), store, {
      messageIds: [3055, 3056, 3057, 3058],
      fallbackContext: context,
      source: "test:optimistic",
    });
    expect(useChatListStore.getState().dmsMap.get("23,35")?.unreadCount).toBe(0);

    const dmUnreadAfterOptimistic = useChatListStore.getState().dmsMap.get("23,35")?.unreadCount;
    applyChatListReadDecrement(() => useChatListStore.getState(), useChatListStore.getState(), {
      messageIds: [3055, 3056, 3057, 3058],
      fallbackContext: context,
      source: "test:eventReplay",
    });
    expect(useChatListStore.getState().dmsMap.get("23,35")?.unreadCount).toBe(
      dmUnreadAfterOptimistic,
    );
    expect(useChatListStore.getState().messageIdToLocation.has(3055)).toBe(true);
  });

  it("readFallbackContextFromCurrentChat ignores stream-wide view", () => {
    expect(
      readFallbackContextFromCurrentChat({
        type: "stream",
        streamId: 1,
        streamName: "general",
        topic: "t",
        streamWideView: true,
      }),
    ).toBeUndefined();
    expect(
      readFallbackContextFromCurrentChat({
        type: "stream",
        streamId: 1,
        streamName: "general",
        topic: "t",
        streamWideView: false,
      }),
    ).toEqual({ type: "stream", streamId: 1, topic: "t" });
  });

  it("decrements mentionsUnreadCount when read ids are in mentionedUnreadMessageIds", () => {
    useChatListStore.setState({
      mentionedUnreadMessageIds: new Set([10, 11, 12]),
      mentionsUnreadCount: 3,
    });

    const store = useChatListStore.getState();
    applyChatListReadDecrement(() => useChatListStore.getState(), store, {
      messageIds: [10, 99],
      source: "test:mentions",
    });

    expect(useChatListStore.getState().mentionsUnreadCount).toBe(2);
    expect([...useChatListStore.getState().mentionedUnreadMessageIds]).toEqual([11, 12]);
  });
});

describe("applyChatListReadDecrementGrouped", () => {
  afterEach(() => {
    resetStore();
  });

  it("decrements each topic independently when batch spans multiple topics", () => {
    useChatListStore.getState().upsertStreamMetadataRows([{ streamId: 5, name: "general" }]);
    useChatListStore.getState().reconcileUnreadFromSnapshot(
      {
        streams: [
          { streamId: 5, topic: "alpha", unreadMessageIds: [1, 2] },
          { streamId: 5, topic: "beta", unreadMessageIds: [10, 11] },
        ],
        dms: [],
        totalCount: 4,
        mentionMessageIds: [],
      },
      1,
    );

    const store = useChatListStore.getState();
    applyChatListReadDecrementGrouped(() => useChatListStore.getState(), store, {
      messageIds: [1, 2, 10, 11],
      source: "test:multiTopic",
    });

    expect(useChatListStore.getState().streamsMap.get(5)?.topics.get("alpha")?.unreadCount).toBe(0);
    expect(useChatListStore.getState().streamsMap.get(5)?.topics.get("beta")?.unreadCount).toBe(0);
  });
});

describe("groupMessageIdsByReadLocation", () => {
  afterEach(() => {
    resetStore();
  });

  it("groups ids by stream topic location", () => {
    useChatListStore.setState({
      messageIdToLocation: new Map([
        [1, { type: "stream", stream_id: 5, topic: "a" }],
        [2, { type: "stream", stream_id: 5, topic: "b" }],
      ]),
    });
    const { groups, unindexedIds } = groupMessageIdsByReadLocation(
      useChatListStore.getState(),
      [1, 2, 99],
    );
    expect(unindexedIds).toEqual([99]);
    expect(groups).toHaveLength(2);
  });
});

describe("getContextUnreadCount", () => {
  afterEach(() => {
    resetStore();
  });

  it("reads topic unread from streamsMap", () => {
    useChatListStore.getState().setFromMessages([streamMsg({ id: 1, flags: [] })], 10);
    const state = useChatListStore.getState();
    expect(getContextUnreadCount(state, { type: "stream", streamId: 5, topic: "topic1" })).toBe(1);
  });
});
