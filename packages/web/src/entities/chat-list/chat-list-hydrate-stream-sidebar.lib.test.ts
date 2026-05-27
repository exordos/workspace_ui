import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchStreamChannelMessagesForSidebarTopics } from "~/shared/api/zulip";
import type { ZulipRawMessage } from "~/shared/api/zulip.types";
import {
  clearStreamSidebarHydrateState,
  isStreamSidebarTopicsHydrateInFlight,
  queuePriorityStreamSidebarTopicsHydrate,
  requestStreamSidebarTopicsHydrate,
} from "./chat-list-hydrate-stream-sidebar.lib";
import { useChatListStore } from "./chat-list.model";

vi.mock("~/shared/api/zulip", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/shared/api/zulip")>();
  return {
    ...actual,
    fetchStreamChannelMessagesForSidebarTopics: vi.fn(),
  };
});

const fetchStreamChannelMock = vi.mocked(fetchStreamChannelMessagesForSidebarTopics);

async function flushMicrotasks(turns = 5): Promise<void> {
  for (let i = 0; i < turns; i += 1) {
    await Promise.resolve();
  }
}

function streamMsg(overrides: Partial<ZulipRawMessage> = {}): ZulipRawMessage {
  return {
    id: 1,
    sender_id: 10,
    sender_full_name: "Sender",
    content: "hello",
    timestamp: 1000,
    type: "stream",
    stream_id: 5,
    display_recipient: "general",
    subject: "topic1",
    flags: [],
    ...overrides,
  };
}

describe("requestStreamSidebarTopicsHydrate", () => {
  beforeEach(() => {
    clearStreamSidebarHydrateState();
    useChatListStore.getState().clear();
    fetchStreamChannelMock.mockReset();
  });

  afterEach(() => {
    clearStreamSidebarHydrateState();
    useChatListStore.getState().clear();
  });

  it("skips fetch when stream already has topics in store", async () => {
    useChatListStore.getState().upsertStreamMetadataRows([{ streamId: 5, name: "general" }]);
    useChatListStore
      .getState()
      .applyStreamSidebarPreviewsFromMessages([streamMsg({ stream_id: 5, subject: "existing" })]);

    await requestStreamSidebarTopicsHydrate(5, "expand");

    expect(fetchStreamChannelMock).not.toHaveBeenCalled();
  });

  it("dedupes concurrent hydrate for the same stream", async () => {
    useChatListStore.getState().upsertStreamMetadataRows([{ streamId: 5, name: "general" }]);
    let resolveFetch!: (value: ZulipRawMessage[]) => void;
    fetchStreamChannelMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const first = requestStreamSidebarTopicsHydrate(5, "expand");
    const second = requestStreamSidebarTopicsHydrate(5, "visible");
    expect(isStreamSidebarTopicsHydrateInFlight(5)).toBe(true);
    await flushMicrotasks();
    expect(fetchStreamChannelMock).toHaveBeenCalledTimes(1);

    resolveFetch([streamMsg({ stream_id: 5, subject: "lazy-topic" })]);
    await Promise.all([first, second]);

    expect(useChatListStore.getState().streamsMap.get(5)?.topics.has("lazy-topic")).toBe(true);
  });

  it("queuePriorityStreamSidebarTopicsHydrate requests hydrate for unread streams without topics", async () => {
    useChatListStore.getState().upsertStreamMetadataRows([
      { streamId: 5, name: "general" },
      { streamId: 6, name: "other" },
    ]);
    fetchStreamChannelMock.mockResolvedValue([streamMsg({ stream_id: 5, subject: "prio" })]);

    queuePriorityStreamSidebarTopicsHydrate({
      streams: [{ streamId: 5, topic: "t", unreadMessageIds: [1] }],
      dms: [],
      totalCount: 1,
      oldUnreadsMissing: false,
    });
    await flushMicrotasks(10);

    expect(fetchStreamChannelMock).toHaveBeenCalledTimes(1);
    expect(fetchStreamChannelMock.mock.calls[0]?.[0]).toBe(5);
  });

  it("does not mark hydrated when API returns empty messages (allows retry)", async () => {
    useChatListStore.getState().upsertStreamMetadataRows([{ streamId: 5, name: "general" }]);
    fetchStreamChannelMock.mockResolvedValue([]);

    await requestStreamSidebarTopicsHydrate(5, "expand");
    await requestStreamSidebarTopicsHydrate(5, "expand");

    expect(fetchStreamChannelMock).toHaveBeenCalledTimes(2);
    expect(useChatListStore.getState().streamsMap.get(5)?.topics.size).toBe(0);
  });
});
