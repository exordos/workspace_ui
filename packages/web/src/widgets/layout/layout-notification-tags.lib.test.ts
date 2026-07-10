import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MessengerBackgroundNotificationCandidate } from "~/entities/messenger/messenger-background-projection.model";
import {
  closeAllActiveMessageNotifications,
  closeReadMessageNotifications,
} from "./layout-notification-tags.lib";
import {
  formatNotificationTitle,
  type NotificationTitleContext,
} from "./layout-notification-title.lib";
import {
  buildNotificationAggregateTag,
  clearNotificationAggregateRegistry,
  consumeNotificationAggregateByTag,
  upsertNotificationAggregate,
} from "./notification-aggregate-registry.lib";

const CHANNEL_TITLE_CONTEXT: NotificationTitleContext = {
  kind: "stream",
  senderName: "Alice",
  channelName: "General",
  topicName: "Bugs",
};

function createNotifications(): {
  show: ReturnType<
    typeof vi.fn<
      (options: {
        title: string;
        body: string;
        tag: string;
        silent?: boolean;
        clickRoute?: string;
      }) => Promise<void>
    >
  >;
  closeByTag: ReturnType<typeof vi.fn<(tag: string) => void>>;
} {
  return {
    show: vi
      .fn<
        (options: {
          title: string;
          body: string;
          tag: string;
          silent?: boolean;
          clickRoute?: string;
        }) => Promise<void>
      >()
      .mockResolvedValue(undefined),
    closeByTag: vi.fn<(tag: string) => void>(),
  };
}

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
  vi.clearAllMocks();
  clearNotificationAggregateRegistry();
});

describe("closeReadMessageNotifications", () => {
  it("closes fallback notifications by ownerKey and messageUuid", () => {
    const notifications = createNotifications();

    closeReadMessageNotifications(notifications, ["msg-101", "msg-202"], "owner-1");

    expect(notifications.closeByTag).toHaveBeenCalledTimes(2);
    expect(notifications.closeByTag).toHaveBeenNthCalledWith(1, "msg:owner-1::msg-101");
    expect(notifications.closeByTag).toHaveBeenNthCalledWith(2, "msg:owner-1::msg-202");
  });

  it("deduplicates UUIDs and ignores blank values for fallback close", () => {
    const notifications = createNotifications();

    closeReadMessageNotifications(notifications, ["msg-101", "msg-101", "", "   "], "owner-1");

    expect(notifications.closeByTag).toHaveBeenCalledTimes(1);
    expect(notifications.closeByTag).toHaveBeenCalledWith("msg:owner-1::msg-101");
  });

  it("updates aggregate notification after partial read", async () => {
    const notifications = createNotifications();

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

    closeReadMessageNotifications(notifications, ["msg-2"], "owner-1");

    expect(notifications.closeByTag).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(notifications.show).toHaveBeenCalledWith({
        title: formatNotificationTitle(CHANNEL_TITLE_CONTEXT, 1),
        body: "First",
        tag: "bucket:owner-1::topic:stream-1:bugs:author:user-1",
        silent: true,
        clickRoute: "/project/project-1/message/msg-1",
      });
    });
  });

  it("does not show old aggregate messages after the aggregate was dismissed", async () => {
    const notifications = createNotifications();

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

    closeReadMessageNotifications(notifications, ["msg-2"], "owner-1");
    closeReadMessageNotifications(notifications, ["msg-1"], "owner-1");
    await Promise.resolve();

    expect(notifications.show).not.toHaveBeenCalled();
  });

  it("closes aggregate bucket by UUID when the last unread message is read", () => {
    const notifications = createNotifications();

    upsertNotificationAggregate({
      candidate: createCandidate({
        messageUuid: "msg-1",
      }),
      body: "First",
      titleContext: CHANNEL_TITLE_CONTEXT,
    });

    closeReadMessageNotifications(notifications, ["msg-1"], "owner-1");

    expect(notifications.closeByTag).toHaveBeenCalledTimes(1);
    expect(notifications.closeByTag).toHaveBeenCalledWith(
      "bucket:owner-1::topic:stream-1:bugs:author:user-1",
    );
    expect(notifications.show).not.toHaveBeenCalled();
  });

  it("does not mix the same messageUuid across owners", () => {
    const notifications = createNotifications();

    upsertNotificationAggregate({
      candidate: createCandidate({
        ownerKey: "owner-1",
        messageUuid: "shared-uuid",
      }),
      body: "Owner one",
      titleContext: CHANNEL_TITLE_CONTEXT,
    });
    upsertNotificationAggregate({
      candidate: createCandidate({
        ownerKey: "owner-2",
        messageUuid: "shared-uuid",
      }),
      body: "Owner two",
      titleContext: CHANNEL_TITLE_CONTEXT,
    });

    closeReadMessageNotifications(notifications, ["shared-uuid"], "owner-2");

    expect(notifications.closeByTag).toHaveBeenCalledTimes(1);
    expect(notifications.closeByTag).toHaveBeenCalledWith(
      "bucket:owner-2::topic:stream-1:bugs:author:user-1",
    );

    closeReadMessageNotifications(notifications, ["shared-uuid"], "owner-1");

    expect(notifications.closeByTag).toHaveBeenCalledTimes(2);
    expect(notifications.closeByTag).toHaveBeenLastCalledWith(
      "bucket:owner-1::topic:stream-1:bugs:author:user-1",
    );
  });
});

describe("closeAllActiveMessageNotifications", () => {
  it("closes only aggregate buckets for the requested owner", () => {
    const notifications = createNotifications();

    upsertNotificationAggregate({
      candidate: createCandidate({
        ownerKey: "owner-1",
        messageUuid: "msg-1",
      }),
      body: "Owner one",
      titleContext: CHANNEL_TITLE_CONTEXT,
    });
    upsertNotificationAggregate({
      candidate: createCandidate({
        ownerKey: "owner-2",
        messageUuid: "msg-2",
      }),
      body: "Owner two",
      titleContext: CHANNEL_TITLE_CONTEXT,
    });

    closeAllActiveMessageNotifications(notifications, "owner-1");

    expect(notifications.closeByTag).toHaveBeenCalledTimes(1);
    expect(notifications.closeByTag).toHaveBeenCalledWith(
      buildNotificationAggregateTag("owner-1::topic:stream-1:bugs:author:user-1"),
    );
  });
});
