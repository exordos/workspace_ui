import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import * as messengerSidebarPreview from "~/shared/api/messenger-sidebar-preview.lib";
import type { WorkspaceRawMessage } from "~/shared/api/messenger.types";
import { METADATA_STREAM_PREVIEW_MESSAGE_LIMIT } from "~/shared/config/metadata-chat-bootstrap.constants";
import * as chatListSnapshotDb from "~/shared/lib/chat-list-snapshot-db";
import { createMessage, testMessageId } from "~/test/factories";
import { runChatListBootstrap } from "./layout-chat-list-bootstrap.lib";

const STREAM_UUID = "00000000-0000-4000-8000-000000000005";
const OTHER_STREAM_UUID = "00000000-0000-4000-8000-000000000007";

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
      stream_uuid: STREAM_UUID,
      subject: "general",
      content: "preview",
    });
    const deltaSpy = vi
      .spyOn(messengerSidebarPreview, "fetchMessagesAfterAnchor")
      .mockResolvedValue([streamMsg]);
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
    expect(result.messages[0]?.stream_uuid).toBe(STREAM_UUID);
    expect(result.latestMessageIdHint).toBe(testMessageId(6558867));
    expect(deltaSpy).toHaveBeenCalledWith(
      testMessageId(6558867),
      METADATA_STREAM_PREVIEW_MESSAGE_LIMIT,
      undefined,
    );
    expect(recentSpy).not.toHaveBeenCalled();
  });

  it("uses recent stream preview when cold start has no IDB hint", async () => {
    const streamMsg = streamMessage({ type: "stream", stream_uuid: STREAM_UUID, subject: "t" });
    const recentSpy = vi
      .spyOn(messengerSidebarPreview, "fetchRecentStreamMessagesForSidebarPreview")
      .mockResolvedValue([streamMsg]);

    vi.spyOn(chatListSnapshotDb, "loadChatListSnapshotRow").mockResolvedValue(null);

    const result = await runChatListBootstrap("test-instance");

    expect(result).toMatchObject({
      mode: "streamPreviews",
      latestMessageIdHint: null,
    });
    if (result.mode !== "streamPreviews") return;
    expect(result.messages).toHaveLength(1);
    expect(recentSpy).toHaveBeenCalledWith(METADATA_STREAM_PREVIEW_MESSAGE_LIMIT, undefined);
  });

  it("uses recent stream preview when delta fetch fails", async () => {
    const streamMsg = streamMessage({
      type: "stream",
      stream_uuid: OTHER_STREAM_UUID,
      subject: "x",
    });
    vi.spyOn(messengerSidebarPreview, "fetchMessagesAfterAnchor").mockRejectedValue(
      new Error("delta failed"),
    );
    const recentSpy = vi
      .spyOn(messengerSidebarPreview, "fetchRecentStreamMessagesForSidebarPreview")
      .mockResolvedValue([streamMsg]);
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
    expect(result.messages[0]?.stream_uuid).toBe(OTHER_STREAM_UUID);
    expect(recentSpy).toHaveBeenCalledWith(METADATA_STREAM_PREVIEW_MESSAGE_LIMIT, undefined);
  });
});
