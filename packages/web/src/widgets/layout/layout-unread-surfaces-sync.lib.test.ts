import { beforeEach, describe, expect, it } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import {
  syncUnreadSurfacesFromDelta,
  syncUnreadSurfacesFromEventDelta,
} from "./layout-unread-surfaces-sync.lib";

const INSTANCE_ID = "instance-sync-test";

function applyStreamUnreadMetadata(unreadCount: number): void {
  useChatListStore
    .getState()
    .upsertStreamMetadataRows([{ streamUuid: "5", name: "engineering", unreadCount }]);
  useChatListStore.getState().upsertStreamTopicShells("5", [
    {
      streamUuid: "5",
      topicUuid: "55555555-5555-4555-8555-555555555555",
      name: "general",
      unreadCount,
    },
  ]);
}

function applyDmUnreadMetadata(unreadCount: number): void {
  useChatListStore
    .getState()
    .upsertDmMetadataRows([{ userIds: [1, 2], name: "Alice", unreadCount, lastActivityTs: 1 }]);
}

beforeEach(() => {
  useChatListStore.getState().clear();
  useInstancesStore.setState({
    instances: [
      {
        id: INSTANCE_ID,
        realm: "https://chat.example.com",
        login: "user@example.com",
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
        applyStreamUnreadMetadata(1);
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
      isStreamMuted: (streamId) => streamId === "5",
      applyDelta: () => {
        applyStreamUnreadMetadata(1);
      },
    });

    expect(useChatListStore.getState().sidebarStreamsUnread).toBe(1);
    expect(useInstancesStore.getState().getInstanceUnreadCount(INSTANCE_ID)).toBe(0);
  });

  it("updates personal organization indicator from fresh DM unread", () => {
    useChatListStore.getState().setCurrentUserId(1);

    syncUnreadSurfacesFromEventDelta({
      source: "event-message",
      instanceId: INSTANCE_ID,
      applyDelta: () => {
        applyDmUnreadMetadata(1);
      },
    });

    expect(useInstancesStore.getState().getInstanceUnreadCount(INSTANCE_ID)).toBe(1);
    expect(useInstancesStore.getState().getInstanceDmUnreadCount(INSTANCE_ID)).toBe(1);
  });

  it("uses the same muted-aware writer for local and layout deltas", () => {
    useChatListStore.getState().setCurrentUserId(1);
    applyStreamUnreadMetadata(1);
    useInstancesStore.getState().setInstanceUnreadCount(INSTANCE_ID, 1);

    syncUnreadSurfacesFromDelta({
      source: "local-chat-read",
      instanceId: INSTANCE_ID,
      isStreamMuted: (streamId) => streamId === "5",
      applyDelta: () => {},
    });

    expect(useChatListStore.getState().sidebarStreamsUnread).toBe(1);
    expect(useInstancesStore.getState().getInstanceUnreadCount(INSTANCE_ID)).toBe(0);

    syncUnreadSurfacesFromDelta({
      source: "layout-derived",
      instanceId: INSTANCE_ID,
      isStreamMuted: (streamId) => streamId === "5",
      applyDelta: () => {},
    });

    expect(useInstancesStore.getState().getInstanceUnreadCount(INSTANCE_ID)).toBe(0);
  });
});
