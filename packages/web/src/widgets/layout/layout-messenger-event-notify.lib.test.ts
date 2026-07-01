import { beforeEach, describe, expect, it, vi } from "vitest";
import { useNotificationSettingsStore } from "~/entities/notification-settings/notification-settings.model";
import { useMuteStore } from "~/features/mute-chat/mute-chat.model";
import type { WorkspaceRawMessage } from "~/shared/api/messenger.types";
import { DEFAULT_MESSENGER_NOTIFICATION_SETTINGS } from "~/shared/lib/messenger-notification-settings.lib";
import { testMessageId } from "~/test/factories";
import {
  deliverDesktopNotificationForMessage,
  maybeNotifyNewMessage,
} from "./layout-messenger-event-notify.lib";
import { clearNotificationAggregateRegistry } from "./notification-aggregate-registry.lib";
import type { LayoutMessengerEventDispatchContext } from "./layout-messenger-event-dispatch.types";

const STREAM_UUID = "00000000-0000-4000-8000-000000000010";

type MuteStoreState = ReturnType<typeof useMuteStore.getState>;
type MuteSnapshotInput = Parameters<MuteStoreState["setFromServer"]>[0];

function createNotifications(): LayoutMessengerEventDispatchContext["notifications"] {
  return {
    show: vi.fn().mockResolvedValue(undefined),
    closeByTag: vi.fn(),
    playSound: vi.fn(),
    getSoundPreset: vi.fn(() => "default"),
    requestAttentionIfNotFocused: vi.fn(),
  };
}

type WorkspaceRawMessageOverrides = Partial<Omit<WorkspaceRawMessage, "id">> & {
  id?: WorkspaceRawMessage["id"] | number;
};

function createRawMessage(overrides: WorkspaceRawMessageOverrides = {}): WorkspaceRawMessage {
  const { id, ...rest } = overrides;
  return {
    id: testMessageId(id ?? 55),
    sender_id: 42,
    sender_full_name: "Alice",
    content: "<p>Hello</p>",
    timestamp: 1,
    type: "stream",
    stream_uuid: STREAM_UUID,
    display_recipient: "General Discussion",
    subject: "Bugs",
    flags: [],
    ...rest,
  };
}

function setMuteSnapshot(overrides: Partial<MuteSnapshotInput> = {}): void {
  useMuteStore.getState().setFromServer({
    mutedStreamIds: [],
    streamNotificationModes: [],
    topicNotificationModes: [],
    ...overrides,
  });
}

function createContext(notifications = createNotifications()): LayoutMessengerEventDispatchContext {
  return {
    currentInstanceId: "inst-1",
    chatList: {
      currentUserId: 7,
      streamsMap: new Map(),
      addMessage: vi.fn(),
      upsertStreamTopicShells: vi.fn(),
      upsertStreamMetadataRows: vi.fn(),
      renameStream: vi.fn(),
      moveStreamTopic: vi.fn(),
      moveTopicToStream: vi.fn(),
      removeStreamTopic: vi.fn(),
      removeStream: vi.fn(),
      handleDeleteMessages: vi.fn(),
    },
    currentChat: {
      context: null,
      hasNewerMessages: false,
      appendMessage: vi.fn(),
      updateMessageFlags: vi.fn(),
      replaceMessageReactions: vi.fn(),
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
      tag: `bucket:inst-1::stream:${STREAM_UUID}:Bugs:sender:42`,
      silent: true,
      clickRoute: `/stream/${STREAM_UUID}/topic/Bugs?msg=${testMessageId(55)}`,
    });
  });

  it("passes a focused DM route with recipient slug to native notification options", () => {
    const notifications = createNotifications();

    deliverDesktopNotificationForMessage(
      createRawMessage({
        id: "00000000-0000-4000-8000-000000000077",
        type: "private",
        stream_uuid: null,
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
      clickRoute: `/dm/42-alice?msg=${testMessageId(77)}`,
    });
  });

  it("omits clickRoute when the message cannot be mapped to a chat route", () => {
    const notifications = createNotifications();

    deliverDesktopNotificationForMessage(
      createRawMessage({
        type: "private",
        stream_uuid: null,
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
      tag: `msg:inst-1::${testMessageId(55)}`,
      silent: true,
    });
  });
});

describe("maybeNotifyNewMessage", () => {
  it("suppresses a normal stream message in a muted channel", () => {
    setMuteSnapshot({ streamNotificationModes: [{ streamId: STREAM_UUID, mode: "muted" }] });
    const notifications = createNotifications();

    maybeNotifyNewMessage(createContext(notifications), createRawMessage(), 7, false, false);

    expect(notifications.show).not.toHaveBeenCalled();
  });

  it("suppresses a stream mention in a muted channel", () => {
    setMuteSnapshot({ streamNotificationModes: [{ streamId: STREAM_UUID, mode: "muted" }] });
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
      streamNotificationModes: [{ streamId: STREAM_UUID, mode: "muted" }],
      topicNotificationModes: [{ streamId: STREAM_UUID, topic: "Bugs", mode: "follow" }],
    });
    const notifications = createNotifications();

    maybeNotifyNewMessage(createContext(notifications), createRawMessage(), 7, false, false);

    expect(notifications.show).not.toHaveBeenCalled();
    expect(notifications.requestAttentionIfNotFocused).not.toHaveBeenCalled();
  });

  it("suppresses an unmuted topic in a muted channel", () => {
    setMuteSnapshot({
      streamNotificationModes: [{ streamId: STREAM_UUID, mode: "muted" }],
      topicNotificationModes: [{ streamId: STREAM_UUID, topic: "Bugs", mode: "unmute" }],
    });
    const notifications = createNotifications();
    const ctx = createContext(notifications);

    maybeNotifyNewMessage(ctx, createRawMessage(), 7, false, false);
    maybeNotifyNewMessage(
      ctx,
      createRawMessage({ id: "00000000-0000-4000-8000-000000000056", flags: ["mentioned"] }),
      7,
      false,
      false,
    );

    expect(notifications.show).not.toHaveBeenCalled();
  });

  it("suppresses a normal stream message in a default channel", () => {
    setMuteSnapshot({
      streamNotificationModes: [{ streamId: STREAM_UUID, mode: "mentions_only" }],
    });
    const notifications = createNotifications();

    maybeNotifyNewMessage(createContext(notifications), createRawMessage(), 7, false, false);

    expect(notifications.show).not.toHaveBeenCalled();
  });

  it("allows a direct mention in a default channel", () => {
    setMuteSnapshot({
      streamNotificationModes: [{ streamId: STREAM_UUID, mode: "mentions_only" }],
    });
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
      tag: `bucket:inst-1::stream:${STREAM_UUID}:Bugs:sender:42`,
      silent: true,
      clickRoute: `/stream/${STREAM_UUID}/topic/Bugs?msg=${testMessageId(55)}`,
    });
  });

  it("allows a normal stream message in a subscribed channel", () => {
    setMuteSnapshot({
      streamNotificationModes: [{ streamId: STREAM_UUID, mode: "all_messages" }],
    });
    const notifications = createNotifications();

    maybeNotifyNewMessage(createContext(notifications), createRawMessage(), 7, false, false);

    expect(notifications.show).toHaveBeenCalledWith({
      title: "Alice · General Discussion · Bugs",
      body: "Hello",
      tag: `bucket:inst-1::stream:${STREAM_UUID}:Bugs:sender:42`,
      silent: true,
      clickRoute: `/stream/${STREAM_UUID}/topic/Bugs?msg=${testMessageId(55)}`,
    });
    expect(notifications.playSound).toHaveBeenCalledWith("default");
  });

  it("suppresses a muted topic even in a subscribed channel", () => {
    setMuteSnapshot({
      streamNotificationModes: [{ streamId: STREAM_UUID, mode: "all_messages" }],
      topicNotificationModes: [{ streamId: STREAM_UUID, topic: "Bugs", mode: "mute" }],
    });
    const notifications = createNotifications();

    maybeNotifyNewMessage(createContext(notifications), createRawMessage(), 7, false, false);

    expect(notifications.show).not.toHaveBeenCalled();
  });

  it("allows a followed topic when followed-topic desktop notifications are enabled", () => {
    setMuteSnapshot({
      topicNotificationModes: [{ streamId: STREAM_UUID, topic: "Bugs", mode: "follow" }],
    });
    const notifications = createNotifications();

    maybeNotifyNewMessage(createContext(notifications), createRawMessage(), 7, false, false);

    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({
        tag: `bucket:inst-1::stream:${STREAM_UUID}:Bugs:sender:42`,
        clickRoute: `/stream/${STREAM_UUID}/topic/Bugs?msg=${testMessageId(55)}`,
      }),
    );
  });

  it("aggregates repeated stream notifications from the same sender in one bucket", () => {
    setMuteSnapshot({
      streamNotificationModes: [{ streamId: STREAM_UUID, mode: "all_messages" }],
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
      tag: `bucket:inst-1::stream:${STREAM_UUID}:Bugs:sender:42`,
      silent: true,
      clickRoute: `/stream/${STREAM_UUID}/topic/Bugs?msg=${testMessageId(55)}`,
    });
    expect(notifications.show).toHaveBeenNthCalledWith(2, {
      title: "2 messages from Alice · General Discussion · Bugs",
      body: "Latest",
      tag: `bucket:inst-1::stream:${STREAM_UUID}:Bugs:sender:42`,
      silent: true,
      clickRoute: `/stream/${STREAM_UUID}/topic/Bugs?msg=${testMessageId(56)}`,
    });
  });

  it("keeps separate stream notification buckets for different senders", () => {
    setMuteSnapshot({
      streamNotificationModes: [{ streamId: STREAM_UUID, mode: "all_messages" }],
    });
    const notifications = createNotifications();
    const ctx = createContext(notifications);

    maybeNotifyNewMessage(ctx, createRawMessage(), 7, false, false);
    maybeNotifyNewMessage(
      ctx,
      createRawMessage({
        id: "00000000-0000-4000-8000-000000000056",
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
      expect.objectContaining({ tag: `bucket:inst-1::stream:${STREAM_UUID}:Bugs:sender:42` }),
    );
    expect(notifications.show).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        title: "Bob · General Discussion · Bugs",
        tag: `bucket:inst-1::stream:${STREAM_UUID}:Bugs:sender:99`,
      }),
    );
  });

  it("keeps DM notifications on the global desktop policy", () => {
    const notifications = createNotifications();

    maybeNotifyNewMessage(
      createContext(notifications),
      createRawMessage({
        id: "00000000-0000-4000-8000-000000000077",
        type: "private",
        stream_uuid: null,
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
      clickRoute: `/dm/42-alice?msg=${testMessageId(77)}`,
    });
  });

  it("suppresses DMs when global desktop notifications are disabled", () => {
    useNotificationSettingsStore.setState({
      settings: { ...DEFAULT_MESSENGER_NOTIFICATION_SETTINGS, enableDesktopNotifications: false },
      hydrated: true,
    });
    const notifications = createNotifications();

    maybeNotifyNewMessage(
      createContext(notifications),
      createRawMessage({
        type: "private",
        stream_uuid: null,
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
      streamNotificationModes: [{ streamId: STREAM_UUID, mode: "all_messages" }],
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
      expect.objectContaining({ tag: `bucket:inst-1::stream:${STREAM_UUID}:Bugs:sender:42` }),
    );
    expect(notificationsB.show).toHaveBeenCalledWith(
      expect.objectContaining({ tag: `bucket:inst-2::stream:${STREAM_UUID}:Bugs:sender:42` }),
    );
  });
});
