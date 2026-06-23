import { beforeEach, describe, expect, it } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import {
  syncUnreadSurfacesFromDelta,
  syncUnreadSurfacesFromEventDelta,
} from "./layout-unread-surfaces-sync.lib";

const INSTANCE_ID = "instance-sync-test";
const STREAM_UUID = "11111111-1111-4111-8111-111111111111";

function applyStreamUnreadMetadata(unreadCount: number): void {
  useChatListStore
    .getState()
    .upsertStreamMetadataRows([{ streamUuid: STREAM_UUID, name: "engineering", unreadCount }]);
  useChatListStore.getState().upsertStreamTopicShells(STREAM_UUID, [
    {
      streamUuid: STREAM_UUID,
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
        authType: "iam",
        iamAccessToken: "api-key",
      },
    ],
    currentInstanceId: INSTANCE_ID,
    unreadCountsByInstance: {},
    dmUnreadCountsByInstance: {},
    activeOrgEpoch: 0,
  });
});

describe("syncUnreadSurfacesFromEventDelta", () => {
  it("applies stream unread delta without writing organization count", () => {
    useChatListStore.getState().setCurrentUserId(1);

    syncUnreadSurfacesFromEventDelta({
      source: "event-message",
      instanceId: INSTANCE_ID,
      applyDelta: () => {
        applyStreamUnreadMetadata(1);
      },
    });

    expect(useChatListStore.getState().streamsMap.get(STREAM_UUID)?.unreadCount).toBe(1);
    expect(useChatListStore.getState().sidebarStreamsUnread).toBe(0);
    expect(useInstancesStore.getState().getInstanceUnreadCount(INSTANCE_ID)).toBe(0);
  });

  it("keeps organization count muted-aware after stream unread delta", () => {
    useChatListStore.getState().setCurrentUserId(1);

    syncUnreadSurfacesFromEventDelta({
      source: "event-message",
      instanceId: INSTANCE_ID,
      isStreamMuted: (streamId) => streamId === STREAM_UUID,
      applyDelta: () => {
        applyStreamUnreadMetadata(1);
      },
    });

    expect(useChatListStore.getState().streamsMap.get(STREAM_UUID)?.unreadCount).toBe(1);
    expect(useChatListStore.getState().sidebarStreamsUnread).toBe(0);
    expect(useInstancesStore.getState().getInstanceUnreadCount(INSTANCE_ID)).toBe(0);
  });

  it("applies fresh DM unread without writing organization count", () => {
    useChatListStore.getState().setCurrentUserId(1);

    syncUnreadSurfacesFromEventDelta({
      source: "event-message",
      instanceId: INSTANCE_ID,
      applyDelta: () => {
        applyDmUnreadMetadata(1);
      },
    });

    expect(Array.from(useChatListStore.getState().dmsMap.values())[0]?.unreadCount).toBe(1);
    expect(useChatListStore.getState().sidebarDmsUnread).toBe(0);
    expect(useInstancesStore.getState().getInstanceUnreadCount(INSTANCE_ID)).toBe(0);
    expect(useInstancesStore.getState().getInstanceDmUnreadCount(INSTANCE_ID)).toBe(0);
  });

  it("preserves server organization count for local and layout deltas", () => {
    useChatListStore.getState().setCurrentUserId(1);
    applyStreamUnreadMetadata(1);
    useInstancesStore.getState().setInstanceUnreadCount(INSTANCE_ID, 1);

    syncUnreadSurfacesFromDelta({
      source: "local-chat-read",
      instanceId: INSTANCE_ID,
      isStreamMuted: (streamId) => streamId === STREAM_UUID,
      applyDelta: () => {},
    });

    expect(useChatListStore.getState().streamsMap.get(STREAM_UUID)?.unreadCount).toBe(1);
    expect(useChatListStore.getState().sidebarStreamsUnread).toBe(0);
    expect(useInstancesStore.getState().getInstanceUnreadCount(INSTANCE_ID)).toBe(1);

    syncUnreadSurfacesFromDelta({
      source: "layout-derived",
      instanceId: INSTANCE_ID,
      isStreamMuted: (streamId) => streamId === STREAM_UUID,
      applyDelta: () => {},
    });

    expect(useInstancesStore.getState().getInstanceUnreadCount(INSTANCE_ID)).toBe(1);
  });
});
