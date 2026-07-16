/**
 * loadInitialMessagesForContext with IndexedDB persist: hydrate from cache, then always full API fetch.
 *
 * The network fetch is the unified gateway page fetch ({@link fetchChatMessagesPage}); these tests
 * stub it directly and assert the store's cache/persist/stale-guard behavior around it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setInstanceProvider } from "~/shared/api/client";
import { type MessagesPageResult, type MockMessage } from "~/shared/api/messenger.types";
import { testMessageId } from "~/test/factories";
// eslint-disable-next-line import-x/order -- inline type + lib import; false positive
import {
  MESSENGER_DM_ANCHOR_NUM_AFTER,
  MESSENGER_DM_ANCHOR_NUM_BEFORE,
  MESSENGER_STREAM_ANCHOR_NUM_AFTER,
  MESSENGER_STREAM_ANCHOR_NUM_BEFORE,
} from "~/shared/lib/messenger-message-window.lib";
const {
  mockGetChatMessagesAscending,
  mockGetStreamMessagesAscending,
  mockFetchChatMessagesPage,
  mockGetChatMeta,
  mockUpdateChatMetaPatch,
  mockUpsertChatMessages,
} = vi.hoisted(() => ({
  mockGetChatMessagesAscending: vi.fn(),
  mockGetStreamMessagesAscending: vi.fn(),
  mockFetchChatMessagesPage: vi.fn(),
  mockGetChatMeta: vi.fn(),
  mockUpdateChatMetaPatch: vi.fn(),
  mockUpsertChatMessages: vi.fn(),
}));
const STREAM_UUID_5 = "00000000-0000-4000-8000-000000000005";

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

vi.mock("./message-fetch.lib", () => ({
  fetchChatMessagesPage: mockFetchChatMessagesPage,
}));

import { useCurrentChatMessagesStore, type CurrentChatContext } from "./message.model";

type MockMessageOverrides = Partial<Omit<MockMessage, "id">> & {
  id?: MockMessage["id"] | number;
};

function mockMsg(overrides: MockMessageOverrides = {}): MockMessage {
  const { id, ...rest } = overrides;
  return {
    id: testMessageId(id ?? 1),
    sender_id: 10,
    sender_full_name: "Test User",
    stream_uuid: "00000000-0000-4000-8000-000000000005",
    subject: "topic1",
    content: "<p>hello</p>",
    timestamp: 1000,
    ...rest,
  };
}

function pageOf(messages: MockMessage[]): MessagesPageResult {
  return { messages, foundOldest: false, foundNewest: true };
}

describe("loadInitialMessagesForContext (IndexedDB hydrate + full API)", () => {
  beforeEach(() => {
    const runtimeTestApiKey = `runtime-test-key-${Date.now()}`;
    setInstanceProvider(() => ({
      id: "test-instance",
      realm: "https://messenger.test",
      login: "test@messenger.test",
      authType: "iam",
      iamAccessToken: runtimeTestApiKey,
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
    mockGetChatMeta.mockResolvedValue({ reachedOldest: false, reachedNewest: false });
    mockUpdateChatMetaPatch.mockResolvedValue(undefined);
    mockUpsertChatMessages.mockResolvedValue(undefined);
    mockGetStreamMessagesAscending.mockResolvedValue([]);
    mockFetchChatMessagesPage.mockResolvedValue(pageOf([]));
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

  it("with non-empty IDB cache still performs a full network fetch (no delta-only path)", async () => {
    const ctx: CurrentChatContext = {
      type: "stream",
      streamId: STREAM_UUID_5,
      streamName: "general",
      topic: "topic1",
    };
    const cached = Array.from({ length: 15 }, (_, i) =>
      mockMsg({
        id: 86 + i,
        stream_uuid: "00000000-0000-4000-8000-000000000005",
        subject: "topic1",
      }),
    );
    mockGetChatMessagesAscending.mockResolvedValue(cached);
    const boot = [
      mockMsg({
        id: "00000000-0000-4000-8000-000000000200",
        stream_uuid: "00000000-0000-4000-8000-000000000005",
        content: "<p>api</p>",
      }),
    ];
    mockFetchChatMessagesPage.mockResolvedValue(pageOf(boot));

    await useCurrentChatMessagesStore.getState().loadInitialMessagesForContext({
      context: ctx,
      focusedMessageId: null,
      currentUserId: 1,
    });

    expect(mockGetChatMessagesAscending).toHaveBeenCalled();
    expect(mockFetchChatMessagesPage).toHaveBeenCalledWith(
      expect.objectContaining({
        context: ctx,
        currentUserId: 1,
        anchor: "newest",
        numBefore: MESSENGER_STREAM_ANCHOR_NUM_BEFORE,
        numAfter: 0,
        signal: expect.any(AbortSignal),
      }),
    );
    expect(useCurrentChatMessagesStore.getState().messages).toEqual(boot);
    expect(mockUpsertChatMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: boot,
        windowSizeN: MESSENGER_STREAM_ANCHOR_NUM_BEFORE,
      }),
    );
  });

  it("keeps IDB-hydrated messages when the network refresh returns an empty list", async () => {
    const ctx: CurrentChatContext = {
      type: "stream",
      streamId: "00000000-0000-4000-8000-000000000005",
      streamName: "general",
      topic: "topic1",
    };
    const cached = [
      mockMsg({
        id: "00000000-0000-4000-8000-000000000086",
        stream_uuid: "00000000-0000-4000-8000-000000000005",
        content: "<p>cached</p>",
      }),
    ];
    mockGetChatMessagesAscending.mockResolvedValue(cached);
    mockFetchChatMessagesPage.mockResolvedValue(pageOf([]));

    await useCurrentChatMessagesStore.getState().loadInitialMessagesForContext({
      context: ctx,
      focusedMessageId: null,
      currentUserId: 1,
    });

    expect(useCurrentChatMessagesStore.getState().messages).toEqual(cached);
    expect(useCurrentChatMessagesStore.getState().context).toMatchObject({
      type: "stream",
      streamId: "00000000-0000-4000-8000-000000000005",
      streamName: "general",
      topic: "topic1",
    });
  });

  it("does not let cache metadata mark the live tail as having newer messages", async () => {
    const ctx: CurrentChatContext = {
      type: "stream",
      streamId: "00000000-0000-4000-8000-000000000005",
      streamName: "general",
      topic: "topic1",
    };
    const cached = [
      mockMsg({
        id: "00000000-0000-4000-8000-000000000086",
        stream_uuid: "00000000-0000-4000-8000-000000000005",
        content: "<p>cached</p>",
      }),
    ];
    const deferred = Promise.withResolvers<MessagesPageResult>();
    mockGetChatMessagesAscending.mockResolvedValue(cached);
    mockGetChatMeta.mockResolvedValue({ reachedOldest: false, reachedNewest: false });
    mockFetchChatMessagesPage.mockReturnValue(deferred.promise);

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

    deferred.resolve(
      pageOf([
        mockMsg({
          id: "00000000-0000-4000-8000-000000000200",
          stream_uuid: STREAM_UUID_5,
        }),
      ]),
    );
    await loadPromise;
  });

  it("keeps cache-hydrated live tail unblocked when network refresh fails", async () => {
    const ctx: CurrentChatContext = {
      type: "dm",
      dmKey: "7,42",
    };
    const cached = [
      mockMsg({
        id: "00000000-0000-4000-8000-000000000086",
        stream_uuid: null,
        content: "<p>cached dm</p>",
      }),
    ];
    mockGetChatMessagesAscending.mockResolvedValue(cached);
    mockGetChatMeta.mockResolvedValue({ reachedOldest: false, reachedNewest: false });
    mockFetchChatMessagesPage.mockRejectedValue(new Error("network down"));

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

  it("preserves a realtime message appended while the network refresh is in flight", async () => {
    const ctx: CurrentChatContext = {
      type: "stream",
      streamId: STREAM_UUID_5,
      streamName: "general",
      topic: "topic1",
    };
    const cached = [
      mockMsg({
        id: "00000000-0000-4000-8000-000000000100",
        content: "<p>stale cache row</p>",
      }),
    ];
    const apiMessage = mockMsg({
      id: "00000000-0000-4000-8000-000000000200",
      content: "<p>api snapshot</p>",
      timestamp: 2000,
    });
    const realtimeMessage = mockMsg({
      id: "00000000-0000-4000-8000-000000000201",
      content: "<p>realtime</p>",
      timestamp: 2001,
    });
    const deferred = Promise.withResolvers<MessagesPageResult>();
    mockGetChatMessagesAscending.mockResolvedValue(cached);
    mockFetchChatMessagesPage.mockReturnValue(deferred.promise);

    useCurrentChatMessagesStore.getState().setContext(ctx);
    const loadPromise = useCurrentChatMessagesStore.getState().loadInitialMessagesForContext({
      context: ctx,
      focusedMessageId: null,
      currentUserId: 1,
    });

    await vi.waitFor(() => {
      expect(useCurrentChatMessagesStore.getState().messages).toEqual(cached);
    });
    useCurrentChatMessagesStore.getState().appendMessage(realtimeMessage);
    deferred.resolve(pageOf([apiMessage]));
    await loadPromise;

    expect(useCurrentChatMessagesStore.getState().messages).toEqual([apiMessage, realtimeMessage]);
  });

  it("deduplicates a realtime message that is also present in the network snapshot", async () => {
    const ctx: CurrentChatContext = {
      type: "stream",
      streamId: STREAM_UUID_5,
      streamName: "general",
      topic: "topic1",
    };
    const messageId = "00000000-0000-4000-8000-000000000201";
    const realtimeMessage = mockMsg({
      id: messageId,
      content: "<p>realtime</p>",
      timestamp: 2001,
    });
    const deferred = Promise.withResolvers<MessagesPageResult>();
    mockGetChatMessagesAscending.mockResolvedValue([]);
    mockFetchChatMessagesPage.mockReturnValue(deferred.promise);

    useCurrentChatMessagesStore.getState().setContext(ctx);
    const loadPromise = useCurrentChatMessagesStore.getState().loadInitialMessagesForContext({
      context: ctx,
      focusedMessageId: null,
      currentUserId: 1,
    });

    await vi.waitFor(() => {
      expect(mockFetchChatMessagesPage).toHaveBeenCalled();
    });
    useCurrentChatMessagesStore.getState().appendMessage(realtimeMessage);
    deferred.resolve(pageOf([{ ...realtimeMessage, content: "<p>api snapshot</p>" }]));
    await loadPromise;

    expect(useCurrentChatMessagesStore.getState().messages).toEqual([realtimeMessage]);
  });

  it("with empty IDB cache loads the newest stream window", async () => {
    const ctx: CurrentChatContext = {
      type: "stream",
      streamId: "00000000-0000-4000-8000-000000000005",
      streamName: "general",
      topic: "topic1",
    };
    mockGetChatMessagesAscending.mockResolvedValue([]);
    const boot = [
      mockMsg({
        id: "00000000-0000-4000-8000-000000000001",
        stream_uuid: "00000000-0000-4000-8000-000000000005",
      }),
    ];
    mockFetchChatMessagesPage.mockResolvedValue(pageOf(boot));

    await useCurrentChatMessagesStore.getState().loadInitialMessagesForContext({
      context: ctx,
      focusedMessageId: null,
      currentUserId: 1,
    });

    expect(mockFetchChatMessagesPage).toHaveBeenCalledWith(
      expect.objectContaining({
        context: ctx,
        anchor: "newest",
        numBefore: MESSENGER_STREAM_ANCHOR_NUM_BEFORE,
        numAfter: 0,
      }),
    );
    expect(mockUpsertChatMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: boot,
      }),
    );
  });

  it("with focusedMessageId skips IDB hydrate and loads a window around the anchor", async () => {
    const ctx: CurrentChatContext = {
      type: "stream",
      streamId: "00000000-0000-4000-8000-000000000005",
      streamName: "general",
      topic: "topic1",
    };
    const focused = [
      mockMsg({
        id: "00000000-0000-4000-8000-000000000050",
        stream_uuid: "00000000-0000-4000-8000-000000000005",
      }),
    ];
    mockFetchChatMessagesPage.mockResolvedValue(pageOf(focused));

    await useCurrentChatMessagesStore.getState().loadInitialMessagesForContext({
      context: ctx,
      focusedMessageId: "00000000-0000-4000-8000-000000000050",
      currentUserId: 1,
    });

    expect(mockGetChatMessagesAscending).not.toHaveBeenCalled();
    expect(mockFetchChatMessagesPage).toHaveBeenCalledWith(
      expect.objectContaining({
        context: ctx,
        anchor: testMessageId(50),
        numBefore: MESSENGER_STREAM_ANCHOR_NUM_BEFORE,
        numAfter: MESSENGER_STREAM_ANCHOR_NUM_AFTER,
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("uses the DM focused window when a focused message id is provided in a dm context", async () => {
    const ctx: CurrentChatContext = {
      type: "dm",
      dmKey: "7,42",
    };
    const focusedDm = [mockMsg({ id: "00000000-0000-4000-8000-000000000050", stream_uuid: null })];
    mockFetchChatMessagesPage.mockResolvedValue(pageOf(focusedDm));

    await useCurrentChatMessagesStore.getState().loadInitialMessagesForContext({
      context: ctx,
      focusedMessageId: "00000000-0000-4000-8000-000000000050",
      currentUserId: 7,
    });

    expect(mockFetchChatMessagesPage).toHaveBeenCalledWith(
      expect.objectContaining({
        context: ctx,
        anchor: testMessageId(50),
        numBefore: MESSENGER_DM_ANCHOR_NUM_BEFORE,
        numAfter: MESSENGER_DM_ANCHOR_NUM_AFTER,
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("loads a stream route through the unified page fetch", async () => {
    const ctx: CurrentChatContext = {
      type: "stream",
      streamId: "00000000-0000-4000-8000-000000000005",
      streamName: "general",
      topic: "general",
      streamWideView: false,
    };
    mockGetChatMessagesAscending.mockResolvedValue([]);
    mockFetchChatMessagesPage.mockResolvedValue(
      pageOf([
        mockMsg({
          id: "00000000-0000-4000-8000-000000000002",
          stream_uuid: STREAM_UUID_5,
        }),
      ]),
    );

    await useCurrentChatMessagesStore.getState().loadInitialMessagesForContext({
      context: ctx,
      focusedMessageId: null,
      currentUserId: 1,
    });

    expect(mockFetchChatMessagesPage).toHaveBeenCalledWith(
      expect.objectContaining({ context: ctx, anchor: "newest" }),
    );
  });

  it("hydrates stream-wide mode from merged stream cache and limits to 100", async () => {
    const ctx: CurrentChatContext = {
      type: "stream",
      streamId: "00000000-0000-4000-8000-000000000005",
      streamName: "general",
      topic: "general",
      streamWideView: true,
    };
    const cachedWide = Array.from({ length: 130 }, (_, i) =>
      mockMsg({
        id: i + 1,
        stream_uuid: "00000000-0000-4000-8000-000000000005",
        subject: i % 2 === 0 ? "alpha" : "beta",
      }),
    );
    mockGetStreamMessagesAscending.mockResolvedValue(cachedWide);

    const deferred = Promise.withResolvers<MessagesPageResult>();
    mockFetchChatMessagesPage.mockReturnValue(deferred.promise);

    const loadPromise = useCurrentChatMessagesStore.getState().loadInitialMessagesForContext({
      context: ctx,
      focusedMessageId: null,
      currentUserId: 1,
    });

    await vi.waitFor(() => {
      expect(mockGetStreamMessagesAscending).toHaveBeenCalledWith("test-instance", STREAM_UUID_5);
    });
    await vi.waitFor(() => {
      expect(useCurrentChatMessagesStore.getState().messages).toHaveLength(100);
    });

    const hydrated = useCurrentChatMessagesStore.getState().messages;
    expect(hydrated).toHaveLength(100);
    expect(hydrated[0]!.id).toBe(testMessageId(31));
    expect(hydrated[99]!.id).toBe(testMessageId(130));

    deferred.resolve(
      pageOf([
        mockMsg({
          id: "00000000-0000-4000-8000-000000000999",
          stream_uuid: "00000000-0000-4000-8000-000000000005",
        }),
      ]),
    );
    await loadPromise;
  });

  it("persists stream-wide response via chat partitions", async () => {
    const ctx: CurrentChatContext = {
      type: "stream",
      streamId: "00000000-0000-4000-8000-000000000005",
      streamName: "general",
      topic: "general",
      streamWideView: true,
    };
    mockGetStreamMessagesAscending.mockResolvedValue([]);
    mockFetchChatMessagesPage.mockResolvedValue(
      pageOf([
        mockMsg({
          id: "00000000-0000-4000-8000-000000000010",
          stream_uuid: "00000000-0000-4000-8000-000000000005",
          subject: "",
        }),
        mockMsg({
          id: "00000000-0000-4000-8000-000000000011",
          stream_uuid: "00000000-0000-4000-8000-000000000005",
          subject: "",
        }),
      ]),
    );

    await useCurrentChatMessagesStore.getState().loadInitialMessagesForContext({
      context: ctx,
      focusedMessageId: null,
      currentUserId: 1,
    });

    // Stream-wide persists through the partition path (keyed by stream id), not a single topic key.
    const upsertChatKeys = mockUpsertChatMessages.mock.calls.map(
      (call) => (call[0] as { chatKey: string }).chatKey,
    );
    for (const key of upsertChatKeys) {
      expect(key.startsWith(`stream:${STREAM_UUID_5}`)).toBe(true);
    }
  });

  it("ignores stale initial response when a previous request resolves after a route switch", async () => {
    const firstCtx: CurrentChatContext = {
      type: "stream",
      streamId: "00000000-0000-4000-8000-000000000005",
      streamName: "general",
      topic: "topic-1",
      streamWideView: false,
    };
    const secondCtx: CurrentChatContext = {
      type: "stream",
      streamId: "00000000-0000-4000-8000-000000000005",
      streamName: "general",
      topic: "topic-2",
      streamWideView: false,
    };

    mockGetChatMessagesAscending.mockResolvedValue([]);
    const firstDeferred = Promise.withResolvers<MessagesPageResult>();
    const secondDeferred = Promise.withResolvers<MessagesPageResult>();
    mockFetchChatMessagesPage.mockImplementation((args: { context: CurrentChatContext }) => {
      const topic = args.context.type === "stream" ? args.context.topic : "";
      if (topic === "topic-1") return firstDeferred.promise;
      if (topic === "topic-2") return secondDeferred.promise;
      return Promise.resolve(pageOf([]));
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

    secondDeferred.resolve(
      pageOf([
        mockMsg({
          id: "00000000-0000-4000-8000-000000000202",
          stream_uuid: "00000000-0000-4000-8000-000000000005",
          content: "<p>second</p>",
        }),
      ]),
    );
    await secondLoad;
    expect(useCurrentChatMessagesStore.getState().messages[0]?.id).toBe(testMessageId(202));

    firstDeferred.resolve(
      pageOf([
        mockMsg({
          id: "00000000-0000-4000-8000-000000000101",
          stream_uuid: "00000000-0000-4000-8000-000000000005",
          content: "<p>first</p>",
        }),
      ]),
    );
    await firstLoad;
    expect(useCurrentChatMessagesStore.getState().messages[0]?.id).toBe(testMessageId(202));
  });
});
