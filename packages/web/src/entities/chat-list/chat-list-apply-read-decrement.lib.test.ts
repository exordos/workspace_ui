import { afterEach, describe, expect, it } from "vitest";
import { testMessageId } from "~/test/factories";
import {
  applyChatListReadDecrement,
  applyChatListReadDecrementGrouped,
  getContextUnreadCount,
  groupMessageIdsByReadLocation,
  readFallbackContextFromCurrentChat,
} from "./chat-list-apply-read-decrement.lib";
import { useChatListStore } from "./chat-list.model";

const OTHER_SENDER_ID = 20;

function streamMsg(
  overrides: Partial<import("~/shared/api/messenger.types").WorkspaceRawMessage> = {},
) {
  return {
    id: "00000000-0000-4000-8000-000000000001",
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
          streamMsg({ id: "00000000-0000-4000-8000-000000000001", flags: [] }),
          streamMsg({ id: "00000000-0000-4000-8000-000000000002", flags: [], timestamp: 2000 }),
          streamMsg({ id: "00000000-0000-4000-8000-000000000003", flags: [], timestamp: 3000 }),
        ],
        10,
      );

    const store = useChatListStore.getState();
    const context = { type: "stream" as const, streamId: 5, topic: "topic1" };
    applyChatListReadDecrement(() => useChatListStore.getState(), store, {
      messageIds: [
        "00000000-0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-000000000099",
        "00000000-0000-4000-8000-000000000100",
      ],
      fallbackContext: context,
    });

    expect(useChatListStore.getState().streamsMap.get(5)?.topics.get("topic1")?.unreadCount).toBe(
      0,
    );
  });

  it("clears stale badge when flags already read via clampWhenAlreadyRead", () => {
    useChatListStore.getState().setFromMessages(
      [
        streamMsg({ id: "00000000-0000-4000-8000-000000000001", flags: ["read"] }),
        streamMsg({
          id: "00000000-0000-4000-8000-000000000002",
          flags: ["read"],
          timestamp: 2000,
        }),
        streamMsg({
          id: "00000000-0000-4000-8000-000000000003",
          flags: ["read"],
          timestamp: 3000,
        }),
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
      messageIds: [
        "00000000-0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-000000000002",
        "00000000-0000-4000-8000-000000000003",
      ],
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
    ): import("~/shared/api/messenger.types").WorkspaceRawMessage => ({
      id: testMessageId(id),
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
      messageIds: [
        "00000000-0000-4000-8000-000000003055",
        "00000000-0000-4000-8000-000000003056",
        "00000000-0000-4000-8000-000000003057",
        "00000000-0000-4000-8000-000000003058",
      ],
      fallbackContext: context,
      source: "test:optimistic",
    });
    expect(useChatListStore.getState().dmsMap.get("23,35")?.unreadCount).toBe(0);

    const dmUnreadAfterOptimistic = useChatListStore.getState().dmsMap.get("23,35")?.unreadCount;
    applyChatListReadDecrement(() => useChatListStore.getState(), useChatListStore.getState(), {
      messageIds: [
        "00000000-0000-4000-8000-000000003055",
        "00000000-0000-4000-8000-000000003056",
        "00000000-0000-4000-8000-000000003057",
        "00000000-0000-4000-8000-000000003058",
      ],
      fallbackContext: context,
      source: "test:eventReplay",
    });
    expect(useChatListStore.getState().dmsMap.get("23,35")?.unreadCount).toBe(
      dmUnreadAfterOptimistic,
    );
    expect(
      useChatListStore.getState().messageIdToLocation.has("00000000-0000-4000-8000-000000003055"),
    ).toBe(true);
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
      mentionedUnreadMessageIds: new Set([
        "00000000-0000-4000-8000-000000000010",
        "00000000-0000-4000-8000-000000000011",
        "00000000-0000-4000-8000-000000000012",
      ]),
      mentionsUnreadCount: 3,
    });

    const store = useChatListStore.getState();
    applyChatListReadDecrement(() => useChatListStore.getState(), store, {
      messageIds: ["00000000-0000-4000-8000-000000000010", "00000000-0000-4000-8000-000000000099"],
      source: "test:mentions",
    });

    expect(useChatListStore.getState().mentionsUnreadCount).toBe(2);
    expect([...useChatListStore.getState().mentionedUnreadMessageIds]).toEqual([
      testMessageId(11),
      testMessageId(12),
    ]);
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
          {
            streamId: 5,
            topic: "alpha",
            unreadMessageIds: [
              "00000000-0000-4000-8000-000000000001",
              "00000000-0000-4000-8000-000000000002",
            ],
          },
          {
            streamId: 5,
            topic: "beta",
            unreadMessageIds: [
              "00000000-0000-4000-8000-000000000010",
              "00000000-0000-4000-8000-000000000011",
            ],
          },
        ],
        dms: [],
        totalCount: 4,
        mentionMessageIds: [],
      },
      1,
    );

    const store = useChatListStore.getState();
    applyChatListReadDecrementGrouped(() => useChatListStore.getState(), store, {
      messageIds: [
        "00000000-0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-000000000002",
        "00000000-0000-4000-8000-000000000010",
        "00000000-0000-4000-8000-000000000011",
      ],
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
        ["00000000-0000-4000-8000-000000000001", { type: "stream", stream_id: 5, topic: "a" }],
        ["00000000-0000-4000-8000-000000000002", { type: "stream", stream_id: 5, topic: "b" }],
      ]),
    });
    const { groups, unindexedIds } = groupMessageIdsByReadLocation(useChatListStore.getState(), [
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000099",
    ]);
    expect(unindexedIds).toEqual([testMessageId(99)]);
    expect(groups).toHaveLength(2);
  });
});

describe("getContextUnreadCount", () => {
  afterEach(() => {
    resetStore();
  });

  it("reads topic unread from streamsMap", () => {
    useChatListStore
      .getState()
      .setFromMessages([streamMsg({ id: "00000000-0000-4000-8000-000000000001", flags: [] })], 10);
    const state = useChatListStore.getState();
    expect(getContextUnreadCount(state, { type: "stream", streamId: 5, topic: "topic1" })).toBe(1);
  });
});
