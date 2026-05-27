import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import * as zulipMessages from "~/shared/api/zulip";
import * as zulip from "~/shared/api/zulip";
import type { ZulipRawMessage } from "~/shared/api/zulip.types";
import { METADATA_STREAM_PREVIEW_MESSAGE_LIMIT } from "~/shared/config/metadata-chat-bootstrap.constants";
import * as chatListSnapshotDb from "~/shared/lib/chat-list-snapshot-db";
import { createMessage } from "~/test/factories";
import { runChatListBootstrap } from "./layout-chat-list-bootstrap.lib";

function streamMessage(overrides: Parameters<typeof createMessage>[0] = {}): ZulipRawMessage {
  return createMessage(overrides) as ZulipRawMessage;
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
      .spyOn(zulipMessages, "fetchMessagesAfterAnchor")
      .mockResolvedValue([streamMsg]);
    const unreadSpy = vi
      .spyOn(zulip, "fetchStreamUnreadMessagesForSidebarPreview")
      .mockResolvedValue([]);
    const recentSpy = vi
      .spyOn(zulip, "fetchRecentStreamMessagesForSidebarPreview")
      .mockResolvedValue([]);

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

    expect(result.mode).toBe("streamPreviews");
    if (result.mode !== "streamPreviews") return;
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.stream_id).toBe(5);
    expect(result.latestMessageIdHint).toBe(6558867);
    expect(deltaSpy).toHaveBeenCalledWith(
      6558867,
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
    vi.spyOn(zulip, "fetchStreamUnreadMessagesForSidebarPreview").mockResolvedValue([streamMsg]);
    vi.spyOn(zulip, "fetchRecentStreamMessagesForSidebarPreview").mockResolvedValue([]);

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
    vi.spyOn(zulip, "fetchStreamUnreadMessagesForSidebarPreview").mockResolvedValue([]);
    const recentSpy = vi
      .spyOn(zulip, "fetchRecentStreamMessagesForSidebarPreview")
      .mockResolvedValue([streamMsg]);
    vi.spyOn(chatListSnapshotDb, "loadChatListSnapshotRow").mockResolvedValue(null);

    const result = await runChatListBootstrap("test-instance");

    expect(result.mode).toBe("streamPreviews");
    if (result.mode !== "streamPreviews") return;
    expect(result.messages[0]?.stream_id).toBe(7);
    expect(recentSpy).toHaveBeenCalledWith(METADATA_STREAM_PREVIEW_MESSAGE_LIMIT, undefined);
  });
});
