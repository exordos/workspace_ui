/**
 * loadInitialMessagesForContext with IndexedDB persist: hydrate from cache, then always full API fetch.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setInstanceProvider } from "~/shared/api/client";
import type { MockMessage } from "~/shared/api/zulip.types";
import { ZULIP_STREAM_CHAT_NUM_BEFORE } from "~/shared/lib/zulip-message-window.lib";

const {
  mockGetChatMessagesAscending,
  mockFetchMessages,
  mockFetchDmMessages,
  mockFetchMessagesWithNarrow,
  mockGetChatMeta,
  mockUpdateChatMetaPatch,
  mockUpsertChatMessages,
} = vi.hoisted(() => ({
  mockGetChatMessagesAscending: vi.fn(),
  mockFetchMessages: vi.fn(),
  mockFetchDmMessages: vi.fn(),
  mockFetchMessagesWithNarrow: vi.fn(),
  mockGetChatMeta: vi.fn(),
  mockUpdateChatMetaPatch: vi.fn(),
  mockUpsertChatMessages: vi.fn(),
}));

vi.mock("~/shared/lib/env", async (importOriginal) => {
  const mod = await importOriginal<typeof import("~/shared/lib/env")>();
  return {
    env: {
      ...mod.env,
      CHAT_MESSAGES_PERSIST_INDEXEDDB: true,
      CHAT_MESSAGES_SOURCE_INDEXEDDB: true,
    },
  };
});

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
    fetchMessages: mockFetchMessages,
    fetchDmMessages: mockFetchDmMessages,
    fetchMessagesWithNarrow: mockFetchMessagesWithNarrow,
  };
});

import { useCurrentChatMessagesStore, type CurrentChatContext } from "./message.model";

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

describe("loadInitialMessagesForContext (IndexedDB hydrate + full API)", () => {
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
      pendingOutgoingEchoKeys: [],
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
      pendingOutgoingEchoKeys: [],
      hasOlderMessages: true,
      hasNewerMessages: false,
    });
  });

  it("with non-empty IDB cache still calls full fetchMessages (no delta-only path)", async () => {
    const ctx: CurrentChatContext = {
      type: "stream",
      streamId: 5,
      streamName: "general",
      topic: "topic1",
    };
    const cached = Array.from({ length: 15 }, (_, i) =>
      mockMsg({ id: 86 + i, stream_id: 5, subject: "topic1" }),
    );
    mockGetChatMessagesAscending.mockResolvedValue(cached);
    const boot = [mockMsg({ id: 200, stream_id: 5, subject: "topic1", content: "<p>api</p>" })];
    mockFetchMessages.mockResolvedValue(boot);

    await useCurrentChatMessagesStore.getState().loadInitialMessagesForContext({
      context: ctx,
      focusedMessageId: null,
      currentUserId: 1,
    });

    expect(mockGetChatMessagesAscending).toHaveBeenCalled();
    expect(mockFetchMessages).toHaveBeenCalledWith("general", "topic1");
    expect(useCurrentChatMessagesStore.getState().messages).toEqual(boot);
    expect(mockUpsertChatMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: boot,
        windowSizeN: ZULIP_STREAM_CHAT_NUM_BEFORE,
      }),
    );
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
    expect(mockUpsertChatMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: boot,
      }),
    );
  });

  it("with focusedMessageId skips IDB hydrate and uses fetchMessagesWithNarrow", async () => {
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
  });
});
