import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceRawMessage } from "~/shared/api/messenger.types";
import { testMessageId } from "~/test/factories";
import {
  closeAllActiveMessageNotifications,
  closeReadMessageNotifications,
} from "./layout-notification-tags.lib";
import { buildNotificationTitleContextFromMessage } from "./layout-notification-title.lib";
import {
  clearNotificationAggregateRegistry,
  upsertNotificationAggregate,
} from "./notification-aggregate-registry.lib";

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

type WorkspaceRawMessageOverrides = Partial<Omit<WorkspaceRawMessage, "id">> & {
  id?: WorkspaceRawMessage["id"] | number;
};

function createStreamMessage(overrides: WorkspaceRawMessageOverrides = {}): WorkspaceRawMessage {
  const { id, ...rest } = overrides;
  return {
    id: testMessageId(id ?? 55),
    sender_id: 42,
    sender_full_name: "Alice",
    content: "<p>Hello</p>",
    timestamp: 1,
    type: "stream",
    stream_id: 10,
    display_recipient: "General Discussion",
    subject: "Bugs",
    flags: [],
    ...rest,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clearNotificationAggregateRegistry();
});

describe("closeReadMessageNotifications", () => {
  it("closes fallback message notifications for untracked read message ids", () => {
    const notifications = createNotifications();
    const ids = [testMessageId(101), testMessageId(202), testMessageId(303)];

    closeReadMessageNotifications(notifications, ids, "inst-1");

    expect(notifications.closeByTag).toHaveBeenCalledTimes(3);
    expect(notifications.closeByTag).toHaveBeenNthCalledWith(1, `msg:inst-1::${ids[0]}`);
    expect(notifications.closeByTag).toHaveBeenNthCalledWith(2, `msg:inst-1::${ids[1]}`);
    expect(notifications.closeByTag).toHaveBeenNthCalledWith(3, `msg:inst-1::${ids[2]}`);
  });

  it("deduplicates IDs and ignores invalid values", () => {
    const notifications = createNotifications();
    const id = testMessageId(101);

    closeReadMessageNotifications(notifications, [id, id, "not-a-message-id"], "inst-1");

    expect(notifications.closeByTag).toHaveBeenCalledTimes(1);
    expect(notifications.closeByTag).toHaveBeenCalledWith(`msg:inst-1::${id}`);
  });

  it("updates the bucket notification when only part of it is read", async () => {
    const notifications = createNotifications();
    const first = createStreamMessage();
    const second = createStreamMessage({ id: 56, content: "<p>Latest</p>" });

    upsertNotificationAggregate({
      message: first,
      currentUserId: 7,
      currentInstanceId: "inst-1",
      body: "Hello",
      clickRoute: "/stream/10-general-discussion/topic/Bugs?msg=55",
      titleContext: buildNotificationTitleContextFromMessage(first, 7),
    });
    upsertNotificationAggregate({
      message: second,
      currentUserId: 7,
      currentInstanceId: "inst-1",
      body: "Latest",
      clickRoute: "/stream/10-general-discussion/topic/Bugs?msg=56",
      titleContext: buildNotificationTitleContextFromMessage(second, 7),
    });

    closeReadMessageNotifications(
      notifications,
      ["00000000-0000-4000-8000-000000000056"],
      "inst-1",
    );

    expect(notifications.closeByTag).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(notifications.show).toHaveBeenCalledWith({
        title: "Alice · General Discussion · Bugs",
        body: "Hello",
        tag: "bucket:inst-1::stream:10:Bugs:sender:42",
        silent: true,
        clickRoute: "/stream/10-general-discussion/topic/Bugs?msg=55",
      });
    });
  });

  it("closes the bucket notification when the last unread message is read", () => {
    const notifications = createNotifications();
    const message = createStreamMessage();

    upsertNotificationAggregate({
      message,
      currentUserId: 7,
      currentInstanceId: "inst-1",
      body: "Hello",
      clickRoute: "/stream/10-general-discussion/topic/Bugs?msg=55",
      titleContext: buildNotificationTitleContextFromMessage(message, 7),
    });

    closeReadMessageNotifications(
      notifications,
      ["00000000-0000-4000-8000-000000000055"],
      "inst-1",
    );

    expect(notifications.closeByTag).toHaveBeenCalledTimes(1);
    expect(notifications.closeByTag).toHaveBeenCalledWith(
      "bucket:inst-1::stream:10:Bugs:sender:42",
    );
    expect(notifications.show).not.toHaveBeenCalled();
  });

  it("closes all active buckets on mark all read", () => {
    const notifications = createNotifications();

    const first = createStreamMessage();
    const second = createStreamMessage({
      id: "00000000-0000-4000-8000-000000000056",
      sender_id: 99,
      sender_full_name: "Bob",
    });

    upsertNotificationAggregate({
      message: first,
      currentUserId: 7,
      currentInstanceId: "inst-1",
      body: "Hello",
      clickRoute: "/stream/10-general-discussion/topic/Bugs?msg=55",
      titleContext: buildNotificationTitleContextFromMessage(first, 7),
    });
    upsertNotificationAggregate({
      message: second,
      currentUserId: 7,
      currentInstanceId: "inst-1",
      body: "Other",
      clickRoute: "/stream/10-general-discussion/topic/Bugs?msg=56",
      titleContext: buildNotificationTitleContextFromMessage(second, 7),
    });

    closeAllActiveMessageNotifications(notifications, "inst-1");

    expect(notifications.closeByTag).toHaveBeenCalledTimes(2);
    expect(notifications.closeByTag).toHaveBeenCalledWith(
      "bucket:inst-1::stream:10:Bugs:sender:42",
    );
    expect(notifications.closeByTag).toHaveBeenCalledWith(
      "bucket:inst-1::stream:10:Bugs:sender:99",
    );
  });

  it("does not close fallback tags for another instance", () => {
    const notifications = createNotifications();

    closeReadMessageNotifications(
      notifications,
      ["00000000-0000-4000-8000-000000000101"],
      "inst-2",
    );

    expect(notifications.closeByTag).toHaveBeenCalledWith(
      "msg:inst-2::00000000-0000-4000-8000-000000000101",
    );
  });
});
