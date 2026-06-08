import { beforeEach, describe, expect, it } from "vitest";
import type { ZulipRawMessage } from "~/shared/api/zulip.types";
import { buildNotificationTitleContextFromMessage } from "./layout-notification-title.lib";
import {
  buildNotificationAggregateTag,
  buildNotificationBucketKeyFromMessage,
  clearNotificationAggregateRegistry,
  consumeReadMessagesFromNotificationAggregates,
  upsertNotificationAggregate,
} from "./notification-aggregate-registry.lib";

function createStreamMessage(overrides: Partial<ZulipRawMessage> = {}): ZulipRawMessage {
  return {
    id: 55,
    sender_id: 42,
    sender_full_name: "Alice",
    content: "<p>Hello</p>",
    timestamp: 1,
    type: "stream",
    stream_id: 10,
    display_recipient: "General Discussion",
    subject: "Bugs",
    flags: [],
    ...overrides,
  };
}

function createDmMessage(overrides: Partial<ZulipRawMessage> = {}): ZulipRawMessage {
  return {
    id: 77,
    sender_id: 42,
    sender_full_name: "Alice",
    content: "<p>Hello</p>",
    timestamp: 1,
    type: "private",
    stream_id: null,
    subject: "",
    display_recipient: [
      { id: 7, full_name: "You" },
      { id: 42, full_name: "Alice" },
    ],
    flags: [],
    ...overrides,
  };
}

beforeEach(() => {
  clearNotificationAggregateRegistry();
});

describe("buildNotificationBucketKeyFromMessage", () => {
  it("returns the same key for the same sender in the same stream topic", () => {
    const first = buildNotificationBucketKeyFromMessage(createStreamMessage(), 7);
    const second = buildNotificationBucketKeyFromMessage(createStreamMessage({ id: 56 }), 7);

    expect(first).toBe("stream:10:Bugs:sender:42");
    expect(second).toBe(first);
  });

  it("returns a different key for a different sender in the same stream topic", () => {
    const first = buildNotificationBucketKeyFromMessage(createStreamMessage(), 7);
    const second = buildNotificationBucketKeyFromMessage(
      createStreamMessage({ id: 56, sender_id: 99, sender_full_name: "Bob" }),
      7,
    );

    expect(second).toBe("stream:10:Bugs:sender:99");
    expect(second).not.toBe(first);
  });

  it("returns the same key for the same DM conversation", () => {
    const first = buildNotificationBucketKeyFromMessage(createDmMessage(), 7);
    const second = buildNotificationBucketKeyFromMessage(createDmMessage({ id: 78 }), 7);

    expect(first).toBe("dm:7,42");
    expect(second).toBe(first);
  });
});

describe("notification aggregate registry", () => {
  it("updates one stream bucket across multiple messages from the same sender", () => {
    const firstMessage = createStreamMessage();
    const secondMessage = createStreamMessage({
      id: 56,
      content: "<p>Latest</p>",
    });

    const first = upsertNotificationAggregate({
      message: firstMessage,
      currentUserId: 7,
      body: "Hello",
      clickRoute: "/stream/10-general-discussion/topic/Bugs?msg=55",
      titleContext: buildNotificationTitleContextFromMessage(firstMessage, 7),
    });
    const second = upsertNotificationAggregate({
      message: secondMessage,
      currentUserId: 7,
      body: "Latest",
      clickRoute: "/stream/10-general-discussion/topic/Bugs?msg=56",
      titleContext: buildNotificationTitleContextFromMessage(secondMessage, 7),
    });

    expect(first).toMatchObject({
      tag: buildNotificationAggregateTag("stream:10:Bugs:sender:42"),
      count: 1,
      lastMessageId: 55,
      latestBody: "Hello",
    });
    expect(second).toMatchObject({
      tag: buildNotificationAggregateTag("stream:10:Bugs:sender:42"),
      count: 2,
      lastMessageId: 56,
      latestBody: "Latest",
      latestClickRoute: "/stream/10-general-discussion/topic/Bugs?msg=56",
    });
  });

  it("restores the previous latest message when the newest one is read", () => {
    const firstMessage = createStreamMessage();
    const secondMessage = createStreamMessage({
      id: 56,
      content: "<p>Latest</p>",
    });

    upsertNotificationAggregate({
      message: firstMessage,
      currentUserId: 7,
      body: "Hello",
      clickRoute: "/stream/10-general-discussion/topic/Bugs?msg=55",
      titleContext: buildNotificationTitleContextFromMessage(firstMessage, 7),
    });
    upsertNotificationAggregate({
      message: secondMessage,
      currentUserId: 7,
      body: "Latest",
      clickRoute: "/stream/10-general-discussion/topic/Bugs?msg=56",
      titleContext: buildNotificationTitleContextFromMessage(secondMessage, 7),
    });

    const result = consumeReadMessagesFromNotificationAggregates([56]);

    expect(result.closedTags).toEqual([]);
    expect(result.untrackedMessageIds).toEqual([]);
    expect(result.updatedSnapshots).toEqual([
      {
        tag: "bucket:stream:10:Bugs:sender:42",
        count: 1,
        lastMessageId: 55,
        latestBody: "Hello",
        latestClickRoute: "/stream/10-general-discussion/topic/Bugs?msg=55",
        titleContext: {
          kind: "stream",
          senderName: "Alice",
          channelName: "General Discussion",
          topicName: "Bugs",
        },
      },
    ]);
  });

  it("returns untracked message ids for fallback notifications", () => {
    const result = consumeReadMessagesFromNotificationAggregates([101, 101, 0, -1]);

    expect(result.closedTags).toEqual([]);
    expect(result.updatedSnapshots).toEqual([]);
    expect(result.untrackedMessageIds).toEqual([101]);
  });
});
