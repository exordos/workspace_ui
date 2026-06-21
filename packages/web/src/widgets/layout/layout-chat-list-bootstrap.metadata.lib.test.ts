import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import * as messengerSidebarPreview from "~/shared/api/messenger-sidebar-preview.lib";
import type { WorkspaceRawMessage } from "~/shared/api/messenger.types";
import { METADATA_STREAM_PREVIEW_MESSAGE_LIMIT } from "~/shared/config/metadata-chat-bootstrap.constants";
import * as chatListSnapshotDb from "~/shared/lib/chat-list-snapshot-db";
import { createMessage, testMessageId } from "~/test/factories";
import { runChatListBootstrap } from "./layout-chat-list-bootstrap.lib";

function streamMessage(overrides: Parameters<typeof createMessage>[0] = {}): WorkspaceRawMessage {
  return createMessage(overrides);
}

describe("runChatListBootstrap (metadata-first)", () => {
  beforeEach(() => {
    useChatListStore.getState().clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useChatListStore.getState().clear();
  });

  it("fetches stream preview delta when IDB has lastMessageId hint", async () => {
    const streamMsg = streamMessage({
      type: "stream",
      stream_id: 5,
      subject: "general",
      content: "preview",
    });
    const deltaSpy = vi
      .spyOn(messengerSidebarPreview, "fetchMessagesAfterAnchor")
      .mockResolvedValue([streamMsg]);
    const unreadSpy = vi
      .spyOn(messengerSidebarPreview, "fetchStreamUnreadMessagesForSidebarPreview")
      .mockResolvedValue([]);
    const recentSpy = vi
      .spyOn(messengerSidebarPreview, "fetchRecentStreamMessagesForSidebarPreview")
      .mockResolvedValue([]);

    vi.spyOn(chatListSnapshotDb, "loadChatListSnapshotRow").mockResolvedValue({
      instanceId: "test-instance",
      version: 1,
      currentUserId: 1,
      lastMessageId: testMessageId(6558867),
      oldestMessageId: null,
      streamsEntries: [],
      dmsEntries: [],
      messageIdToLocationEntries: [],
      updatedAt: 0,
    });

    const result = await runChatListBootstrap("test-instance");

    expect(result.mode).toBe("streamPreviews");
    if (result.mode !== "streamPreviews") return;
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.stream_id).toBe(5);
    expect(result.latestMessageIdHint).toBe(testMessageId(6558867));
    expect(deltaSpy).toHaveBeenCalledWith(
      testMessageId(6558867),
      METADATA_STREAM_PREVIEW_MESSAGE_LIMIT,
      expect.arrayContaining([
        expect.objectContaining({ negated: true, operator: "is", operand: "dm" }),
      ]),
      undefined,
    );
    expect(unreadSpy).not.toHaveBeenCalled();
    expect(recentSpy).not.toHaveBeenCalled();
  });

  it("falls back to unread snapshot when cold start has no IDB hint", async () => {
    const streamMsg = streamMessage({ type: "stream", stream_id: 3, subject: "t" });
    vi.spyOn(
      messengerSidebarPreview,
      "fetchStreamUnreadMessagesForSidebarPreview",
    ).mockResolvedValue([streamMsg]);
    vi.spyOn(
      messengerSidebarPreview,
      "fetchRecentStreamMessagesForSidebarPreview",
    ).mockResolvedValue([]);

    vi.spyOn(chatListSnapshotDb, "loadChatListSnapshotRow").mockResolvedValue(null);

    const result = await runChatListBootstrap("test-instance");

    expect(result).toMatchObject({
      mode: "streamPreviews",
      latestMessageIdHint: null,
    });
    if (result.mode !== "streamPreviews") return;
    expect(result.messages).toHaveLength(1);
  });

  it("uses fetchRecentStreamMessagesForSidebarPreview when unread snapshot is empty", async () => {
    const streamMsg = streamMessage({ type: "stream", stream_id: 7, subject: "x" });
    vi.spyOn(
      messengerSidebarPreview,
      "fetchStreamUnreadMessagesForSidebarPreview",
    ).mockResolvedValue([]);
    const recentSpy = vi
      .spyOn(messengerSidebarPreview, "fetchRecentStreamMessagesForSidebarPreview")
      .mockResolvedValue([streamMsg]);
    vi.spyOn(chatListSnapshotDb, "loadChatListSnapshotRow").mockResolvedValue(null);

    const result = await runChatListBootstrap("test-instance");

    expect(result.mode).toBe("streamPreviews");
    if (result.mode !== "streamPreviews") return;
    expect(result.messages[0]?.stream_id).toBe(7);
    expect(recentSpy).toHaveBeenCalledWith(METADATA_STREAM_PREVIEW_MESSAGE_LIMIT, undefined);
  });
});
