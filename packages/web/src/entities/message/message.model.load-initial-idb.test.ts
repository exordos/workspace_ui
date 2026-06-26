/**
 * loadInitialMessagesForContext with IndexedDB persist: hydrate from cache, then always full API fetch.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setInstanceProvider } from "~/shared/api/client";
import { type MockMessage } from "~/shared/api/zulip.types";
// eslint-disable-next-line import-x/order -- inline type + lib import; false positive
import {
  ZULIP_DM_ANCHOR_NUM_AFTER,
  ZULIP_DM_ANCHOR_NUM_BEFORE,
  ZULIP_STREAM_ANCHOR_NUM_AFTER,
  ZULIP_STREAM_ANCHOR_NUM_BEFORE,
} from "~/shared/lib/zulip-message-window.lib";
const {
  mockGetChatMessagesAscending,
  mockGetStreamMessagesAscending,
  mockFetchMessages,
  mockFetchDmMessages,
  mockFetchMessagesWithNarrow,
  mockGetChatMeta,
  mockUpdateChatMetaPatch,
  mockUpsertChatMessages,
  mockIsActiveOrgRequestInvalidated,
} = vi.hoisted(() => ({
  mockGetChatMessagesAscending: vi.fn(),
  mockGetStreamMessagesAscending: vi.fn(),
  mockFetchMessages: vi.fn(),
  mockFetchDmMessages: vi.fn(),
  mockFetchMessagesWithNarrow: vi.fn(),
  mockGetChatMeta: vi.fn(),
  mockUpdateChatMetaPatch: vi.fn(),
  mockUpsertChatMessages: vi.fn(),
  mockIsActiveOrgRequestInvalidated: vi.fn(() => false),
}));

vi.mock("~/entities/instance/instance.model", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/entities/instance/instance.model")>();
  return {
    ...actual,
    isActiveOrgRequestInvalidated: mockIsActiveOrgRequestInvalidated,
  };
});

vi.mock("~/shared/lib/env", async (importOriginal) => {
  const mod = await importOriginal<typeof import("~/shared/lib/env")>();
  return {
    env: {
      ...mod.env,
      CHAT_MESSAGES_PERSIST_INDEXEDDB: true,
    },
  };
});

vi.mock("~/shared/lib/message-cache-db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/shared/lib/message-cache-db")>();
  return {
    ...actual,
    getChatMessagesAscending: mockGetChatMessagesAscending,
    getStreamMessagesAscending: mockGetStreamMessagesAscending,
    getChatMeta: mockGetChatMeta,
    updateChatMetaPatch: mockUpdateChatMetaPatch,
    upsertChatMessages: mockUpsertChatMessages,
  };
});

vi.mock("~/shared/api/zulip-messages", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/shared/api/zulip-messages")>();
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
      isLoadingNewer: false,
      hasOlderMessages: true,
      hasNewerMessages: false,
    });
    vi.clearAllMocks();
    mockIsActiveOrgRequestInvalidated.mockReturnValue(false);
    mockGetChatMeta.mockResolvedValue({ reachedOldest: false, reachedNewest: false });
    mockUpdateChatMetaPatch.mockResolvedValue(undefined);
    mockUpsertChatMessages.mockResolvedValue(undefined);
    mockGetStreamMessagesAscending.mockResolvedValue([]);
  });

  afterEach(() => {
    setInstanceProvider(() => null);
    useCurrentChatMessagesStore.setState({
      context: null,
      messages: [],
      pendingOutgoingEchoKeys: [],
      isLoadingNewer: false,
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
    expect(mockFetchMessages).toHaveBeenCalledWith(
      "general",
      "topic1",
      undefined,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(useCurrentChatMessagesStore.getState().messages).toEqual(boot);
    expect(mockUpsertChatMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: boot,
        windowSizeN: ZULIP_STREAM_ANCHOR_NUM_BEFORE,
      }),
    );
  });

  it("keeps IDB-hydrated messages when the network refresh returns an empty list", async () => {
    const ctx: CurrentChatContext = {
      type: "stream",
      streamId: 5,
      streamName: "general",
      topic: "topic1",
    };
    const cached = [mockMsg({ id: 86, stream_id: 5, subject: "topic1", content: "<p>cached</p>" })];
    mockGetChatMessagesAscending.mockResolvedValue(cached);
    mockFetchMessages.mockResolvedValue([]);

    await useCurrentChatMessagesStore.getState().loadInitialMessagesForContext({
      context: ctx,
      focusedMessageId: null,
      currentUserId: 1,
    });

    expect(useCurrentChatMessagesStore.getState().messages).toEqual(cached);
    expect(useCurrentChatMessagesStore.getState().context).toMatchObject({
      type: "stream",
      streamId: 5,
      streamName: "general",
      topic: "topic1",
    });
  });

  it("does not let cache metadata mark the live tail as having newer messages", async () => {
    const ctx: CurrentChatContext = {
      type: "stream",
      streamId: 5,
      streamName: "general",
      topic: "topic1",
    };
    const cached = [mockMsg({ id: 86, stream_id: 5, subject: "topic1", content: "<p>cached</p>" })];
    const deferred = Promise.withResolvers<MockMessage[]>();
    mockGetChatMessagesAscending.mockResolvedValue(cached);
    mockGetChatMeta.mockResolvedValue({ reachedOldest: false, reachedNewest: false });
    mockFetchMessages.mockReturnValue(deferred.promise);

    useCurrentChatMessagesStore.getState().setContext(ctx);
    const loadPromise = useCurrentChatMessagesStore.getState().loadInitialMessagesForContext({
      context: ctx,
      focusedMessageId: null,
      currentUserId: 1,
    });

    await vi.waitFor(() => {
      expect(useCurrentChatMessagesStore.getState().messages).toEqual(cached);
    });
    expect(useCurrentChatMessagesStore.getState().hasOlderMessages).toBe(true);
    expect(useCurrentChatMessagesStore.getState().hasNewerMessages).toBe(false);

    deferred.resolve([mockMsg({ id: 200, stream_id: 5, subject: "topic1" })]);
    await loadPromise;
  });

  it("keeps cache-hydrated messages when active org becomes stale before API apply", async () => {
    const ctx: CurrentChatContext = {
      type: "stream",
      streamId: 5,
      streamName: "general",
      topic: "topic1",
    };
    const cached = [mockMsg({ id: 86, stream_id: 5, subject: "topic1", content: "<p>cached</p>" })];
    const apiMessages = [
      mockMsg({ id: 200, stream_id: 5, subject: "topic1", content: "<p>api</p>" }),
    ];
    const deferred = Promise.withResolvers<MockMessage[]>();
    mockGetChatMessagesAscending.mockResolvedValue(cached);
    mockGetChatMeta.mockResolvedValue({ reachedOldest: false, reachedNewest: false });
    mockFetchMessages.mockReturnValue(deferred.promise);

    useCurrentChatMessagesStore.getState().setContext(ctx);
    const loadPromise = useCurrentChatMessagesStore.getState().loadInitialMessagesForContext({
      context: ctx,
      focusedMessageId: null,
      currentUserId: 1,
      orgContext: { instanceId: "inst-1", epoch: 1 },
    });

    await vi.waitFor(() => {
      expect(useCurrentChatMessagesStore.getState().messages).toEqual(cached);
    });
    mockIsActiveOrgRequestInvalidated.mockReturnValue(true);

    deferred.resolve(apiMessages);
    await loadPromise;

    expect(useCurrentChatMessagesStore.getState().messages).toEqual(cached);
  });

  it("keeps cache-hydrated live tail unblocked when network refresh fails", async () => {
    const ctx: CurrentChatContext = {
      type: "dm",
      dmKey: "7,42",
    };
    const cached = [mockMsg({ id: 86, stream_id: null, content: "<p>cached dm</p>" })];
    mockGetChatMessagesAscending.mockResolvedValue(cached);
    mockGetChatMeta.mockResolvedValue({ reachedOldest: false, reachedNewest: false });
    mockFetchDmMessages.mockRejectedValue(new Error("network down"));

    useCurrentChatMessagesStore.getState().setContext(ctx);
    await useCurrentChatMessagesStore.getState().loadInitialMessagesForContext({
      context: ctx,
      focusedMessageId: null,
      currentUserId: 7,
    });

    expect(useCurrentChatMessagesStore.getState().initialLoadError).toContain("network down");
    expect(useCurrentChatMessagesStore.getState().messages).toEqual(cached);
    expect(useCurrentChatMessagesStore.getState().hasOlderMessages).toBe(true);
    expect(useCurrentChatMessagesStore.getState().hasNewerMessages).toBe(false);
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

    expect(mockFetchMessages).toHaveBeenCalledWith(
      "general",
      "topic1",
      undefined,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
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
    expect(mockFetchMessagesWithNarrow).toHaveBeenCalledWith(
      [
        { operator: "stream", operand: "general" },
        { operator: "topic", operand: "topic1" },
      ],
      50,
      ZULIP_STREAM_ANCHOR_NUM_BEFORE,
      ZULIP_STREAM_ANCHOR_NUM_AFTER,
      expect.objectContaining({ signal: expect.any(AbortSignal), applyMarkdown: false }),
    );
  });

  it("uses DM default narrow window when focused message id is provided in dm context", async () => {
    const ctx: CurrentChatContext = {
      type: "dm",
      dmKey: "7,42",
    };
    const focusedDm = [mockMsg({ id: 50, stream_id: null })];
    mockFetchMessagesWithNarrow.mockResolvedValue(focusedDm);

    await useCurrentChatMessagesStore.getState().loadInitialMessagesForContext({
      context: ctx,
      focusedMessageId: 50,
      currentUserId: 7,
    });

    expect(mockFetchMessagesWithNarrow).toHaveBeenCalledWith(
      [{ operator: "dm", operand: [42] }],
      50,
      ZULIP_DM_ANCHOR_NUM_BEFORE,
      ZULIP_DM_ANCHOR_NUM_AFTER,
      expect.objectContaining({ signal: expect.any(AbortSignal), applyMarkdown: false }),
    );
  });

  it("uses explicit topic narrow for general topic route", async () => {
    const ctx: CurrentChatContext = {
      type: "stream",
      streamId: 5,
      streamName: "general",
      topic: "general",
      streamWideView: false,
    };
    mockGetChatMessagesAscending.mockResolvedValue([]);
    mockFetchMessages.mockResolvedValue([mockMsg({ id: 2, stream_id: 5, subject: "general" })]);

    await useCurrentChatMessagesStore.getState().loadInitialMessagesForContext({
      context: ctx,
      focusedMessageId: null,
      currentUserId: 1,
    });

    expect(mockFetchMessages).toHaveBeenCalledWith(
      "general",
      "general",
      undefined,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("hydrates stream-wide mode from merged stream cache and limits to 100", async () => {
    const ctx: CurrentChatContext = {
      type: "stream",
      streamId: 5,
      streamName: "general",
      topic: "general",
      streamWideView: true,
    };
    const cachedWide = Array.from({ length: 130 }, (_, i) =>
      mockMsg({
        id: i + 1,
        stream_id: 5,
        subject: i % 2 === 0 ? "alpha" : "beta",
      }),
    );
    mockGetStreamMessagesAscending.mockResolvedValue(cachedWide);

    const deferred = Promise.withResolvers<MockMessage[]>();
    mockFetchMessages.mockReturnValue(deferred.promise);

    const loadPromise = useCurrentChatMessagesStore.getState().loadInitialMessagesForContext({
      context: ctx,
      focusedMessageId: null,
      currentUserId: 1,
    });

    await vi.waitFor(() => {
      expect(mockGetStreamMessagesAscending).toHaveBeenCalledWith("test-instance", 5);
    });
    await vi.waitFor(() => {
      expect(useCurrentChatMessagesStore.getState().messages).toHaveLength(100);
    });

    const hydrated = useCurrentChatMessagesStore.getState().messages;
    expect(hydrated).toHaveLength(100);
    expect(hydrated[0]!.id).toBe(31);
    expect(hydrated[99]!.id).toBe(130);

    deferred.resolve([mockMsg({ id: 999, stream_id: 5, subject: "alpha" })]);
    await loadPromise;
  });

  it("persists stream-wide response by topic partitions instead of single stream key", async () => {
    const ctx: CurrentChatContext = {
      type: "stream",
      streamId: 5,
      streamName: "general",
      topic: "general",
      streamWideView: true,
    };
    mockGetStreamMessagesAscending.mockResolvedValue([]);
    mockFetchMessages.mockResolvedValue([
      mockMsg({ id: 10, stream_id: 5, subject: "alpha" }),
      mockMsg({ id: 11, stream_id: 5, subject: "beta" }),
    ]);

    await useCurrentChatMessagesStore.getState().loadInitialMessagesForContext({
      context: ctx,
      focusedMessageId: null,
      currentUserId: 1,
    });

    const upsertCalls = mockUpsertChatMessages.mock.calls.map(
      (call) => (call[0] as { chatKey: string }).chatKey,
    );
    expect(upsertCalls).toContain("stream:5:alpha");
    expect(upsertCalls).toContain("stream:5:beta");
    expect(upsertCalls).not.toContain("stream:5:general");
  });

  it("ignores stale initial response when previous request resolves after route switch", async () => {
    const firstCtx: CurrentChatContext = {
      type: "stream",
      streamId: 5,
      streamName: "general",
      topic: "topic-1",
      streamWideView: false,
    };
    const secondCtx: CurrentChatContext = {
      type: "stream",
      streamId: 5,
      streamName: "general",
      topic: "topic-2",
      streamWideView: false,
    };

    mockGetChatMessagesAscending.mockResolvedValue([]);
    const firstDeferred = Promise.withResolvers<MockMessage[]>();
    const secondDeferred = Promise.withResolvers<MockMessage[]>();
    mockFetchMessages.mockImplementation((_, topic) => {
      if (topic === "topic-1") return firstDeferred.promise;
      if (topic === "topic-2") return secondDeferred.promise;
      return Promise.resolve([]);
    });

    const firstLoad = useCurrentChatMessagesStore.getState().loadInitialMessagesForContext({
      context: firstCtx,
      focusedMessageId: null,
      currentUserId: 1,
    });
    const secondLoad = useCurrentChatMessagesStore.getState().loadInitialMessagesForContext({
      context: secondCtx,
      focusedMessageId: null,
      currentUserId: 1,
    });

    secondDeferred.resolve([mockMsg({ id: 202, stream_id: 5, subject: "topic-2" })]);
    await secondLoad;
    expect(useCurrentChatMessagesStore.getState().messages[0]?.subject).toBe("topic-2");

    firstDeferred.resolve([mockMsg({ id: 101, stream_id: 5, subject: "topic-1" })]);
    await firstLoad;
    expect(useCurrentChatMessagesStore.getState().messages[0]?.subject).toBe("topic-2");
  });
});
