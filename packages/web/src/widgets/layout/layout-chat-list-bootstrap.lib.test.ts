import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import * as messengerSidebarPreview from "~/shared/api/messenger-sidebar-preview.lib";
import * as chatListSnapshotDb from "~/shared/lib/chat-list-snapshot-db";
import { runChatListBootstrap } from "./layout-chat-list-bootstrap.lib";

describe("runChatListBootstrap", () => {
  beforeEach(() => {
    useChatListStore.getState().clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useChatListStore.getState().clear();
  });

  it("does not hydrate when isStale is true after IndexedDB read", async () => {
    const hydrateSpy = vi.spyOn(useChatListStore.getState(), "hydrateFromIndexedDbSnapshot");
    vi.spyOn(chatListSnapshotDb, "loadChatListSnapshotRow").mockResolvedValue({
      instanceId: "test-instance",
      version: 1,
      currentUserId: 1,
      lastMessageId: null,
      oldestMessageId: null,
      streamsEntries: [],
      dmsEntries: [],
      messageIdToLocationEntries: [],
      updatedAt: 0,
    });

    const result = await runChatListBootstrap("test-instance", {
      isStale: () => true,
    });

    expect(result.mode).toBe("none");
    expect(result.latestMessageIdHint).toBeNull();
    expect(hydrateSpy).not.toHaveBeenCalled();
  });

  it("uses a cold IndexedDB snapshot without refetching the full message preview", async () => {
    const hydrateSpy = vi.spyOn(useChatListStore.getState(), "hydrateFromIndexedDbSnapshot");
    vi.spyOn(chatListSnapshotDb, "loadChatListSnapshotRow").mockResolvedValue({
      instanceId: "test-instance",
      version: 1,
      currentUserId: 1,
      lastMessageId: "00000000-0000-4000-8000-000000000100",
      oldestMessageId: null,
      streamsEntries: [],
      dmsEntries: [],
      messageIdToLocationEntries: [],
      updatedAt: 0,
    });
    const deltaSpy = vi.spyOn(messengerSidebarPreview, "fetchMessagesAfterAnchor");
    const recentSpy = vi.spyOn(
      messengerSidebarPreview,
      "fetchRecentStreamMessagesForSidebarPreview",
    );

    const result = await runChatListBootstrap("test-instance", { kind: "cold" });

    expect(hydrateSpy).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      mode: "none",
      latestMessageIdHint: "00000000-0000-4000-8000-000000000100",
    });
    expect(deltaSpy).not.toHaveBeenCalled();
    expect(recentSpy).not.toHaveBeenCalled();
  });

  it("does not let a late IndexedDB snapshot erase authoritative stream metadata", async () => {
    let resolveSnapshot:
      | ((value: Awaited<ReturnType<typeof chatListSnapshotDb.loadChatListSnapshotRow>>) => void)
      | undefined;
    vi.spyOn(chatListSnapshotDb, "loadChatListSnapshotRow").mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSnapshot = resolve;
        }),
    );

    const bootstrapPromise = runChatListBootstrap("test-instance", { kind: "cold" });
    const streamUuid = "00000000-0000-4000-8000-000000000005";
    const topicUuid = "00000000-0000-4000-8000-000000000501";
    useChatListStore.getState().upsertStreamMetadataRows([{ streamUuid, name: "engineering" }]);
    useChatListStore
      .getState()
      .upsertStreamTopicShells(streamUuid, [{ streamUuid, topicUuid, name: "General" }]);
    useChatListStore.getState().setStreamMetadataHydrated(true);

    resolveSnapshot?.({
      instanceId: "test-instance",
      version: 1,
      currentUserId: 1,
      lastMessageId: null,
      oldestMessageId: null,
      streamsEntries: [],
      dmsEntries: [],
      messageIdToLocationEntries: [],
      updatedAt: 0,
    });
    await bootstrapPromise;

    const state = useChatListStore.getState();
    expect(state.streamMetadataHydrated).toBe(true);
    expect(state.streamsMap.get(streamUuid)?.name).toBe("engineering");
    expect(state.streamsMap.get(streamUuid)?.topics.get("General")?.topicUuid).toBe(topicUuid);
  });

  it("does not refetch message previews for an ordinary reconnect", async () => {
    const deltaSpy = vi.spyOn(messengerSidebarPreview, "fetchMessagesAfterAnchor");
    const recentSpy = vi.spyOn(
      messengerSidebarPreview,
      "fetchRecentStreamMessagesForSidebarPreview",
    );

    const result = await runChatListBootstrap("test-instance", { kind: "reconnect" });

    expect(result).toEqual({ mode: "none", latestMessageIdHint: null });
    expect(deltaSpy).not.toHaveBeenCalled();
    expect(recentSpy).not.toHaveBeenCalled();
  });
});
