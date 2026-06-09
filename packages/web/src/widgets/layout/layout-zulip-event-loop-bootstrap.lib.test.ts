import { describe, expect, it, vi } from "vitest";
import {
  collectBootstrapStatusUserIds,
  onStreamPreviewBootstrapSettled,
} from "./layout-zulip-event-loop-bootstrap.lib";
import type { ChatListBootstrapResult } from "./layout-chat-list-bootstrap.lib";

describe("collectBootstrapStatusUserIds", () => {
  it("prioritizes current user and DM participants before the rest of the directory", () => {
    const ids = collectBootstrapStatusUserIds({
      currentUserId: 7,
      dms: [
        { id: 20, isGroup: false },
        { id: 99, isGroup: true, userIds: [7, 40, 41] },
      ],
      members: [{ user_id: 41 }, { user_id: 30 }, { user_id: 20 }, { user_id: 50 }],
    });

    expect(ids).toEqual([7, 20, 40, 41, 30, 50]);
  });
});

describe("onStreamPreviewBootstrapSettled", () => {
  it("skips bootstrap apply when getCancelled reads true after handler was created", () => {
    let cancelled = false;
    const stageMetadataStreamPreviewsBootstrap = vi.fn();
    const applyChatListBootstrapResult = vi.fn();
    const startSidebarUnreadReconcile = vi.fn();
    const streamBootstrap: ChatListBootstrapResult = {
      mode: "none",
      latestMessageIdHint: null,
    };

    const runSettled = () =>
      onStreamPreviewBootstrapSettled({
        getCancelled: () => cancelled,
        isBootstrapStale: () => false,
        instanceId: "inst-1",
        stageMetadataStreamPreviewsBootstrap,
        applyChatListBootstrapResult,
        bootstrapApplyOptions: {},
        startSidebarUnreadReconcile,
        currentUserId: 1,
        registerSnapshot: null,
        log: { error: vi.fn() } as never,
        streamBootstrap,
        summarizeStreamBootstrapMessages: () => [],
      });

    runSettled();
    expect(applyChatListBootstrapResult).toHaveBeenCalledOnce();

    cancelled = true;
    applyChatListBootstrapResult.mockClear();
    stageMetadataStreamPreviewsBootstrap.mockClear();
    startSidebarUnreadReconcile.mockClear();
    runSettled();
    expect(applyChatListBootstrapResult).not.toHaveBeenCalled();
    expect(stageMetadataStreamPreviewsBootstrap).not.toHaveBeenCalled();
    expect(startSidebarUnreadReconcile).not.toHaveBeenCalled();
  });
});
