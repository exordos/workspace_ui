import { beforeEach, describe, expect, it, vi } from "vitest";
import { refreshLayoutReconnectLight } from "./layout-reconnect-light.lib";

const applyStreamSidebarPreviewsFromMessagesMock = vi.hoisted(() => vi.fn());
const mergeFromMessageMock = vi.hoisted(() => vi.fn());
const runChatListBootstrapMock = vi.hoisted(() => vi.fn());
const reconcileSidebarUnreadAfterBootstrapMock = vi.hoisted(() => vi.fn());
const isActiveOrgRequestInvalidatedMock = vi.hoisted(() => vi.fn(() => false));

vi.mock("~/entities/chat-list/chat-list.model", () => ({
  useChatListStore: {
    getState: () => ({
      currentUserId: 7,
      applyStreamSidebarPreviewsFromMessages: applyStreamSidebarPreviewsFromMessagesMock,
    }),
  },
}));

vi.mock("~/entities/user/user.model", () => ({
  useUsersStore: {
    getState: () => ({
      mergeFromMessage: mergeFromMessageMock,
    }),
  },
}));

vi.mock("~/entities/instance/instance.model", () => ({
  isActiveOrgRequestInvalidated: isActiveOrgRequestInvalidatedMock,
}));

vi.mock("./layout-chat-list-bootstrap.lib", () => ({
  runChatListBootstrap: runChatListBootstrapMock,
}));

vi.mock("./layout-instance-register-unread.lib", () => ({
  getCachedRegisterUnreadSnapshot: vi.fn(() => undefined),
}));

vi.mock("./layout-sidebar-unread-reconcile.lib", () => ({
  reconcileSidebarUnreadAfterBootstrap: reconcileSidebarUnreadAfterBootstrapMock,
}));

describe("refreshLayoutReconnectLight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isActiveOrgRequestInvalidatedMock.mockReturnValue(false);
    runChatListBootstrapMock.mockResolvedValue({
      mode: "streamPreviews",
      latestMessageIdHint: null,
      messages: [
        {
          id: 50,
          sender_id: 20,
          type: "stream",
          stream_id: 9,
          subject: "ops",
          content: "preview",
          timestamp: 1,
        },
      ],
    });
  });

  it("does not apply stream previews when active org becomes stale after reconnect fetch", async () => {
    isActiveOrgRequestInvalidatedMock.mockReturnValueOnce(false).mockReturnValueOnce(false);
    isActiveOrgRequestInvalidatedMock.mockReturnValueOnce(true);

    await refreshLayoutReconnectLight({
      instanceId: "inst-1",
      orgContext: { instanceId: "inst-1", epoch: 1 },
      isCancelled: () => false,
    });

    expect(runChatListBootstrapMock).toHaveBeenCalled();
    expect(applyStreamSidebarPreviewsFromMessagesMock).not.toHaveBeenCalled();
    expect(mergeFromMessageMock).not.toHaveBeenCalled();
  });
});
