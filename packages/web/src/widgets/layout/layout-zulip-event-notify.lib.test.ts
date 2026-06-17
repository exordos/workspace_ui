import { beforeEach, describe, expect, it, vi } from "vitest";
import { useNotificationSettingsStore } from "~/entities/notification-settings/notification-settings.model";
import { useMuteStore } from "~/features/mute-chat/mute-chat.model";
import type { ZulipRawMessage } from "~/shared/api/zulip.types";
import { DEFAULT_ZULIP_NOTIFICATION_SETTINGS } from "~/shared/lib/zulip-notification-settings.lib";
import {
  deliverDesktopNotificationForMessage,
  maybeNotifyNewMessage,
} from "./layout-zulip-event-notify.lib";
import { clearNotificationAggregateRegistry } from "./notification-aggregate-registry.lib";
import type { LayoutZulipEventDispatchContext } from "./layout-zulip-event-dispatch.types";

type MuteStoreState = ReturnType<typeof useMuteStore.getState>;
type MuteSnapshotInput = Parameters<MuteStoreState["setFromServer"]>[0];

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

function setMuteSnapshot(overrides: Partial<MuteSnapshotInput> = {}): void {
  useMuteStore.getState().setFromServer({
    mutedStreamIds: [],
    mutedTopics: [],
    unmutedTopics: [],
    followedTopics: [],
    streamDesktopNotifyEnabledIds: [],
    streamDesktopNotifyDisabledIds: [],
    streamAudibleNotifyEnabledIds: [],
    streamAudibleNotifyDisabledIds: [],
    ...overrides,
  });
}

function createContext(notifications = createNotifications()): LayoutZulipEventDispatchContext {
  return {
    currentInstanceId: "inst-1",
    chatList: {
      currentUserId: 7,
      streamsMap: new Map(),
      addMessage: vi.fn(),
      upsertStreamMetadataRows: vi.fn(),
      renameStream: vi.fn(),
      moveStreamTopic: vi.fn(),
      moveTopicToStream: vi.fn(),
      removeStream: vi.fn(),
      decrementUnreadForMessages: vi.fn(),
      incrementUnreadForMessages: vi.fn(),
      handleDeleteMessages: vi.fn(),
    },
    currentChat: {
      context: null,
      hasNewerMessages: false,
      appendMessage: vi.fn(),
      updateMessageFlags: vi.fn(),
      updateMessageReaction: vi.fn(),
      removeMessages: vi.fn(),
      updateMessageContent: vi.fn(),
      updateMessageLinkPreview: vi.fn(),
      moveStreamTopicMessages: vi.fn(),
      moveTopicToStreamMessages: vi.fn(),
    },
    users: {
      mergeFromMessage: vi.fn(),
      setPresenceByEmail: vi.fn(),
      setStatus: vi.fn(),
    },
    typing: { setTyping: vi.fn() },
    mute: useMuteStore.getState(),
    activity: {
      markStale: vi.fn(),
      markStarredSummaryStale: vi.fn(),
      applyStarredSummaryFlagEvent: vi.fn(),
    },
    inbox: {
      markStale: vi.fn(),
      markAsRead: vi.fn(),
      clearEntries: vi.fn(),
    },
    notifications,
    jitsiCall: { ingestIncomingInvite: vi.fn() },
    updateLatestMessageId: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useMuteStore.getState().clear();
  useNotificationSettingsStore.getState().clear();
  clearNotificationAggregateRegistry();
});

describe("deliverDesktopNotificationForMessage", () => {
  it("passes a focused stream topic route to native notification options", () => {
    const notifications = createNotifications();

    deliverDesktopNotificationForMessage(
      createRawMessage(),
      notifications,
      false,
      "default",
      7,
      "inst-1",
    );

    expect(notifications.show).toHaveBeenCalledWith({
      title: "Alice · General Discussion · Bugs",
      body: "Hello",
      tag: "bucket:inst-1::stream:10:Bugs:sender:42",
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
      "inst-1",
    );

    expect(notifications.show).toHaveBeenCalledWith({
      title: "Alice",
      body: "Hello",
      tag: "bucket:inst-1::dm:7,42",
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
      "inst-1",
    );

    expect(notifications.show).toHaveBeenCalledWith({
      title: "Alice",
      body: "Hello",
      tag: "msg:inst-1::55",
      silent: true,
    });
  });
});

describe("maybeNotifyNewMessage", () => {
  it("suppresses a normal stream message in a muted channel", () => {
    setMuteSnapshot({ mutedStreamIds: [10] });
    const notifications = createNotifications();

    maybeNotifyNewMessage(createContext(notifications), createRawMessage(), 7, false, false);

    expect(notifications.show).not.toHaveBeenCalled();
  });

  it("suppresses a stream mention in a muted channel", () => {
    setMuteSnapshot({ mutedStreamIds: [10] });
    const notifications = createNotifications();

    maybeNotifyNewMessage(
      createContext(notifications),
      createRawMessage({ flags: ["mentioned"] }),
      7,
      false,
      false,
    );

    expect(notifications.show).not.toHaveBeenCalled();
  });

  it("suppresses a followed topic in a muted channel", () => {
    setMuteSnapshot({
      mutedStreamIds: [10],
      followedTopics: [{ streamId: 10, topic: "Bugs" }],
    });
    const notifications = createNotifications();

    maybeNotifyNewMessage(createContext(notifications), createRawMessage(), 7, false, false);

    expect(notifications.show).not.toHaveBeenCalled();
    expect(notifications.requestAttentionIfNotFocused).not.toHaveBeenCalled();
  });

  it("suppresses an unmuted topic in a muted channel", () => {
    setMuteSnapshot({
      mutedStreamIds: [10],
      unmutedTopics: [{ streamId: 10, topic: "Bugs" }],
      streamDesktopNotifyEnabledIds: [10],
    });
    const notifications = createNotifications();
    const ctx = createContext(notifications);

    maybeNotifyNewMessage(ctx, createRawMessage(), 7, false, false);
    maybeNotifyNewMessage(ctx, createRawMessage({ id: 56, flags: ["mentioned"] }), 7, false, false);

    expect(notifications.show).not.toHaveBeenCalled();
  });

  it("suppresses a normal stream message in a default channel", () => {
    const notifications = createNotifications();

    maybeNotifyNewMessage(createContext(notifications), createRawMessage(), 7, false, false);

    expect(notifications.show).not.toHaveBeenCalled();
  });

  it("allows a direct mention in a default channel", () => {
    const notifications = createNotifications();

    maybeNotifyNewMessage(
      createContext(notifications),
      createRawMessage({ flags: ["mentioned"] }),
      7,
      false,
      false,
    );

    expect(notifications.show).toHaveBeenCalledWith({
      title: "Alice · General Discussion · Bugs",
      body: "Hello",
      tag: "bucket:inst-1::stream:10:Bugs:sender:42",
      silent: true,
      clickRoute: "/stream/10-general-discussion/topic/Bugs?msg=55",
    });
  });

  it("allows a normal stream message in a subscribed channel", () => {
    setMuteSnapshot({
      streamDesktopNotifyEnabledIds: [10],
      streamAudibleNotifyEnabledIds: [10],
    });
    const notifications = createNotifications();

    maybeNotifyNewMessage(createContext(notifications), createRawMessage(), 7, false, false);

    expect(notifications.show).toHaveBeenCalledWith({
      title: "Alice · General Discussion · Bugs",
      body: "Hello",
      tag: "bucket:inst-1::stream:10:Bugs:sender:42",
      silent: true,
      clickRoute: "/stream/10-general-discussion/topic/Bugs?msg=55",
    });
    expect(notifications.playSound).toHaveBeenCalledWith("default");
  });

  it("suppresses a muted topic even in a subscribed channel", () => {
    setMuteSnapshot({
      mutedTopics: [{ streamId: 10, topic: "Bugs" }],
      streamDesktopNotifyEnabledIds: [10],
    });
    const notifications = createNotifications();

    maybeNotifyNewMessage(createContext(notifications), createRawMessage(), 7, false, false);

    expect(notifications.show).not.toHaveBeenCalled();
  });

  it("allows a followed topic when followed-topic desktop notifications are enabled", () => {
    setMuteSnapshot({ followedTopics: [{ streamId: 10, topic: "Bugs" }] });
    const notifications = createNotifications();

    maybeNotifyNewMessage(createContext(notifications), createRawMessage(), 7, false, false);

    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({
        tag: "bucket:inst-1::stream:10:Bugs:sender:42",
        clickRoute: "/stream/10-general-discussion/topic/Bugs?msg=55",
      }),
    );
  });

  it("aggregates repeated stream notifications from the same sender in one bucket", () => {
    setMuteSnapshot({
      streamDesktopNotifyEnabledIds: [10],
      streamAudibleNotifyEnabledIds: [10],
    });
    const notifications = createNotifications();
    const ctx = createContext(notifications);

    maybeNotifyNewMessage(ctx, createRawMessage(), 7, false, false);
    maybeNotifyNewMessage(
      ctx,
      createRawMessage({
        id: 56,
        content: "<p>Latest</p>",
      }),
      7,
      false,
      false,
    );

    expect(notifications.show).toHaveBeenCalledTimes(2);
    expect(notifications.show).toHaveBeenNthCalledWith(1, {
      title: "Alice · General Discussion · Bugs",
      body: "Hello",
      tag: "bucket:inst-1::stream:10:Bugs:sender:42",
      silent: true,
      clickRoute: "/stream/10-general-discussion/topic/Bugs?msg=55",
    });
    expect(notifications.show).toHaveBeenNthCalledWith(2, {
      title: "2 messages from Alice · General Discussion · Bugs",
      body: "Latest",
      tag: "bucket:inst-1::stream:10:Bugs:sender:42",
      silent: true,
      clickRoute: "/stream/10-general-discussion/topic/Bugs?msg=56",
    });
  });

  it("keeps separate stream notification buckets for different senders", () => {
    setMuteSnapshot({
      streamDesktopNotifyEnabledIds: [10],
      streamAudibleNotifyEnabledIds: [10],
    });
    const notifications = createNotifications();
    const ctx = createContext(notifications);

    maybeNotifyNewMessage(ctx, createRawMessage(), 7, false, false);
    maybeNotifyNewMessage(
      ctx,
      createRawMessage({
        id: 56,
        sender_id: 99,
        sender_full_name: "Bob",
      }),
      7,
      false,
      false,
    );

    expect(notifications.show).toHaveBeenCalledTimes(2);
    expect(notifications.show).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ tag: "bucket:inst-1::stream:10:Bugs:sender:42" }),
    );
    expect(notifications.show).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        title: "Bob · General Discussion · Bugs",
        tag: "bucket:inst-1::stream:10:Bugs:sender:99",
      }),
    );
  });

  it("keeps DM notifications on the global desktop policy", () => {
    const notifications = createNotifications();

    maybeNotifyNewMessage(
      createContext(notifications),
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
      7,
      false,
      false,
    );

    expect(notifications.show).toHaveBeenCalledWith({
      title: "Alice",
      body: "Hello",
      tag: "bucket:inst-1::dm:7,42",
      silent: true,
      clickRoute: "/dm/42-alice?msg=77",
    });
  });

  it("suppresses DMs when global desktop notifications are disabled", () => {
    useNotificationSettingsStore.setState({
      settings: { ...DEFAULT_ZULIP_NOTIFICATION_SETTINGS, enableDesktopNotifications: false },
      hydrated: true,
    });
    const notifications = createNotifications();

    maybeNotifyNewMessage(
      createContext(notifications),
      createRawMessage({
        type: "private",
        stream_id: null,
        subject: "",
        display_recipient: [{ id: 42, full_name: "Alice" }],
      }),
      7,
      false,
      false,
    );

    expect(notifications.show).not.toHaveBeenCalled();
  });

  it("keeps identical notifications isolated across instances", () => {
    setMuteSnapshot({
      streamDesktopNotifyEnabledIds: [10],
      streamAudibleNotifyEnabledIds: [10],
    });
    const notificationsA = createNotifications();
    const notificationsB = createNotifications();

    maybeNotifyNewMessage(createContext(notificationsA), createRawMessage(), 7, false, false);
    maybeNotifyNewMessage(
      { ...createContext(notificationsB), currentInstanceId: "inst-2" },
      createRawMessage(),
      7,
      false,
      false,
    );

    expect(notificationsA.show).toHaveBeenCalledWith(
      expect.objectContaining({ tag: "bucket:inst-1::stream:10:Bugs:sender:42" }),
    );
    expect(notificationsB.show).toHaveBeenCalledWith(
      expect.objectContaining({ tag: "bucket:inst-2::stream:10:Bugs:sender:42" }),
    );
  });
});
