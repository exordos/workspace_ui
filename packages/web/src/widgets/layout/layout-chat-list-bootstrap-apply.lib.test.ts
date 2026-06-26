import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ZulipRawMessage } from "~/shared/api/zulip.types";
import { applyChatListBootstrapResult } from "./layout-chat-list-bootstrap-apply.lib";

const loadDmIndexEntriesMock = vi.hoisted(() =>
  vi.fn<
    () => {
      dmKey: string;
      userIds: number[];
      lastActivityTs: number;
      lastMessageId: number;
      unreadCount: number;
    }[]
  >(() => []),
);
const isActiveOrgRequestInvalidatedMock = vi.hoisted(() => vi.fn(() => false));
const setFromMessagesMock = vi.fn();
const applyStreamPreviewsMock = vi.fn();
const mergeFromMessageMock = vi.fn();

vi.mock("~/shared/lib/dm-index", () => ({
  loadDmIndexEntries: loadDmIndexEntriesMock,
  upsertDmIndexFromMessages: vi.fn(),
}));

vi.mock("~/entities/instance/instance.model", () => ({
  isActiveOrgRequestInvalidated: isActiveOrgRequestInvalidatedMock,
}));

vi.mock("~/entities/chat-list/chat-list.model", () => ({
  useChatListStore: {
    getState: () => ({
      currentUserId: 7,
      setFromMessages: setFromMessagesMock,
      applyStreamSidebarPreviewsFromMessages: applyStreamPreviewsMock,
      streamsMap: new Map(),
      dmsMap: new Map(),
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

vi.mock("~/entities/activity/activity.model", () => ({
  useActivityStore: { getState: () => ({ markStale: vi.fn() }) },
}));

vi.mock("~/entities/inbox/inbox.model", () => ({
  useInboxStore: { getState: () => ({ markStale: vi.fn() }) },
}));

describe("applyChatListBootstrapResult", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isActiveOrgRequestInvalidatedMock.mockReturnValue(false);
    loadDmIndexEntriesMock.mockReturnValue([]);
  });

  it("applies streamPreviews via applyStreamSidebarPreviewsFromMessages", () => {
    const messages = [
      { id: 30, sender_id: 1, type: "stream", stream_id: 9, content: "ch", timestamp: 3 },
    ] as ZulipRawMessage[];

    applyChatListBootstrapResult(
      { mode: "streamPreviews", messages, latestMessageIdHint: null },
      {
        currentInstanceId: "inst-1",
        setFromMessages: setFromMessagesMock,
      },
    );

    expect(applyStreamPreviewsMock).toHaveBeenCalledWith(messages);
    expect(setFromMessagesMock).not.toHaveBeenCalled();
  });

  it("skips stale active-org bootstrap apply before mutating stores", () => {
    isActiveOrgRequestInvalidatedMock.mockReturnValue(true);
    loadDmIndexEntriesMock.mockReturnValue([
      {
        dmKey: "dm:1",
        userIds: [1],
        lastActivityTs: 1,
        lastMessageId: 10,
        unreadCount: 1,
      },
    ]);
    const messages = [
      { id: 30, sender_id: 1, type: "stream", stream_id: 9, content: "ch", timestamp: 3 },
    ] as ZulipRawMessage[];

    applyChatListBootstrapResult(
      { mode: "streamPreviews", messages, latestMessageIdHint: null },
      {
        currentInstanceId: "inst-1",
        setFromMessages: setFromMessagesMock,
        orgContext: { instanceId: "inst-1", epoch: 1 },
      },
    );

    expect(loadDmIndexEntriesMock).not.toHaveBeenCalled();
    expect(applyStreamPreviewsMock).not.toHaveBeenCalled();
    expect(mergeFromMessageMock).not.toHaveBeenCalled();
  });
});
