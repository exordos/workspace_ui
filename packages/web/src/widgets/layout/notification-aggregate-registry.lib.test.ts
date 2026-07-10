import { beforeEach, describe, expect, it } from "vitest";
import type { MessengerBackgroundNotificationCandidate } from "~/entities/messenger/messenger-background-projection.model";
import {
  buildNotificationAggregateTag,
  buildNotificationBucketKeyFromCandidate,
  clearNotificationAggregateRegistry,
  consumeNotificationAggregateByTag,
  consumeReadMessagesFromNotificationAggregates,
  upsertNotificationAggregate,
} from "./notification-aggregate-registry.lib";
import type { NotificationTitleContext } from "./layout-notification-title.lib";

const CHANNEL_TITLE_CONTEXT: NotificationTitleContext = {
  kind: "stream",
  senderName: "Alice",
  channelName: "General",
  topicName: "Bugs",
};

const DM_TITLE_CONTEXT: NotificationTitleContext = {
  kind: "dm",
  senderName: "Alice",
  conversationName: "Alice",
};

function createCandidate(
  overrides: Partial<MessengerBackgroundNotificationCandidate> = {},
): MessengerBackgroundNotificationCandidate {
  const messageUuid = overrides.messageUuid ?? "msg-1";
  const projectId = overrides.projectId ?? "project-1";

  return {
    ownerKey: "owner-1",
    organizationId: "org-1",
    projectId,
    epochVersion: 1,
    messageUuid,
    streamUuid: "stream-1",
    topicUuid: "topic-1",
    authorUuid: "user-1",
    isOwn: false,
    read: false,
    createdAt: "2026-07-07T10:00:00.000Z",
    previewText: "Hello",
    audience: "channel",
    streamName: "General",
    topicName: "Bugs",
    messageRoute: `/project/${projectId}/message/${messageUuid}`,
    streamRoute: `/project/${projectId}/stream/stream-1`,
    topicRoute: `/project/${projectId}/topic/topic-1`,
    streamConversationId: "dm:user-1,user-2",
    topicConversationId: "topic:stream-1:bugs",
    streamNotificationMode: null,
    topicNotificationMode: null,
    observedAt: 1,
    ...overrides,
  };
}

beforeEach(() => {
  clearNotificationAggregateRegistry();
});

describe("buildNotificationBucketKeyFromCandidate", () => {
  it("uses conversation bucket for private messages", () => {
    const first = buildNotificationBucketKeyFromCandidate(
      createCandidate({
        audience: "private",
        authorUuid: "user-1",
        streamConversationId: "dm:user-1,user-2",
        topicConversationId: "topic:ignored",
      }),
    );
    const second = buildNotificationBucketKeyFromCandidate(
      createCandidate({
        messageUuid: "msg-2",
        audience: "private",
        authorUuid: "user-9",
        streamConversationId: "dm:user-1,user-2",
        topicConversationId: "topic:other",
      }),
    );

    expect(first).toBe("owner-1::dm:user-1,user-2");
    expect(second).toBe(first);
  });

  it("uses topic plus author bucket for channel messages", () => {
    const first = buildNotificationBucketKeyFromCandidate(
      createCandidate({
        audience: "channel",
        authorUuid: "user-1",
        topicConversationId: "topic:stream-1:bugs",
      }),
    );
    const sameAuthor = buildNotificationBucketKeyFromCandidate(
      createCandidate({
        messageUuid: "msg-2",
        audience: "channel",
        authorUuid: "user-1",
        topicConversationId: "topic:stream-1:bugs",
      }),
    );
    const otherAuthor = buildNotificationBucketKeyFromCandidate(
      createCandidate({
        messageUuid: "msg-3",
        audience: "channel",
        authorUuid: "user-2",
        topicConversationId: "topic:stream-1:bugs",
      }),
    );

    expect(first).toBe("owner-1::topic:stream-1:bugs:author:user-1");
    expect(sameAuthor).toBe(first);
    expect(otherAuthor).toBe("owner-1::topic:stream-1:bugs:author:user-2");
  });
});

describe("notification aggregate registry", () => {
  it("tracks the same messageUuid independently for different owners", () => {
    const ownerOne = upsertNotificationAggregate({
      candidate: createCandidate({
        ownerKey: "owner-1",
        messageUuid: "shared-uuid",
      }),
      body: "Owner one",
      titleContext: CHANNEL_TITLE_CONTEXT,
    });
    const ownerTwo = upsertNotificationAggregate({
      candidate: createCandidate({
        ownerKey: "owner-2",
        messageUuid: "shared-uuid",
      }),
      body: "Owner two",
      titleContext: CHANNEL_TITLE_CONTEXT,
    });

    expect(ownerOne).toMatchObject({
      tag: "bucket:owner-1::topic:stream-1:bugs:author:user-1",
      count: 1,
      lastMessageUuid: "shared-uuid",
      latestBody: "Owner one",
    });
    expect(ownerTwo).toMatchObject({
      tag: "bucket:owner-2::topic:stream-1:bugs:author:user-1",
      count: 1,
      lastMessageUuid: "shared-uuid",
      latestBody: "Owner two",
    });

    const ownerTwoRead = consumeReadMessagesFromNotificationAggregates(["shared-uuid"], "owner-2");
    const ownerOneRead = consumeReadMessagesFromNotificationAggregates(["shared-uuid"], "owner-1");

    expect(ownerTwoRead.closedTags).toEqual(["bucket:owner-2::topic:stream-1:bugs:author:user-1"]);
    expect(ownerTwoRead.untrackedMessageUuids).toEqual([]);
    expect(ownerOneRead.closedTags).toEqual(["bucket:owner-1::topic:stream-1:bugs:author:user-1"]);
    expect(ownerOneRead.untrackedMessageUuids).toEqual([]);
  });

  it("updates aggregate snapshot after reading the newest message", () => {
    upsertNotificationAggregate({
      candidate: createCandidate({
        messageUuid: "msg-1",
      }),
      body: "First",
      clickRoute: "/project/project-1/message/msg-1",
      titleContext: CHANNEL_TITLE_CONTEXT,
    });
    upsertNotificationAggregate({
      candidate: createCandidate({
        messageUuid: "msg-2",
      }),
      body: "Second",
      clickRoute: "/project/project-1/message/msg-2",
      titleContext: CHANNEL_TITLE_CONTEXT,
    });

    const result = consumeReadMessagesFromNotificationAggregates(["msg-2"], "owner-1");

    expect(result.closedTags).toEqual([]);
    expect(result.untrackedMessageUuids).toEqual([]);
    expect(result.updatedSnapshots).toEqual([
      {
        tag: "bucket:owner-1::topic:stream-1:bugs:author:user-1",
        count: 1,
        lastMessageUuid: "msg-1",
        latestBody: "First",
        latestClickRoute: "/project/project-1/message/msg-1",
        titleContext: CHANNEL_TITLE_CONTEXT,
      },
    ]);
  });

  it("consumes an aggregate by tag and returns all message UUIDs", () => {
    upsertNotificationAggregate({
      candidate: createCandidate({ messageUuid: "msg-1" }),
      body: "First",
      titleContext: CHANNEL_TITLE_CONTEXT,
    });
    upsertNotificationAggregate({
      candidate: createCandidate({ messageUuid: "msg-2" }),
      body: "Second",
      titleContext: CHANNEL_TITLE_CONTEXT,
    });

    const tag = buildNotificationAggregateTag("owner-1::topic:stream-1:bugs:author:user-1");

    expect(consumeNotificationAggregateByTag(tag)).toEqual(["msg-1", "msg-2"]);
    expect(consumeNotificationAggregateByTag(tag)).toEqual([]);
    expect(consumeReadMessagesFromNotificationAggregates(["msg-1", "msg-2"], "owner-1")).toEqual({
      closedTags: [],
      updatedSnapshots: [],
      untrackedMessageUuids: ["msg-1", "msg-2"],
    });
  });

  it("returns untracked UUIDs for messages outside aggregate registry", () => {
    const result = consumeReadMessagesFromNotificationAggregates(
      ["msg-404", "msg-404", "", "   "],
      "owner-1",
    );

    expect(result.closedTags).toEqual([]);
    expect(result.updatedSnapshots).toEqual([]);
    expect(result.untrackedMessageUuids).toEqual(["msg-404"]);
  });

  it("keeps private conversation messages in one aggregate bucket", () => {
    const first = upsertNotificationAggregate({
      candidate: createCandidate({
        messageUuid: "dm-1",
        audience: "private",
        streamConversationId: "dm:user-1,user-2",
        topicConversationId: "topic:unused",
        authorUuid: "user-1",
      }),
      body: "Ping",
      titleContext: DM_TITLE_CONTEXT,
    });
    const second = upsertNotificationAggregate({
      candidate: createCandidate({
        messageUuid: "dm-2",
        audience: "private",
        streamConversationId: "dm:user-1,user-2",
        topicConversationId: "topic:other",
        authorUuid: "user-9",
      }),
      body: "Pong",
      titleContext: DM_TITLE_CONTEXT,
    });

    expect(first).toMatchObject({
      tag: buildNotificationAggregateTag("owner-1::dm:user-1,user-2"),
      count: 1,
      lastMessageUuid: "dm-1",
    });
    expect(second).toMatchObject({
      tag: buildNotificationAggregateTag("owner-1::dm:user-1,user-2"),
      count: 2,
      lastMessageUuid: "dm-2",
      latestBody: "Pong",
    });
  });
});
