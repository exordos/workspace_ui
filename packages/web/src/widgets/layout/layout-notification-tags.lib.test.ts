import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ZulipRawMessage } from "~/shared/api/zulip.types";
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

beforeEach(() => {
  vi.clearAllMocks();
  clearNotificationAggregateRegistry();
});

describe("closeReadMessageNotifications", () => {
  it("closes fallback message notifications for untracked read message ids", () => {
    const notifications = createNotifications();

    closeReadMessageNotifications(notifications, [101, 202, 303], "inst-1");

    expect(notifications.closeByTag).toHaveBeenCalledTimes(3);
    expect(notifications.closeByTag).toHaveBeenNthCalledWith(1, "msg:inst-1::101");
    expect(notifications.closeByTag).toHaveBeenNthCalledWith(2, "msg:inst-1::202");
    expect(notifications.closeByTag).toHaveBeenNthCalledWith(3, "msg:inst-1::303");
  });

  it("deduplicates IDs and ignores invalid values", () => {
    const notifications = createNotifications();

    closeReadMessageNotifications(notifications, [101, 101, 0, -1, Number.NaN], "inst-1");

    expect(notifications.closeByTag).toHaveBeenCalledTimes(1);
    expect(notifications.closeByTag).toHaveBeenCalledWith("msg:inst-1::101");
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

    closeReadMessageNotifications(notifications, [56], "inst-1");

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

    closeReadMessageNotifications(notifications, [55], "inst-1");

    expect(notifications.closeByTag).toHaveBeenCalledTimes(1);
    expect(notifications.closeByTag).toHaveBeenCalledWith(
      "bucket:inst-1::stream:10:Bugs:sender:42",
    );
    expect(notifications.show).not.toHaveBeenCalled();
  });

  it("closes all active buckets on mark all read", () => {
    const notifications = createNotifications();

    const first = createStreamMessage();
    const second = createStreamMessage({ id: 56, sender_id: 99, sender_full_name: "Bob" });

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

    closeReadMessageNotifications(notifications, [101], "inst-2");

    expect(notifications.closeByTag).toHaveBeenCalledWith("msg:inst-2::101");
  });
});
