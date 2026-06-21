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

  it("reconnect kind does not hydrate from IndexedDB", async () => {
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
    const deltaSpy = vi
      .spyOn(messengerSidebarPreview, "fetchMessagesAfterAnchor")
      .mockResolvedValue([]);

    await runChatListBootstrap("test-instance", { kind: "reconnect" });

    expect(hydrateSpy).not.toHaveBeenCalled();
    expect(deltaSpy).toHaveBeenCalled();
  });
});
