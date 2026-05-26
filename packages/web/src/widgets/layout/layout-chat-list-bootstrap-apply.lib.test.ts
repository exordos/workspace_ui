import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ZulipRawMessage } from "~/shared/api/zulip.types";
import { applyChatListBootstrapResult } from "./layout-chat-list-bootstrap-apply.lib";

const setFromMessagesMock = vi.fn();
const addMessagesMock = vi.fn();
const mergeFromMessageMock = vi.fn();

vi.mock("~/shared/lib/env", () => ({
  env: { METADATA_CHAT_BOOTSTRAP_ENABLED: false },
}));

vi.mock("~/shared/lib/dm-index", () => ({
  loadDmIndexEntries: vi.fn(() => []),
  upsertDmIndexFromMessages: vi.fn(),
}));

vi.mock("~/entities/chat-list/chat-list.model", () => ({
  useChatListStore: {
    getState: () => ({
      currentUserId: 7,
      setFromMessages: setFromMessagesMock,
      addMessages: addMessagesMock,
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
  });

  it("applies full bootstrap via setFromMessages when not metadata-first", () => {
    const messages = [
      { id: 10, sender_id: 1, type: "stream", content: "hi", timestamp: 1 },
    ] as ZulipRawMessage[];
    const latestMessageIdRef = { current: null as number | null };

    applyChatListBootstrapResult(
      { mode: "full", messages, latestMessageIdHint: 5 },
      {
        currentInstanceId: "inst-1",
        setFromMessages: setFromMessagesMock,
        latestMessageIdRef,
      },
    );

    expect(setFromMessagesMock).toHaveBeenCalledWith(messages, 7);
    expect(latestMessageIdRef.current).toBe(10);
  });

  it("applies delta bootstrap via addMessages", () => {
    const messages = [
      { id: 20, sender_id: 2, type: "private", content: "dm", timestamp: 2 },
    ] as ZulipRawMessage[];

    applyChatListBootstrapResult(
      { mode: "delta", messages, latestMessageIdHint: 15 },
      {
        currentInstanceId: "inst-1",
        setFromMessages: setFromMessagesMock,
      },
    );

    expect(addMessagesMock).toHaveBeenCalledWith(messages);
    expect(setFromMessagesMock).not.toHaveBeenCalled();
  });
});
