import { describe, expect, it, vi } from "vitest";
import type { ZulipRawMessage } from "~/shared/api/zulip.types";
import { deliverDesktopNotificationForMessage } from "./layout-zulip-event-notify.lib";
import type { LayoutZulipEventDispatchContext } from "./layout-zulip-event-dispatch.types";

function createNotifications(): LayoutZulipEventDispatchContext["notifications"] {
  return {
    show: vi.fn().mockResolvedValue(undefined),
    closeByTag: vi.fn(),
    playSound: vi.fn(),
    getSoundPreset: vi.fn(() => "default"),
    requestAttentionIfNotFocused: vi.fn(),
  };
}

function createRawMessage(overrides: Partial<ZulipRawMessage> = {}): ZulipRawMessage {
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

describe("deliverDesktopNotificationForMessage", () => {
  it("passes a focused stream topic route to native notification options", () => {
    const notifications = createNotifications();

    deliverDesktopNotificationForMessage(createRawMessage(), notifications, false, "default", 7);

    expect(notifications.show).toHaveBeenCalledWith({
      title: "Alice",
      body: "Hello",
      tag: "msg-55",
      silent: true,
      clickRoute: "/stream/10-general-discussion/topic/Bugs?msg=55",
    });
  });

  it("passes a focused DM route with recipient slug to native notification options", () => {
    const notifications = createNotifications();

    deliverDesktopNotificationForMessage(
      createRawMessage({
        id: 77,
        type: "private",
        stream_id: null,
        subject: "",
        display_recipient: [
          { id: 7, full_name: "You" },
          { id: 42, full_name: "Alice" },
        ],
      }),
      notifications,
      false,
      "default",
      7,
    );

    expect(notifications.show).toHaveBeenCalledWith({
      title: "Alice",
      body: "Hello",
      tag: "msg-77",
      silent: true,
      clickRoute: "/dm/42-alice?msg=77",
    });
  });

  it("omits clickRoute when the message cannot be mapped to a chat route", () => {
    const notifications = createNotifications();

    deliverDesktopNotificationForMessage(
      createRawMessage({
        type: "private",
        stream_id: null,
        subject: "",
        display_recipient: undefined,
      }),
      notifications,
      false,
      "default",
      7,
    );

    expect(notifications.show).toHaveBeenCalledWith({
      title: "Alice",
      body: "Hello",
      tag: "msg-55",
      silent: true,
    });
  });
});
