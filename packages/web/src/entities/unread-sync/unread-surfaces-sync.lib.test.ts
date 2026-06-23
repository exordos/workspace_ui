import { beforeEach, describe, expect, it } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import {
  syncUnreadSurfacesFromDelta,
  syncUnreadSurfacesFromEventDelta,
} from "./unread-surfaces-sync.lib";

const INSTANCE_ID = "entity-unread-sync-test";
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

describe("unread surface sync", () => {
  it("keeps event deltas muted-aware", () => {
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

  it("leaves organization counters server-owned after local sidebar changes", () => {
    useChatListStore.getState().setCurrentUserId(1);

    syncUnreadSurfacesFromDelta({
      source: "layout-derived",
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
});
