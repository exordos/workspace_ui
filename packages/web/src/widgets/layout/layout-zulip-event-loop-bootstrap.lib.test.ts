import { describe, expect, it, vi } from "vitest";
import { onStreamPreviewBootstrapSettled } from "./layout-zulip-event-loop-bootstrap.lib";
import type { ChatListBootstrapResult } from "./layout-chat-list-bootstrap.lib";

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
