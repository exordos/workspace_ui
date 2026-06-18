import { beforeEach, describe, expect, it } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import type { ZulipRawMessage } from "~/shared/api/zulip.types";
import {
  syncUnreadSurfacesFromDelta,
  syncUnreadSurfacesFromEventDelta,
  syncUnreadSurfacesFromSnapshot,
} from "./unread-surfaces-sync.lib";

const INSTANCE_ID = "entity-unread-sync-test";

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

describe("unread surface sync", () => {
  it("keeps event deltas muted-aware", () => {
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

  it("derives active snapshot count from chat-list with mute rules", () => {
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

  it("keeps snapshot-total as default for count-only inactive sources", () => {
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

  it("updates personal organization indicator from current chat-list", () => {
    useChatListStore.getState().setCurrentUserId(1);

    syncUnreadSurfacesFromDelta({
      source: "layout-derived",
      instanceId: INSTANCE_ID,
      applyDelta: () => {
        useChatListStore.getState().addMessage(unreadDmMessage(20));
      },
    });

    expect(useInstancesStore.getState().getInstanceUnreadCount(INSTANCE_ID)).toBe(1);
    expect(useInstancesStore.getState().getInstanceDmUnreadCount(INSTANCE_ID)).toBe(1);
  });
});
