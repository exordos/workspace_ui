import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { fetchMessagesByIds } from "~/shared/api/messenger-messages";
import type { MessengerUnreadMessagesSnapshot } from "~/shared/api/messenger-unread.lib";
import type { WorkspaceRawMessage } from "~/shared/api/messenger.types";
import { testMessageId } from "~/test/factories";
import {
  hydrateStreamSidebarPreviewsFromUnreadSnapshot,
  resolveLatestUnreadMessageIdsForMissingPreviews,
} from "./chat-list-unread-preview-hydrate.lib";
import { useChatListStore } from "./chat-list.model";

vi.mock("~/shared/api/messenger-messages", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/shared/api/messenger-messages")>();
  return {
    ...actual,
    fetchMessagesByIds: vi.fn(),
  };
});

const fetchMessagesByIdsMock = vi.mocked(fetchMessagesByIds);

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

function seedActiveInstance(realm = "https://messenger.test"): string {
  return useInstancesStore.getState().addInstance({
    realm,
    login: "sidebar@example.com",
    apiKey: `key-${realm}`,
  }).id;
}

function streamMsg(overrides: Partial<WorkspaceRawMessage> = {}): WorkspaceRawMessage {
  return {
    id: "00000000-0000-4000-8000-000000000001",
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
    resetInstancesStore();
    seedActiveInstance();
    useChatListStore.getState().clear();
  });

  afterEach(() => {
    resetInstancesStore();
    useChatListStore.getState().clear();
  });

  it("picks the latest ordered unread id per bucket and dedupes ids", () => {
    useChatListStore.getState().upsertStreamMetadataRows([{ streamId: 5, name: "general" }]);
    const snapshot: MessengerUnreadMessagesSnapshot = {
      streams: [
        {
          streamId: 5,
          topic: "alpha",
          unreadMessageIds: [testMessageId(1), testMessageId(5), testMessageId(3)],
        },
        {
          streamId: 5,
          topic: "beta",
          unreadMessageIds: [testMessageId(5), testMessageId(2)],
        },
      ],
      dms: [],
      totalCount: 5,
      mentionMessageIds: [],
    };

    const ids = resolveLatestUnreadMessageIdsForMissingPreviews(
      snapshot,
      useChatListStore.getState().streamsMap,
    );

    expect(ids).toEqual([testMessageId(3), testMessageId(2)]);
  });

  it("skips bucket when topic preview already exists and stream preview is non-empty", () => {
    useChatListStore.getState().upsertStreamMetadataRows([{ streamId: 5, name: "general" }]);
    useChatListStore
      .getState()
      .applyStreamSidebarPreviewsFromMessages([
        streamMsg({ id: testMessageId(10), subject: "alpha", content: "ok" }),
      ]);

    const snapshot: MessengerUnreadMessagesSnapshot = {
      streams: [{ streamId: 5, topic: "alpha", unreadMessageIds: [testMessageId(99)] }],
      dms: [],
      totalCount: 1,
      mentionMessageIds: [],
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
    resetInstancesStore();
    seedActiveInstance();
    useChatListStore.getState().clear();
    fetchMessagesByIdsMock.mockReset();
  });

  afterEach(() => {
    resetInstancesStore();
    useChatListStore.getState().clear();
  });

  it("fetches latest unread ids and applies stream/topic preview merge", async () => {
    useChatListStore.getState().upsertStreamMetadataRows([{ streamId: 5, name: "general" }]);

    const snapshot: MessengerUnreadMessagesSnapshot = {
      streams: [
        {
          streamId: 5,
          topic: "alpha",
          unreadMessageIds: [testMessageId(301), testMessageId(302)],
        },
      ],
      dms: [],
      totalCount: 2,
      mentionMessageIds: [],
    };

    fetchMessagesByIdsMock.mockResolvedValue([
      streamMsg({
        id: testMessageId(302),
        stream_id: 5,
        subject: "alpha",
        content: "fresh preview",
        timestamp: 9000,
        sender_full_name: "Fresh Sender",
      }),
    ]);

    await hydrateStreamSidebarPreviewsFromUnreadSnapshot(snapshot);

    expect(fetchMessagesByIdsMock).toHaveBeenCalledWith([testMessageId(302)]);
    const stream = useChatListStore.getState().streamsMap.get(5);
    expect(stream?.topics.get("alpha")?.lastMessage).toContain("fresh preview");
    expect(stream?.topics.get("alpha")?.ts).toBe(9000);
    expect(stream?.ts).toBe(9000);
    expect(stream?.lastMessage).toContain("fresh preview");
  });

  it("dedupes concurrent hydrate calls", async () => {
    useChatListStore.getState().upsertStreamMetadataRows([{ streamId: 5, name: "general" }]);
    const snapshot: MessengerUnreadMessagesSnapshot = {
      streams: [{ streamId: 5, topic: "alpha", unreadMessageIds: [testMessageId(301)] }],
      dms: [],
      totalCount: 1,
      mentionMessageIds: [],
    };

    let resolveFetch!: (value: WorkspaceRawMessage[]) => void;
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
        id: "00000000-0000-4000-8000-000000000301",
        stream_id: 5,
        subject: "alpha",
        content: "hello",
        timestamp: 2000,
      }),
    ]);

    await Promise.all([first, second]);
    expect(fetchMessagesByIdsMock).toHaveBeenCalledTimes(1);
  });

  it("drops stale unread preview hydrate after organization switch", async () => {
    useChatListStore.getState().upsertStreamMetadataRows([{ streamId: 5, name: "general" }]);
    const snapshot: MessengerUnreadMessagesSnapshot = {
      streams: [
        { streamId: 5, topic: "alpha", unreadMessageIds: ["00000000-0000-4000-8000-000000000301"] },
      ],
      dms: [],
      totalCount: 1,
      mentionMessageIds: [],
    };
    let resolveFetch!: (value: WorkspaceRawMessage[]) => void;
    fetchMessagesByIdsMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const first = hydrateStreamSidebarPreviewsFromUnreadSnapshot(snapshot);
    const secondInstanceId = seedActiveInstance("https://messenger-2.test");
    useInstancesStore.getState().setCurrentInstanceId(secondInstanceId);
    useChatListStore.getState().clear();
    useChatListStore.getState().upsertStreamMetadataRows([{ streamId: 5, name: "general" }]);

    resolveFetch([
      streamMsg({
        id: "00000000-0000-4000-8000-000000000301",
        stream_id: 5,
        subject: "alpha",
        content: "stale preview",
        timestamp: 2000,
      }),
    ]);
    await first;

    expect(useChatListStore.getState().streamsMap.get(5)?.topics.size).toBe(0);
  });

  it("does not dedupe unread preview hydrate across organizations", async () => {
    useChatListStore.getState().upsertStreamMetadataRows([{ streamId: 5, name: "general" }]);
    const snapshot: MessengerUnreadMessagesSnapshot = {
      streams: [
        { streamId: 5, topic: "alpha", unreadMessageIds: ["00000000-0000-4000-8000-000000000301"] },
      ],
      dms: [],
      totalCount: 1,
      mentionMessageIds: [],
    };
    let resolveFirst!: (value: WorkspaceRawMessage[]) => void;
    let resolveSecond!: (value: WorkspaceRawMessage[]) => void;
    fetchMessagesByIdsMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve;
          }),
      );

    const first = hydrateStreamSidebarPreviewsFromUnreadSnapshot(snapshot);

    const secondInstanceId = seedActiveInstance("https://messenger-2.test");
    useInstancesStore.getState().setCurrentInstanceId(secondInstanceId);
    useChatListStore.getState().clear();
    useChatListStore.getState().upsertStreamMetadataRows([{ streamId: 5, name: "general" }]);

    const second = hydrateStreamSidebarPreviewsFromUnreadSnapshot(snapshot);

    expect(fetchMessagesByIdsMock).toHaveBeenCalledTimes(2);

    resolveFirst([
      streamMsg({
        id: "00000000-0000-4000-8000-000000000301",
        stream_id: 5,
        subject: "alpha",
        content: "old",
      }),
    ]);
    resolveSecond([
      streamMsg({
        id: "00000000-0000-4000-8000-000000000301",
        stream_id: 5,
        subject: "alpha",
        content: "new",
      }),
    ]);
    await Promise.all([first, second]);

    expect(useChatListStore.getState().streamsMap.get(5)?.lastMessage).toContain("new");
  });
});
