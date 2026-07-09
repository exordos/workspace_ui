import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useInstancesStore } from "~/entities/instance/instance.model";
import {
  clearStreamSidebarHydrateState,
  isStreamSidebarTopicsHydrateInFlight,
  queuePriorityStreamSidebarTopicsHydrate,
  requestStreamSidebarTopicPreviewBackfill,
  requestStreamSidebarTopicListHydrate,
  requestStreamSidebarTopicsHydrate,
} from "./chat-list-hydrate-stream-sidebar.lib";
import { useChatListStore } from "./chat-list.model";

function resetInstancesStore(): void {
  useInstancesStore.setState({
    instances: [],
    currentInstanceId: null,
    activeOrgEpoch: 0,
    unreadCountsByInstance: {},
    dmUnreadCountsByInstance: {},
    jitsiMeetBaseUrl: null,
  });
}

function seedActiveInstance(): void {
  useInstancesStore.getState().addInstance();
}

describe("stream sidebar hydrate without legacy API", () => {
  beforeEach(() => {
    resetInstancesStore();
    seedActiveInstance();
    clearStreamSidebarHydrateState();
    useChatListStore.getState().clear();
  });

  afterEach(() => {
    resetInstancesStore();
    clearStreamSidebarHydrateState();
    useChatListStore.getState().clear();
  });

  it("marks stream hydrate as handled without network-backed topic insertion", async () => {
    useChatListStore.getState().upsertStreamMetadataRows([{ streamId: 5, name: "general" }]);

    await requestStreamSidebarTopicsHydrate(5, "expand");

    expect(isStreamSidebarTopicsHydrateInFlight(5)).toBe(false);
    expect(useChatListStore.getState().streamsMap.get(5)?.topics.size).toBe(0);
  });

  it("does not insert topic shells from the legacy topic list hydrate", async () => {
    useChatListStore.getState().upsertStreamMetadataRows([{ streamId: 5, name: "general" }]);

    await requestStreamSidebarTopicListHydrate(5);
    await requestStreamSidebarTopicListHydrate(5);

    expect(useChatListStore.getState().streamsMap.get(5)?.topics.size).toBe(0);
  });

  it("does not mutate topic previews during preview backfill", async () => {
    useChatListStore.getState().upsertStreamMetadataRows([{ streamId: 5, name: "engineering" }]);
    useChatListStore.getState().upsertStreamTopicShells(5, ["alpha"]);

    await requestStreamSidebarTopicPreviewBackfill(5);

    expect(useChatListStore.getState().streamsMap.get(5)?.topics.get("alpha")?.lastMessage).toBe(
      "",
    );
  });

  it("priority hydrate queue stays local for unread stream buckets", async () => {
    useChatListStore.getState().upsertStreamMetadataRows([{ streamId: 5, name: "general" }]);

    queuePriorityStreamSidebarTopicsHydrate({
      streams: [{ streamId: 5, topic: "t", unreadMessageIds: [1] }],
      dms: [],
      totalCount: 1,
      mentionMessageIds: [],
      oldUnreadsMissing: false,
    });
    await Promise.resolve();

    expect(isStreamSidebarTopicsHydrateInFlight(5)).toBe(false);
    expect(useChatListStore.getState().streamsMap.get(5)?.topics.size).toBe(0);
  });
});
