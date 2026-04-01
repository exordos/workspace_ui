/**
 * loadInitialMessagesForContext when IndexedDB message source is enabled:
 * non-empty cache uses delta fetch; empty cache uses stream/DM bootstrap.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setInstanceProvider } from "~/shared/api/client";
import type { MockMessage } from "~/shared/api/zulip.types";
import { MESSAGE_CACHE_INITIAL_DELTA_NUM_AFTER } from "~/shared/lib/message-cache-db";

const {
  mockGetChatMessagesAscending,
  mockFetchMessagesWithNarrowPage,
  mockFetchMessages,
  mockFetchDmMessages,
  mockFetchMessagesWithNarrow,
  mockGetChatMeta,
  mockUpdateChatMetaPatch,
  mockUpsertChatMessages,
} = vi.hoisted(() => ({
  mockGetChatMessagesAscending: vi.fn(),
  mockFetchMessagesWithNarrowPage: vi.fn(),
  mockFetchMessages: vi.fn(),
  mockFetchDmMessages: vi.fn(),
  mockFetchMessagesWithNarrow: vi.fn(),
  mockGetChatMeta: vi.fn(),
  mockUpdateChatMetaPatch: vi.fn(),
  mockUpsertChatMessages: vi.fn(),
}));

vi.mock("~/shared/lib/env", () => ({
  env: {
    CHAT_MESSAGES_SOURCE_INDEXEDDB: true,
  },
}));

vi.mock("~/shared/lib/message-cache-db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/shared/lib/message-cache-db")>();
  return {
    ...actual,
    getChatMessagesAscending: mockGetChatMessagesAscending,
    getChatMeta: mockGetChatMeta,
    updateChatMetaPatch: mockUpdateChatMetaPatch,
    upsertChatMessages: mockUpsertChatMessages,
  };
});

vi.mock("~/shared/api/zulip", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/shared/api/zulip")>();
  return {
    ...actual,
    fetchMessagesWithNarrowPage: mockFetchMessagesWithNarrowPage,
    fetchMessages: mockFetchMessages,
    fetchDmMessages: mockFetchDmMessages,
    fetchMessagesWithNarrow: mockFetchMessagesWithNarrow,
  };
});

import {
  useCurrentChatMessagesStore,
  type CurrentChatContext,
} from "./message.model";

function mockMsg(overrides: Partial<MockMessage> = {}): MockMessage {
  return {
    id: 1,
    sender_id: 10,
    sender_full_name: "Test User",
    stream_id: 5,
    subject: "topic1",
    content: "<p>hello</p>",
    timestamp: 1000,
    ...overrides,
  };
}

describe("loadInitialMessagesForContext (IndexedDB incremental)", () => {
  beforeEach(() => {
    const runtimeTestApiKey = `runtime-test-key-${Date.now()}`;
    setInstanceProvider(() => ({
      id: "test-instance",
      realm: "https://zulip.test",
      email: "test@zulip.test",
      apiKey: runtimeTestApiKey,
    }));
    useCurrentChatMessagesStore.setState({
      context: null,
      messages: [],
      hasOlderMessages: true,
      hasNewerMessages: false,
    });
    vi.clearAllMocks();
    mockGetChatMeta.mockResolvedValue({ reachedOldest: false, reachedNewest: false });
    mockUpdateChatMetaPatch.mockResolvedValue(undefined);
    mockUpsertChatMessages.mockResolvedValue(undefined);
  });

  afterEach(() => {
    setInstanceProvider(() => null);
    useCurrentChatMessagesStore.setState({
      context: null,
      messages: [],
      hasOlderMessages: true,
      hasNewerMessages: false,
    });
  });

  it("with non-empty IDB cache uses delta fetch (anchor newest cached, num_before 0)", async () => {
    const ctx: CurrentChatContext = {
      type: "stream",
      streamId: 5,
      streamName: "general",
      topic: "topic1",
    };
    const cached = [mockMsg({ id: 100, stream_id: 5, subject: "topic1" })];
    mockGetChatMessagesAscending.mockResolvedValue(cached);
    mockFetchMessagesWithNarrowPage.mockResolvedValue({
      messages: [mockMsg({ id: 101, stream_id: 5, subject: "topic1", content: "<p>n</p>" })],
      foundOldest: false,
      foundNewest: true,
    });

    await useCurrentChatMessagesStore.getState().loadInitialMessagesForContext({
      context: ctx,
      focusedMessageId: null,
      currentUserId: 1,
    });

    expect(mockFetchMessagesWithNarrowPage).toHaveBeenCalledTimes(1);
    expect(mockFetchMessagesWithNarrowPage).toHaveBeenCalledWith(
      [
        { operator: "stream", operand: "general" },
        { operator: "topic", operand: "topic1" },
      ],
      100,
      0,
      MESSAGE_CACHE_INITIAL_DELTA_NUM_AFTER,
    );
    expect(mockFetchMessages).not.toHaveBeenCalled();

    const state = useCurrentChatMessagesStore.getState();
    expect(state.messages.map((m) => m.id)).toEqual([100, 101]);
    expect(mockUpsertChatMessages).toHaveBeenCalledTimes(1);
    expect(mockUpsertChatMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([expect.objectContaining({ id: 101 })]),
      }),
    );
    expect(mockUpsertChatMessages.mock.calls[0]![0].messages).toHaveLength(1);
  });

  it("with empty IDB cache uses stream bootstrap fetchMessages", async () => {
    const ctx: CurrentChatContext = {
      type: "stream",
      streamId: 5,
      streamName: "general",
      topic: "topic1",
    };
    mockGetChatMessagesAscending.mockResolvedValue([]);
    const boot = [mockMsg({ id: 1, stream_id: 5, subject: "topic1" })];
    mockFetchMessages.mockResolvedValue(boot);

    await useCurrentChatMessagesStore.getState().loadInitialMessagesForContext({
      context: ctx,
      focusedMessageId: null,
      currentUserId: 1,
    });

    expect(mockFetchMessages).toHaveBeenCalledWith("general", "topic1");
    expect(mockFetchMessagesWithNarrowPage).not.toHaveBeenCalled();
    expect(mockUpsertChatMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: boot,
      }),
    );
  });

  it("with focusedMessageId skips incremental path and uses fetchMessagesWithNarrow", async () => {
    const ctx: CurrentChatContext = {
      type: "stream",
      streamId: 5,
      streamName: "general",
      topic: "topic1",
    };
    const focused = [mockMsg({ id: 50, stream_id: 5, subject: "topic1" })];
    mockFetchMessagesWithNarrow.mockResolvedValue(focused);

    await useCurrentChatMessagesStore.getState().loadInitialMessagesForContext({
      context: ctx,
      focusedMessageId: 50,
      currentUserId: 1,
    });

    expect(mockGetChatMessagesAscending).not.toHaveBeenCalled();
    expect(mockFetchMessagesWithNarrow).toHaveBeenCalled();
    expect(mockFetchMessagesWithNarrowPage).not.toHaveBeenCalled();
  });

  it("falls back to full fetch when delta request fails", async () => {
    const ctx: CurrentChatContext = {
      type: "stream",
      streamId: 5,
      streamName: "general",
      topic: "topic1",
    };
    mockGetChatMessagesAscending.mockResolvedValue([
      mockMsg({ id: 200, stream_id: 5, subject: "topic1" }),
    ]);
    mockFetchMessagesWithNarrowPage.mockRejectedValue(new Error("network"));
    const boot = [mockMsg({ id: 1, stream_id: 5, subject: "topic1" })];
    mockFetchMessages.mockResolvedValue(boot);

    await useCurrentChatMessagesStore.getState().loadInitialMessagesForContext({
      context: ctx,
      focusedMessageId: null,
      currentUserId: 1,
    });

    expect(mockFetchMessages).toHaveBeenCalled();
    expect(useCurrentChatMessagesStore.getState().messages).toEqual(boot);
  });
});
