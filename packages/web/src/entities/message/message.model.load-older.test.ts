/**
 * loadOlderBoundaryPage — stops pagination when API returns duplicates with no store progress.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { setInstanceProvider } from "~/shared/api/client";
import type { MockMessage } from "~/shared/api/messenger.types";
import { testMessageId } from "~/test/factories";
import { useCurrentChatMessagesStore, type CurrentChatContext } from "./message.model";

type MockMessageOverrides = Partial<Omit<MockMessage, "id">> & {
  id?: MockMessage["id"] | number;
};

const mockFetchStreamMessagesPage = vi.hoisted(() => vi.fn());
const mockUpdateChatMetaPatch = vi.hoisted(() => vi.fn());
const mockUpsertChatMessages = vi.hoisted(() => vi.fn());
const mockPersistChatMessagesToIndexedDb = vi.hoisted(() => vi.fn(() => false));

vi.mock("~/shared/api/messenger-me-messages", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/shared/api/messenger-me-messages")>();
  return {
    ...actual,
    fetchStreamMessagesPage: mockFetchStreamMessagesPage,
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

function mockMsg(overrides: MockMessageOverrides = {}): MockMessage {
  const { id, ...rest } = overrides;
  return {
    id: testMessageId(id ?? 1),
    sender_id: 10,
    sender_full_name: "Test User",
    stream_id: 5,
    subject: "topic1",
    content: "<p>hello</p>",
    timestamp: 1000,
    ...rest,
  };
}

const STREAM_UUID = "22222222-2222-4222-8222-222222222222";

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
      realm: "https://messenger.test",
      login: "test@messenger.test",
      authType: "iam",
      iamAccessToken: `runtime-test-key-${Date.now()}`,
    });
    setInstanceProvider(() => useInstancesStore.getState().getCurrentInstance());
    vi.clearAllMocks();
    useChatListStore.getState().clear();
    useChatListStore
      .getState()
      .upsertStreamMetadataRows([{ streamId: 5, name: "general", streamUuid: STREAM_UUID }]);
  });

  afterEach(() => {
    setInstanceProvider(() => null);
    resetInstancesStore();
    useChatListStore.getState().clear();
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
    const anchorId = testMessageId(50);
    const apiPage = [
      mockMsg({ id: anchorId }),
      ...Array.from({ length: pageSize }, (_, index) => mockMsg({ id: 50 + index })),
    ];

    mockFetchStreamMessagesPage.mockResolvedValue({
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
    expect(mockFetchStreamMessagesPage).toHaveBeenCalledTimes(1);
    expect(mockFetchStreamMessagesPage).toHaveBeenCalledWith(
      expect.objectContaining({
        streamUuid: STREAM_UUID,
        streamId: 5,
        anchor: anchorId,
        numBefore: pageSize,
        numAfter: 0,
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("prepends fresh rows and keeps hasOlderMessages when page adds new ids", async () => {
    const pageSize = 50;
    const storeMessages = [mockMsg({ id: 100 }), mockMsg({ id: 101 })];
    const olderMessages = Array.from({ length: pageSize }, (_, index) => mockMsg({ id: index }));

    mockFetchStreamMessagesPage.mockResolvedValue({
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
    expect(state.messages[0]?.id).toBe(testMessageId(0));
  });

  it("uses first ordered message id as anchor when UUIDs are not numeric cursors", async () => {
    const pageSize = 10;
    useCurrentChatMessagesStore.setState({
      context: streamCtx,
      messages: [mockMsg({ id: 105 }), mockMsg({ id: 100 }), mockMsg({ id: 102 })],
      hasOlderMessages: true,
      isLoadingMore: false,
    });

    mockFetchStreamMessagesPage.mockResolvedValue({
      messages: [mockMsg({ id: 100 })],
      foundOldest: true,
      foundNewest: true,
    });

    await useCurrentChatMessagesStore
      .getState()
      .loadOlderBoundaryPage({ pageSize, currentUserId: 10 });

    expect(mockFetchStreamMessagesPage).toHaveBeenCalledWith(
      expect.objectContaining({
        streamUuid: STREAM_UUID,
        streamId: 5,
        anchor: testMessageId(105),
        numBefore: pageSize,
        numAfter: 0,
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
      realm: "https://messenger-2.test",
      login: "two@messenger.test",
      authType: "iam",
      iamAccessToken: "k2",
    }).id;

    mockPersistChatMessagesToIndexedDb.mockReturnValue(true);
    mockFetchStreamMessagesPage.mockReturnValue(deferred.promise);

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
      realm: "https://messenger-2.test",
      login: "two@messenger.test",
      authType: "iam",
      iamAccessToken: "k2",
    }).id;

    mockPersistChatMessagesToIndexedDb.mockReturnValue(true);
    mockFetchStreamMessagesPage.mockReturnValue(deferred.promise);

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
