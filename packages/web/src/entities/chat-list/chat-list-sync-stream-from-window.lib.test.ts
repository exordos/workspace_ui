import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUsersStore } from "~/entities/user/user.model";
import type { MockMessage } from "~/shared/api/zulip.types";

const isHydrateInFlightMock = vi.hoisted(() => vi.fn((_streamId: number) => false));

vi.mock("./chat-list-hydrate-stream-sidebar.lib", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./chat-list-hydrate-stream-sidebar.lib")>();
  return {
    ...actual,
    isStreamSidebarTopicsHydrateInFlight: (streamId: number) => isHydrateInFlightMock(streamId),
  };
});

import { clearStreamSidebarHydrateState } from "./chat-list-hydrate-stream-sidebar.lib";
import {
  filterMessagesForStreamId,
  shouldSyncStreamPreviewFromWindow,
  syncStreamSidebarFromLoadedMessages,
} from "./chat-list-sync-stream-from-window.lib";
import { useChatListStore } from "./chat-list.model";

vi.mock("~/shared/api/zulip", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/shared/api/zulip")>();
  return {
    ...actual,
    fetchStreamChannelMessagesForSidebarTopics: vi.fn(() => new Promise(() => {})),
  };
});

function streamMessage(overrides: Partial<MockMessage> = {}): MockMessage {
  return {
    id: 50,
    sender_id: 20,
    sender_full_name: "Bob",
    content: "hello",
    timestamp: 2000,
    stream_id: 99,
    subject: "topic-a",
    display_recipient: "engineering",
    flags: [],
    ...overrides,
  };
}

describe("shouldSyncStreamPreviewFromWindow", () => {
  it("allows sync for normal stream open without focused anchor", () => {
    expect(
      shouldSyncStreamPreviewFromWindow({ focusedMessageId: null, hasNewerMessages: true }),
    ).toBe(true);
  });

  it("skips sync when focused anchor has newer messages beyond the window", () => {
    expect(
      shouldSyncStreamPreviewFromWindow({ focusedMessageId: 100, hasNewerMessages: true }),
    ).toBe(false);
  });

  it("allows sync when focused anchor reached conversation end", () => {
    expect(
      shouldSyncStreamPreviewFromWindow({ focusedMessageId: 100, hasNewerMessages: false }),
    ).toBe(true);
  });
});

describe("filterMessagesForStreamId", () => {
  it("keeps only messages for the requested stream", () => {
    const messages = [
      streamMessage({ id: 1, stream_id: 99, subject: "a" }),
      streamMessage({ id: 2, stream_id: 100, subject: "b" }),
      streamMessage({ id: 3, stream_id: 99, subject: "c" }),
    ];
    const filtered = filterMessagesForStreamId(messages, 99);
    expect(filtered.map((m) => m.id)).toEqual([1, 3]);
  });
});

describe("syncStreamSidebarFromLoadedMessages", () => {
  let applySpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    useChatListStore.getState().clear();
    useUsersStore.getState().clear();
    useUsersStore.getState().mergeUser({ user_id: 20, full_name: "Bob", email: "b@x.test" });
    useChatListStore.getState().upsertStreamMetadataRows([{ streamId: 99, name: "engineering" }]);
    applySpy = vi.spyOn(useChatListStore.getState(), "applyStreamSidebarPreviewsFromMessages");
  });

  afterEach(() => {
    applySpy.mockRestore();
    clearStreamSidebarHydrateState();
    useChatListStore.getState().clear();
    useUsersStore.getState().clear();
    isHydrateInFlightMock.mockReset();
  });

  it("fills empty stream topics from opened chat window", () => {
    syncStreamSidebarFromLoadedMessages({
      messages: [
        streamMessage({
          id: 10,
          content: "preview from opened chat",
          subject: "topic-a",
          timestamp: 1_750_000_000,
        }),
      ],
      streamId: 99,
      source: "api",
      focusedMessageId: null,
      hasNewerMessages: false,
    });

    expect(applySpy).toHaveBeenCalledTimes(1);
    const stream = useChatListStore.getState().streamsMap.get(99);
    expect(stream?.topics.get("topic-a")?.lastMessage).toContain("preview from opened chat");
    expect(useChatListStore.getState().sidebarStreamsUnread).toBe(0);
  });

  it("skips sync while lazy hydrate is in flight for the stream", () => {
    isHydrateInFlightMock.mockReturnValue(true);

    syncStreamSidebarFromLoadedMessages({
      messages: [streamMessage({ id: 11, content: "during hydrate" })],
      streamId: 99,
      source: "api",
      focusedMessageId: null,
      hasNewerMessages: false,
    });

    expect(applySpy).not.toHaveBeenCalled();
  });

  it("does not update preview when focused anchor window excludes channel tail", () => {
    syncStreamSidebarFromLoadedMessages({
      messages: [
        streamMessage({
          id: 100,
          content: "stale anchor window",
          timestamp: 1_000_000_000,
        }),
      ],
      streamId: 99,
      source: "api",
      focusedMessageId: 100,
      hasNewerMessages: true,
    });

    expect(useChatListStore.getState().streamsMap.get(99)?.topics.size).toBe(0);
  });

  it("indexes unread message locations even when preview sync is skipped", () => {
    syncStreamSidebarFromLoadedMessages({
      messages: [
        streamMessage({
          id: 555,
          subject: "topic-a",
          flags: ["unread"],
        }),
      ],
      streamId: 99,
      source: "api",
      focusedMessageId: 999,
      hasNewerMessages: true,
    });

    expect(useChatListStore.getState().messageIdToLocation.get(555)?.type).toBe("stream");
  });
});
