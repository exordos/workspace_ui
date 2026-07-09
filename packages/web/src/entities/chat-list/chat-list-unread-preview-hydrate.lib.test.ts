import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useInstancesStore } from "~/entities/instance/instance.model";
import type { ZulipUnreadMessagesSnapshot } from "~/shared/api/zulip-unread.lib";
import type { ZulipRawMessage } from "~/shared/api/zulip.types";
import {
  hydrateStreamSidebarPreviewsFromUnreadSnapshot,
  resolveLatestUnreadMessageIdsForMissingPreviews,
} from "./chat-list-unread-preview-hydrate.lib";
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

function seedActiveInstance(): string {
  return useInstancesStore.getState().addInstance().id;
}

function streamMsg(overrides: Partial<ZulipRawMessage> = {}): ZulipRawMessage {
  return {
    id: 1,
    sender_id: 10,
    sender_full_name: "Sender",
    content: "hello",
    timestamp: 1000,
    type: "stream",
    stream_id: 5,
    display_recipient: "general",
    subject: "topic1",
    flags: [],
    ...overrides,
  };
}

describe("resolveLatestUnreadMessageIdsForMissingPreviews", () => {
  beforeEach(() => {
    resetInstancesStore();
    seedActiveInstance();
    useChatListStore.getState().clear();
  });

  afterEach(() => {
    resetInstancesStore();
    useChatListStore.getState().clear();
  });

  it("picks max unread id per bucket and dedupes ids", () => {
    useChatListStore.getState().upsertStreamMetadataRows([{ streamId: 5, name: "general" }]);
    const snapshot: ZulipUnreadMessagesSnapshot = {
      streams: [
        { streamId: 5, topic: "alpha", unreadMessageIds: [1, 5, 3] },
        { streamId: 5, topic: "beta", unreadMessageIds: [5, 2] },
      ],
      dms: [],
      totalCount: 5,
      mentionMessageIds: [],
    };

    const ids = resolveLatestUnreadMessageIdsForMissingPreviews(
      snapshot,
      useChatListStore.getState().streamsMap,
    );

    expect(ids).toEqual([5]);
  });

  it("skips bucket when topic preview already exists and stream preview is non-empty", () => {
    useChatListStore.getState().upsertStreamMetadataRows([{ streamId: 5, name: "general" }]);
    useChatListStore
      .getState()
      .applyStreamSidebarPreviewsFromMessages([
        streamMsg({ id: 10, subject: "alpha", content: "ok" }),
      ]);

    const snapshot: ZulipUnreadMessagesSnapshot = {
      streams: [{ streamId: 5, topic: "alpha", unreadMessageIds: [99] }],
      dms: [],
      totalCount: 1,
      mentionMessageIds: [],
    };

    const ids = resolveLatestUnreadMessageIdsForMissingPreviews(
      snapshot,
      useChatListStore.getState().streamsMap,
    );

    expect(ids).toEqual([]);
  });
});

describe("hydrateStreamSidebarPreviewsFromUnreadSnapshot", () => {
  beforeEach(() => {
    resetInstancesStore();
    seedActiveInstance();
    useChatListStore.getState().clear();
  });

  afterEach(() => {
    resetInstancesStore();
    useChatListStore.getState().clear();
  });

  it("does not fetch or apply previews from unread ids", async () => {
    useChatListStore.getState().upsertStreamMetadataRows([{ streamId: 5, name: "general" }]);

    const snapshot: ZulipUnreadMessagesSnapshot = {
      streams: [{ streamId: 5, topic: "alpha", unreadMessageIds: [301, 302] }],
      dms: [],
      totalCount: 2,
      mentionMessageIds: [],
    };

    await hydrateStreamSidebarPreviewsFromUnreadSnapshot(snapshot);

    const stream = useChatListStore.getState().streamsMap.get(5);
    expect(stream?.topics.size).toBe(0);
    expect(stream?.lastMessage).toBe("");
    expect(stream?.ts).toBe(0);
  });

  it("resolves concurrent no-op hydrate calls without mutating state", async () => {
    useChatListStore.getState().upsertStreamMetadataRows([{ streamId: 5, name: "general" }]);
    const snapshot: ZulipUnreadMessagesSnapshot = {
      streams: [{ streamId: 5, topic: "alpha", unreadMessageIds: [301] }],
      dms: [],
      totalCount: 1,
      mentionMessageIds: [],
    };

    const first = hydrateStreamSidebarPreviewsFromUnreadSnapshot(snapshot);
    const second = hydrateStreamSidebarPreviewsFromUnreadSnapshot(snapshot);

    await Promise.all([first, second]);
    expect(useChatListStore.getState().streamsMap.get(5)?.topics.size).toBe(0);
  });

  it("accepts null snapshot and cancellation without side effects", async () => {
    await expect(
      hydrateStreamSidebarPreviewsFromUnreadSnapshot(null, () => true),
    ).resolves.toBeUndefined();
  });
});
