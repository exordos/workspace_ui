import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import * as zulipMessages from "~/shared/api/zulip";
import * as chatListSnapshotDb from "~/shared/lib/chat-list-snapshot-db";

const mockEnv = vi.hoisted(() => ({
  METADATA_CHAT_BOOTSTRAP_ENABLED: true,
}));

vi.mock("~/shared/lib/env", () => ({
  env: mockEnv,
}));

import { runChatListBootstrap } from "./layout-chat-list-bootstrap.lib";

describe("runChatListBootstrap (metadata-first)", () => {
  beforeEach(() => {
    mockEnv.METADATA_CHAT_BOOTSTRAP_ENABLED = true;
    useChatListStore.getState().clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useChatListStore.getState().clear();
  });

  it("skips fetchMessagesAfterAnchor when IDB has lastMessageId hint", async () => {
    const deltaSpy = vi.spyOn(zulipMessages, "fetchMessagesAfterAnchor").mockResolvedValue([]);
    const recentSpy = vi.spyOn(zulipMessages, "fetchRecentMessages").mockResolvedValue([]);
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

    expect(result).toEqual({ mode: "none", latestMessageIdHint: 6558867 });
    expect(deltaSpy).not.toHaveBeenCalled();
    expect(recentSpy).not.toHaveBeenCalled();
  });
});
