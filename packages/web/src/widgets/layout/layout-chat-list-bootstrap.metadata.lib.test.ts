import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import * as chatListSnapshotDb from "~/shared/lib/chat-list-snapshot-db";
import { runChatListBootstrap } from "./layout-chat-list-bootstrap.lib";

describe("runChatListBootstrap (metadata-first)", () => {
  beforeEach(() => {
    useChatListStore.getState().clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useChatListStore.getState().clear();
  });

  it("returns empty stream preview result when IDB has lastMessageId hint", async () => {
    vi.spyOn(chatListSnapshotDb, "loadChatListSnapshotRow").mockResolvedValue({
      instanceId: "test-instance",
      version: 1,
      currentUserId: 1,
      lastMessageId: 6558867,
      oldestMessageId: null,
      streamsEntries: [],
      dmsEntries: [],
      messageIdToLocationEntries: [],
      updatedAt: 0,
    });

    const result = await runChatListBootstrap("test-instance");

    expect(result).toEqual({
      mode: "streamPreviews",
      messages: [],
      latestMessageIdHint: 6558867,
    });
  });

  it("clears store and returns empty stream preview result when cold start has no snapshot", async () => {
    useChatListStore.getState().upsertStreamMetadataRows([{ streamId: 7, name: "stale" }]);
    vi.spyOn(chatListSnapshotDb, "loadChatListSnapshotRow").mockResolvedValue(null);

    const result = await runChatListBootstrap("test-instance");

    expect(result).toEqual({
      mode: "streamPreviews",
      messages: [],
      latestMessageIdHint: null,
    });
    expect(useChatListStore.getState().streamsMap.size).toBe(0);
  });
});
