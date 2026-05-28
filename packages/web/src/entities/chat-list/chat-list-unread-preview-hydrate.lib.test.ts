import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchMessagesByIds } from "~/shared/api/zulip-messages";
import type { ZulipUnreadMessagesSnapshot } from "~/shared/api/zulip-unread.lib";
import type { ZulipRawMessage } from "~/shared/api/zulip.types";
import {
  hydrateStreamSidebarPreviewsFromUnreadSnapshot,
  resolveLatestUnreadMessageIdsForMissingPreviews,
} from "./chat-list-unread-preview-hydrate.lib";
import { useChatListStore } from "./chat-list.model";

vi.mock("~/shared/api/zulip-messages", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/shared/api/zulip-messages")>();
  return {
    ...actual,
    fetchMessagesByIds: vi.fn(),
  };
});

const fetchMessagesByIdsMock = vi.mocked(fetchMessagesByIds);

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

describe("resolveLatestUnreadMessageIdsForMissingPreviews", () => {
  beforeEach(() => {
    useChatListStore.getState().clear();
  });

  afterEach(() => {
    useChatListStore.getState().clear();
  });

  it("picks max unread id per bucket and dedupes ids", () => {
    useChatListStore.getState().upsertStreamMetadataRows([{ streamId: 5, name: "general" }]);
    const snapshot: ZulipUnreadMessagesSnapshot = {
      streams: [
        { streamId: 5, topic: "alpha", unreadMessageIds: [1, 5, 3] },
        { streamId: 5, topic: "beta", unreadMessageIds: [5, 2] },
      ],
      dms: [],
      totalCount: 5,
    };

    const ids = resolveLatestUnreadMessageIdsForMissingPreviews(
      snapshot,
      useChatListStore.getState().streamsMap,
    );

    expect(ids).toEqual([5]);
  });

  it("skips bucket when topic preview already exists and stream preview is non-empty", () => {
    useChatListStore.getState().upsertStreamMetadataRows([{ streamId: 5, name: "general" }]);
    useChatListStore
      .getState()
      .applyStreamSidebarPreviewsFromMessages([
        streamMsg({ id: 10, subject: "alpha", content: "ok" }),
      ]);

    const snapshot: ZulipUnreadMessagesSnapshot = {
      streams: [{ streamId: 5, topic: "alpha", unreadMessageIds: [99] }],
      dms: [],
      totalCount: 1,
    };

    const ids = resolveLatestUnreadMessageIdsForMissingPreviews(
      snapshot,
      useChatListStore.getState().streamsMap,
    );

    expect(ids).toEqual([]);
  });
});

describe("hydrateStreamSidebarPreviewsFromUnreadSnapshot", () => {
  beforeEach(() => {
    useChatListStore.getState().clear();
    fetchMessagesByIdsMock.mockReset();
  });

  afterEach(() => {
    useChatListStore.getState().clear();
  });

  it("fetches latest unread ids and applies stream/topic preview merge", async () => {
    useChatListStore.getState().upsertStreamMetadataRows([{ streamId: 5, name: "general" }]);

    const snapshot: ZulipUnreadMessagesSnapshot = {
      streams: [{ streamId: 5, topic: "alpha", unreadMessageIds: [301, 302] }],
      dms: [],
      totalCount: 2,
    };

    fetchMessagesByIdsMock.mockResolvedValue([
      streamMsg({
        id: 302,
        stream_id: 5,
        subject: "alpha",
        content: "fresh preview",
        timestamp: 9000,
        sender_full_name: "Fresh Sender",
      }),
    ]);

    await hydrateStreamSidebarPreviewsFromUnreadSnapshot(snapshot);

    expect(fetchMessagesByIdsMock).toHaveBeenCalledWith([302]);
    const stream = useChatListStore.getState().streamsMap.get(5);
    expect(stream?.topics.get("alpha")?.lastMessage).toContain("fresh preview");
    expect(stream?.topics.get("alpha")?.ts).toBe(9000);
    expect(stream?.ts).toBe(9000);
    expect(stream?.lastMessage).toContain("fresh preview");
  });

  it("dedupes concurrent hydrate calls", async () => {
    useChatListStore.getState().upsertStreamMetadataRows([{ streamId: 5, name: "general" }]);
    const snapshot: ZulipUnreadMessagesSnapshot = {
      streams: [{ streamId: 5, topic: "alpha", unreadMessageIds: [301] }],
      dms: [],
      totalCount: 1,
    };

    let resolveFetch!: (value: ZulipRawMessage[]) => void;
    fetchMessagesByIdsMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const first = hydrateStreamSidebarPreviewsFromUnreadSnapshot(snapshot);
    const second = hydrateStreamSidebarPreviewsFromUnreadSnapshot(snapshot);

    expect(fetchMessagesByIdsMock).toHaveBeenCalledTimes(1);

    resolveFetch([
      streamMsg({
        id: 301,
        stream_id: 5,
        subject: "alpha",
        content: "hello",
        timestamp: 2000,
      }),
    ]);

    await Promise.all([first, second]);
    expect(fetchMessagesByIdsMock).toHaveBeenCalledTimes(1);
  });
});
