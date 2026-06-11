/**
 * loadOlderBoundaryPage — stops pagination when API returns duplicates with no store progress.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { setInstanceProvider } from "~/shared/api/client";
import type { MockMessage } from "~/shared/api/zulip.types";
import { useCurrentChatMessagesStore, type CurrentChatContext } from "./message.model";

const mockFetchMessagesWithNarrowPage = vi.hoisted(() => vi.fn());
const mockUpdateChatMetaPatch = vi.hoisted(() => vi.fn());
const mockUpsertChatMessages = vi.hoisted(() => vi.fn());
const mockPersistChatMessagesToIndexedDb = vi.hoisted(() => vi.fn(() => false));

vi.mock("~/shared/api/zulip-messages", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/shared/api/zulip-messages")>();
  return {
    ...actual,
    fetchMessagesWithNarrowPage: mockFetchMessagesWithNarrowPage,
  };
});

vi.mock("~/shared/lib/message-cache-db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/shared/lib/message-cache-db")>();
  return {
    ...actual,
    updateChatMetaPatch: mockUpdateChatMetaPatch,
    upsertChatMessages: mockUpsertChatMessages,
  };
});

vi.mock("./message-local-cache.lib", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./message-local-cache.lib")>();
  return {
    ...actual,
    persistChatMessagesToIndexedDb: mockPersistChatMessagesToIndexedDb,
  };
});

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

const streamCtx: CurrentChatContext = {
  type: "stream",
  streamId: 5,
  streamName: "general",
  topic: "topic1",
};

function resetInstancesStore(): void {
  useInstancesStore.setState({
    instances: [],
    currentInstanceId: null,
    activeOrgEpoch: 0,
    unreadCountsByInstance: {},
    dmUnreadCountsByInstance: {},
    jitsiMeetBaseUrl: null,
  });
}

describe("loadOlderBoundaryPage", () => {
  beforeEach(() => {
    resetInstancesStore();
    useInstancesStore.getState().addInstance({
      realm: "https://zulip.test",
      email: "test@zulip.test",
      apiKey: `runtime-test-key-${Date.now()}`,
    });
    setInstanceProvider(() => useInstancesStore.getState().getCurrentInstance());
    vi.clearAllMocks();
  });

  afterEach(() => {
    setInstanceProvider(() => null);
    resetInstancesStore();
    useCurrentChatMessagesStore.setState({
      context: null,
      messages: [],
      pendingOutgoingEchoKeys: [],
      isLoadingMore: false,
      isLoadingNewer: false,
      hasOlderMessages: true,
      hasNewerMessages: false,
      boundaryLoadFailed: false,
    });
  });

  it("sets hasOlderMessages false when full page is already in store (no progress)", async () => {
    const pageSize = 50;
    const storeMessages = Array.from({ length: pageSize * 2 }, (_, index) =>
      mockMsg({ id: 50 + index }),
    );
    const anchorId = 50;
    const apiPage = [
      mockMsg({ id: anchorId }),
      ...Array.from({ length: pageSize }, (_, index) => mockMsg({ id: 50 + index })),
    ];

    mockFetchMessagesWithNarrowPage.mockResolvedValue({
      messages: apiPage,
      foundOldest: false,
      foundNewest: true,
    });

    useCurrentChatMessagesStore.setState({
      context: streamCtx,
      messages: storeMessages,
      hasOlderMessages: true,
      isLoadingMore: false,
    });

    await useCurrentChatMessagesStore
      .getState()
      .loadOlderBoundaryPage({ pageSize, currentUserId: 10 });

    const state = useCurrentChatMessagesStore.getState();
    expect(state.hasOlderMessages).toBe(false);
    expect(state.messages).toHaveLength(pageSize * 2);
    expect(mockFetchMessagesWithNarrowPage).toHaveBeenCalledTimes(1);
    expect(mockFetchMessagesWithNarrowPage).toHaveBeenCalledWith(
      expect.any(Array),
      anchorId,
      pageSize,
      0,
      expect.objectContaining({
        applyMarkdown: false,
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("prepends fresh rows and keeps hasOlderMessages when page adds new ids", async () => {
    const pageSize = 50;
    const storeMessages = [mockMsg({ id: 100 }), mockMsg({ id: 101 })];
    const olderMessages = Array.from({ length: pageSize }, (_, index) => mockMsg({ id: index }));

    mockFetchMessagesWithNarrowPage.mockResolvedValue({
      messages: [mockMsg({ id: 100 }), ...olderMessages],
      foundOldest: false,
      foundNewest: true,
    });

    useCurrentChatMessagesStore.setState({
      context: streamCtx,
      messages: storeMessages,
      hasOlderMessages: true,
      isLoadingMore: false,
    });

    await useCurrentChatMessagesStore
      .getState()
      .loadOlderBoundaryPage({ pageSize, currentUserId: 10 });

    const state = useCurrentChatMessagesStore.getState();
    expect(state.hasOlderMessages).toBe(true);
    expect(state.messages.length).toBe(storeMessages.length + olderMessages.length);
    expect(state.messages[0]?.id).toBe(0);
  });

  it("uses minimum message id as anchor when store order is not ascending", async () => {
    const pageSize = 10;
    useCurrentChatMessagesStore.setState({
      context: streamCtx,
      messages: [mockMsg({ id: 105 }), mockMsg({ id: 100 }), mockMsg({ id: 102 })],
      hasOlderMessages: true,
      isLoadingMore: false,
    });

    mockFetchMessagesWithNarrowPage.mockResolvedValue({
      messages: [mockMsg({ id: 100 })],
      foundOldest: true,
      foundNewest: true,
    });

    await useCurrentChatMessagesStore
      .getState()
      .loadOlderBoundaryPage({ pageSize, currentUserId: 10 });

    expect(mockFetchMessagesWithNarrowPage).toHaveBeenCalledWith(
      expect.any(Array),
      100,
      pageSize,
      0,
      expect.objectContaining({
        applyMarkdown: false,
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("drops stale older-page results after organization switch", async () => {
    const deferred = Promise.withResolvers<{
      messages: MockMessage[];
      foundOldest: boolean;
      foundNewest: boolean;
    }>();
    const firstInstanceId = useInstancesStore.getState().currentInstanceId;
    const secondInstanceId = useInstancesStore.getState().addInstance({
      realm: "https://zulip-2.test",
      email: "two@zulip.test",
      apiKey: "k2",
    }).id;

    mockPersistChatMessagesToIndexedDb.mockReturnValue(true);
    mockFetchMessagesWithNarrowPage.mockReturnValue(deferred.promise);

    useCurrentChatMessagesStore.setState({
      context: streamCtx,
      messages: [mockMsg({ id: 100 }), mockMsg({ id: 101 })],
      hasOlderMessages: true,
      isLoadingMore: false,
    });

    const loadPromise = useCurrentChatMessagesStore
      .getState()
      .loadOlderBoundaryPage({ pageSize: 10, currentUserId: 10 });

    expect(firstInstanceId).not.toBeNull();
    useInstancesStore.getState().setCurrentInstanceId(secondInstanceId);
    useCurrentChatMessagesStore.getState().setContext(null);

    deferred.resolve({
      messages: [mockMsg({ id: 100 }), mockMsg({ id: 90 })],
      foundOldest: true,
      foundNewest: true,
    });
    await loadPromise;

    expect(useCurrentChatMessagesStore.getState().context).toBeNull();
    expect(useCurrentChatMessagesStore.getState().messages).toEqual([]);
    expect(mockUpdateChatMetaPatch).not.toHaveBeenCalled();
    expect(mockUpsertChatMessages).not.toHaveBeenCalled();
    expect(useCurrentChatMessagesStore.getState().boundaryLoadFailed).toBe(false);
  });

  it("drops stale newer-page results after organization switch", async () => {
    const deferred = Promise.withResolvers<{
      messages: MockMessage[];
      foundOldest: boolean;
      foundNewest: boolean;
    }>();
    const secondInstanceId = useInstancesStore.getState().addInstance({
      realm: "https://zulip-2.test",
      email: "two@zulip.test",
      apiKey: "k2",
    }).id;

    mockPersistChatMessagesToIndexedDb.mockReturnValue(true);
    mockFetchMessagesWithNarrowPage.mockReturnValue(deferred.promise);

    useCurrentChatMessagesStore.setState({
      context: streamCtx,
      messages: [mockMsg({ id: 100 }), mockMsg({ id: 101 })],
      hasOlderMessages: true,
      hasNewerMessages: true,
      isLoadingMore: false,
      isLoadingNewer: false,
    });

    const loadPromise = useCurrentChatMessagesStore
      .getState()
      .loadNewerBoundaryPage({ pageSize: 10, currentUserId: 10 });

    useInstancesStore.getState().setCurrentInstanceId(secondInstanceId);
    useCurrentChatMessagesStore.getState().setContext(null);

    deferred.resolve({
      messages: [mockMsg({ id: 101 }), mockMsg({ id: 102 })],
      foundOldest: false,
      foundNewest: true,
    });
    await loadPromise;

    expect(useCurrentChatMessagesStore.getState().context).toBeNull();
    expect(useCurrentChatMessagesStore.getState().messages).toEqual([]);
    expect(mockUpdateChatMetaPatch).not.toHaveBeenCalled();
    expect(mockUpsertChatMessages).not.toHaveBeenCalled();
    expect(useCurrentChatMessagesStore.getState().boundaryLoadFailed).toBe(false);
  });
});
