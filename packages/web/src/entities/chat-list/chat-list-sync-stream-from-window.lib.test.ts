import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUsersStore } from "~/entities/user/user.model";
import type { MockMessage } from "~/shared/api/messenger.types";
import { testMessageId } from "~/test/factories";

const STREAM_UUID = "11111111-1111-4111-8111-111111111111";
const OTHER_STREAM_UUID = "22222222-2222-4222-8222-222222222222";

const isHydrateInFlightMock = vi.hoisted(() => vi.fn((_streamId: string) => false));

vi.mock("./chat-list-hydrate-stream-sidebar.lib", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./chat-list-hydrate-stream-sidebar.lib")>();
  return {
    ...actual,
    isStreamSidebarTopicsHydrateInFlight: (streamId: string) => isHydrateInFlightMock(streamId),
  };
});

import { clearStreamSidebarHydrateState } from "./chat-list-hydrate-stream-sidebar.lib";
import {
  filterMessagesForStreamId,
  shouldSyncStreamPreviewFromWindow,
  syncStreamSidebarFromLoadedMessages,
} from "./chat-list-sync-stream-from-window.lib";
import { useChatListStore } from "./chat-list.model";

vi.mock("~/shared/api/messenger-sidebar-preview.lib", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/shared/api/messenger-sidebar-preview.lib")>();
  return {
    ...actual,
    fetchStreamChannelMessagesForSidebarTopics: vi.fn(() => new Promise(() => {})),
  };
});

type MockMessageOverrides = Partial<Omit<MockMessage, "id">> & {
  id?: MockMessage["id"] | number;
};

function streamMessage(overrides: MockMessageOverrides = {}): MockMessage {
  const { id, ...rest } = overrides;
  return {
    id: testMessageId(id ?? 50),
    sender_id: 20,
    sender_full_name: "Bob",
    content: "hello",
    timestamp: 2000,
    stream_uuid: STREAM_UUID,
    subject: "topic-a",
    display_recipient: "engineering",
    flags: [],
    ...rest,
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
      shouldSyncStreamPreviewFromWindow({
        focusedMessageId: "00000000-0000-4000-8000-000000000100",
        hasNewerMessages: true,
      }),
    ).toBe(false);
  });

  it("allows sync when focused anchor reached conversation end", () => {
    expect(
      shouldSyncStreamPreviewFromWindow({
        focusedMessageId: "00000000-0000-4000-8000-000000000100",
        hasNewerMessages: false,
      }),
    ).toBe(true);
  });
});

describe("filterMessagesForStreamId", () => {
  it("keeps only messages for the requested stream", () => {
    const messages = [
      streamMessage({ id: "00000000-0000-4000-8000-000000000001", subject: "a" }),
      streamMessage({
        id: "00000000-0000-4000-8000-000000000002",
        stream_uuid: OTHER_STREAM_UUID,
        subject: "b",
      }),
      streamMessage({ id: "00000000-0000-4000-8000-000000000003", subject: "c" }),
    ];
    const filtered = filterMessagesForStreamId(messages, STREAM_UUID);
    expect(filtered.map((m) => m.id)).toEqual([testMessageId(1), testMessageId(3)]);
  });
});

describe("syncStreamSidebarFromLoadedMessages", () => {
  let applySpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    useChatListStore.getState().clear();
    useUsersStore.getState().clear();
    useUsersStore.getState().mergeUser({ user_id: 20, full_name: "Bob", email: "b@x.test" });
    useChatListStore
      .getState()
      .upsertStreamMetadataRows([{ streamUuid: STREAM_UUID, name: "engineering" }]);
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
          id: "00000000-0000-4000-8000-000000000010",
          content: "preview from opened chat",
          subject: "topic-a",
          timestamp: 1_750_000_000,
        }),
      ],
      streamId: STREAM_UUID,
      source: "api",
      focusedMessageId: null,
      hasNewerMessages: false,
    });

    expect(applySpy).toHaveBeenCalledTimes(1);
    const stream = useChatListStore.getState().streamsMap.get(STREAM_UUID);
    expect(stream?.topics.get("topic-a")?.lastMessage).toContain("preview from opened chat");
    expect(useChatListStore.getState().sidebarStreamsUnread).toBe(0);
  });

  it("skips sync while lazy hydrate is in flight for the stream", () => {
    isHydrateInFlightMock.mockReturnValue(true);

    syncStreamSidebarFromLoadedMessages({
      messages: [streamMessage({ id: 11, content: "during hydrate" })],
      streamId: STREAM_UUID,
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
      streamId: STREAM_UUID,
      source: "api",
      focusedMessageId: "00000000-0000-4000-8000-000000000100",
      hasNewerMessages: true,
    });

    expect(useChatListStore.getState().streamsMap.get(STREAM_UUID)?.topics.size).toBe(0);
  });

  it("indexes loaded message locations even when preview sync is skipped", () => {
    syncStreamSidebarFromLoadedMessages({
      messages: [
        streamMessage({
          id: "00000000-0000-4000-8000-000000000555",
          subject: "topic-a",
          read: false,
        }),
      ],
      streamId: STREAM_UUID,
      source: "api",
      focusedMessageId: "00000000-0000-4000-8000-000000000999",
      hasNewerMessages: true,
    });

    expect(
      useChatListStore.getState().messageIdToLocation.get("00000000-0000-4000-8000-000000000555")
        ?.type,
    ).toBe("stream");
  });
});
