import { beforeEach, describe, expect, it } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import type { ZulipRawMessage } from "~/shared/api/zulip.types";
import {
  syncUnreadSurfacesFromDelta,
  syncUnreadSurfacesFromEventDelta,
  syncUnreadSurfacesFromSnapshot,
} from "./layout-unread-surfaces-sync.lib";

const INSTANCE_ID = "instance-sync-test";

function unreadStreamMessage(id: number): ZulipRawMessage {
  return {
    id,
    sender_id: 2,
    sender_full_name: "Alice",
    content: "",
    timestamp: id,
    type: "stream",
    stream_id: 5,
    display_recipient: "engineering",
    subject: "general",
    flags: [],
  };
}

function unreadDmMessage(id: number): ZulipRawMessage {
  return {
    id,
    sender_id: 2,
    sender_full_name: "Alice",
    content: "",
    timestamp: id,
    type: "private",
    display_recipient: [
      { id: 1, full_name: "Me", email: "me@example.com" },
      { id: 2, full_name: "Alice", email: "alice@example.com" },
    ],
    flags: [],
  };
}

beforeEach(() => {
  useChatListStore.getState().clear();
  useInstancesStore.setState({
    instances: [
      {
        id: INSTANCE_ID,
        realm: "https://zulip.example.com",
        email: "user@example.com",
        apiKey: "api-key",
      },
    ],
    currentInstanceId: INSTANCE_ID,
    unreadCountsByInstance: {},
    dmUnreadCountsByInstance: {},
    activeOrgEpoch: 0,
  });
});

describe("syncUnreadSurfacesFromEventDelta", () => {
  it("updates organization count after stream unread delta", () => {
    useChatListStore.getState().setCurrentUserId(1);

    syncUnreadSurfacesFromEventDelta({
      source: "event-message",
      instanceId: INSTANCE_ID,
      applyDelta: () => {
        useChatListStore.getState().addMessage(unreadStreamMessage(10));
      },
    });

    expect(useChatListStore.getState().sidebarStreamsUnread).toBe(1);
    expect(useInstancesStore.getState().getInstanceUnreadCount(INSTANCE_ID)).toBe(1);
  });

  it("keeps organization count muted-aware after stream unread delta", () => {
    useChatListStore.getState().setCurrentUserId(1);

    syncUnreadSurfacesFromEventDelta({
      source: "event-message",
      instanceId: INSTANCE_ID,
      isStreamMuted: (streamId) => streamId === 5,
      applyDelta: () => {
        useChatListStore.getState().addMessage(unreadStreamMessage(10));
      },
    });

    expect(useChatListStore.getState().sidebarStreamsUnread).toBe(1);
    expect(useInstancesStore.getState().getInstanceUnreadCount(INSTANCE_ID)).toBe(0);
  });

  it("lowers organization count after read decrement", () => {
    useChatListStore.getState().setCurrentUserId(1);
    useChatListStore.getState().addMessage(unreadStreamMessage(10));
    useInstancesStore.getState().setInstanceUnreadCount(INSTANCE_ID, 1);

    syncUnreadSurfacesFromEventDelta({
      source: "event-read-add",
      instanceId: INSTANCE_ID,
      applyDelta: () => {
        useChatListStore.getState().decrementUnreadForMessages([10]);
      },
    });

    expect(useChatListStore.getState().sidebarStreamsUnread).toBe(0);
    expect(useInstancesStore.getState().getInstanceUnreadCount(INSTANCE_ID)).toBe(0);
  });

  it("clears organization count after mark all read", () => {
    useChatListStore.getState().setCurrentUserId(1);
    useChatListStore.getState().reconcileUnreadFromSnapshot(
      {
        streams: [{ streamId: 5, topic: "general", unreadMessageIds: [10, 11] }],
        dms: [],
        totalCount: 2,
        mentionMessageIds: [],
      },
      1,
    );
    useInstancesStore.getState().setInstanceUnreadCount(INSTANCE_ID, 2);

    syncUnreadSurfacesFromEventDelta({
      source: "event-mark-all-read",
      instanceId: INSTANCE_ID,
      applyDelta: () => {
        useChatListStore
          .getState()
          .reconcileUnreadFromSnapshot(
            { streams: [], dms: [], totalCount: 0, mentionMessageIds: [] },
            1,
          );
      },
    });

    expect(useChatListStore.getState().sidebarStreamsUnread).toBe(0);
    expect(useInstancesStore.getState().getInstanceUnreadCount(INSTANCE_ID)).toBe(0);
  });

  it("updates personal organization indicator from fresh DM unread", () => {
    useChatListStore.getState().setCurrentUserId(1);

    syncUnreadSurfacesFromEventDelta({
      source: "event-message",
      instanceId: INSTANCE_ID,
      applyDelta: () => {
        useChatListStore.getState().addMessage(unreadDmMessage(20));
      },
    });

    expect(useInstancesStore.getState().getInstanceUnreadCount(INSTANCE_ID)).toBe(1);
    expect(useInstancesStore.getState().getInstanceDmUnreadCount(INSTANCE_ID)).toBe(1);
  });

  it("uses the same muted-aware writer for local and layout deltas", () => {
    useChatListStore.getState().setCurrentUserId(1);
    useChatListStore.getState().addMessage(unreadStreamMessage(10));
    useInstancesStore.getState().setInstanceUnreadCount(INSTANCE_ID, 1);

    syncUnreadSurfacesFromDelta({
      source: "local-chat-read",
      instanceId: INSTANCE_ID,
      isStreamMuted: (streamId) => streamId === 5,
      applyDelta: () => {},
    });

    expect(useChatListStore.getState().sidebarStreamsUnread).toBe(1);
    expect(useInstancesStore.getState().getInstanceUnreadCount(INSTANCE_ID)).toBe(0);

    syncUnreadSurfacesFromDelta({
      source: "layout-derived",
      instanceId: INSTANCE_ID,
      isStreamMuted: (streamId) => streamId === 5,
      applyDelta: () => {},
    });

    expect(useInstancesStore.getState().getInstanceUnreadCount(INSTANCE_ID)).toBe(0);
  });
});

describe("syncUnreadSurfacesFromSnapshot", () => {
  it("reconciles chat-list from raw unread messages and updates instance counts", () => {
    syncUnreadSurfacesFromSnapshot({
      source: "inbox-fetch",
      instanceId: INSTANCE_ID,
      currentUserId: 1,
      snapshot: {
        streams: [{ streamId: 5, topic: "general", unreadMessageIds: [10, 11] }],
        dms: [],
        totalCount: 2,
        mentionMessageIds: [],
      },
      messages: [unreadStreamMessage(10), unreadStreamMessage(11)],
    });

    const chatList = useChatListStore.getState();
    expect(chatList.streamsMap.get(5)?.topics.get("general")?.unreadCount).toBe(2);
    expect(useInstancesStore.getState().getInstanceUnreadCount(INSTANCE_ID)).toBe(2);
  });

  it("can derive active organization count from chat-list with mute rules", () => {
    useChatListStore.getState().upsertStreamMetadataRows([{ streamId: 5, name: "engineering" }]);

    syncUnreadSurfacesFromSnapshot({
      source: "inbox-fetch",
      instanceId: INSTANCE_ID,
      currentUserId: 1,
      snapshot: {
        streams: [{ streamId: 5, topic: "general", unreadMessageIds: [10] }],
        dms: [],
        totalCount: 1,
        mentionMessageIds: [],
      },
      instanceCountMode: "chat-list-derived",
      isStreamMuted: (streamId) => streamId === 5,
    });

    expect(useChatListStore.getState().sidebarStreamsUnread).toBe(1);
    expect(useInstancesStore.getState().getInstanceUnreadCount(INSTANCE_ID)).toBe(0);
  });

  it("sets personal unread indicator when snapshot has personal DM unread", () => {
    syncUnreadSurfacesFromSnapshot({
      source: "event-loop-register",
      instanceId: INSTANCE_ID,
      currentUserId: 1,
      snapshot: {
        streams: [],
        dms: [{ userIds: [2], unreadMessageIds: [20], isGroup: false }],
        totalCount: 1,
        mentionMessageIds: [],
      },
      applyChatList: false,
    });

    expect(useInstancesStore.getState().getInstanceDmUnreadCount(INSTANCE_ID)).toBe(1);
  });

  it("does not touch chat-list when applyChatList is false", () => {
    syncUnreadSurfacesFromSnapshot({
      source: "inactive-register",
      instanceId: INSTANCE_ID,
      currentUserId: null,
      snapshot: {
        streams: [{ streamId: 5, topic: "general", unreadMessageIds: [10] }],
        dms: [],
        totalCount: 1,
        mentionMessageIds: [],
      },
      applyChatList: false,
    });

    expect(useChatListStore.getState().sidebarStreamsUnread).toBe(0);
    expect(useInstancesStore.getState().getInstanceUnreadCount(INSTANCE_ID)).toBe(1);
  });

  it("keeps snapshot-total as the default instance count mode", () => {
    syncUnreadSurfacesFromSnapshot({
      source: "inactive-register",
      instanceId: INSTANCE_ID,
      currentUserId: null,
      snapshot: {
        streams: [{ streamId: 5, topic: "general", unreadMessageIds: [10, 11] }],
        dms: [],
        totalCount: 2,
        mentionMessageIds: [],
      },
      applyChatList: false,
      isStreamMuted: (streamId) => streamId === 5,
    });

    expect(useChatListStore.getState().sidebarStreamsUnread).toBe(0);
    expect(useInstancesStore.getState().getInstanceUnreadCount(INSTANCE_ID)).toBe(2);
  });
});
