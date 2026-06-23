import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useInstancesStore } from "~/entities/instance/instance.model";
import {
  fetchLatestMessagesForSidebarTopics,
  fetchStreamChannelMessagesForSidebarTopics,
} from "~/shared/api/messenger-sidebar-preview.lib";
import { fetchStreamTopics } from "~/shared/api/messenger-streams";
import type { MessengerStreamTopic, WorkspaceRawMessage } from "~/shared/api/messenger.types";
import {
  clearStreamSidebarHydrateState,
  isStreamSidebarTopicsHydrateInFlight,
  requestStreamSidebarTopicPreviewBackfill,
  requestStreamSidebarTopicListHydrate,
  requestStreamSidebarTopicsHydrate,
} from "./chat-list-hydrate-stream-sidebar.lib";
import { useChatListStore } from "./chat-list.model";
import type { ChatListStreamTopicMetadataRow } from "./chat-list.model.types";

vi.mock("~/shared/api/messenger-sidebar-preview.lib", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/shared/api/messenger-sidebar-preview.lib")>();
  return {
    ...actual,
    fetchLatestMessagesForSidebarTopics: vi.fn(),
    fetchStreamChannelMessagesForSidebarTopics: vi.fn(),
  };
});

vi.mock("~/shared/api/messenger-streams", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/shared/api/messenger-streams")>();
  return {
    ...actual,
    fetchStreamTopics: vi.fn(),
  };
});

const fetchStreamChannelMock = vi.mocked(fetchStreamChannelMessagesForSidebarTopics);
const fetchLatestTopicMessagesMock = vi.mocked(fetchLatestMessagesForSidebarTopics);
const fetchStreamTopicsMock = vi.mocked(fetchStreamTopics);

const STREAM_UUID = "00000000-0000-4000-8000-000000000005";
const OTHER_STREAM_UUID = "00000000-0000-4000-8000-000000000006";
const TOPIC_ALPHA_UUID = "00000000-0000-4000-8000-0000000000a1";
const TOPIC_BETA_UUID = "00000000-0000-4000-8000-0000000000b2";
const TOPIC_DEFAULT_UUID = "00000000-0000-4000-8000-0000000000d0";
const TOPIC_SHELL_UUID = "00000000-0000-4000-8000-0000000000e1";

function topicRow(
  name: string,
  uuid: string,
  overrides: Partial<MessengerStreamTopic> = {},
): MessengerStreamTopic {
  return {
    uuid,
    stream_uuid: STREAM_UUID,
    name,
    unread_count: 0,
    is_default: false,
    is_done: false,
    ...overrides,
  };
}

function topicShell(
  name: string,
  topicUuid: string,
  overrides: Partial<ChatListStreamTopicMetadataRow> = {},
): ChatListStreamTopicMetadataRow {
  return {
    topicUuid,
    streamUuid: STREAM_UUID,
    name,
    isDefault: false,
    ...overrides,
  };
}

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
    login: `${realm}@example.com`,
    authType: "iam",
    iamAccessToken: `key-${realm}`,
  }).id;
}

async function flushMicrotasks(turns = 5): Promise<void> {
  for (let i = 0; i < turns; i += 1) {
    await Promise.resolve();
  }
}

function streamMsg(overrides: Partial<WorkspaceRawMessage> = {}): WorkspaceRawMessage {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    sender_id: 10,
    sender_full_name: "Sender",
    content: "hello",
    timestamp: 1000,
    type: "stream",
    stream_uuid: STREAM_UUID,
    display_recipient: "general",
    subject: "topic1",
    flags: [],
    ...overrides,
  };
}

describe("requestStreamSidebarTopicsHydrate", () => {
  beforeEach(() => {
    resetInstancesStore();
    seedActiveInstance();
    clearStreamSidebarHydrateState();
    useChatListStore.getState().clear();
    fetchStreamChannelMock.mockReset();
    fetchLatestTopicMessagesMock.mockReset();
    fetchStreamTopicsMock.mockReset();
  });

  afterEach(() => {
    resetInstancesStore();
    clearStreamSidebarHydrateState();
    useChatListStore.getState().clear();
  });

  it("skips fetch when stream already has topics in store", async () => {
    useChatListStore
      .getState()
      .upsertStreamMetadataRows([{ streamUuid: STREAM_UUID, name: "general" }]);
    useChatListStore
      .getState()
      .applyStreamSidebarPreviewsFromMessages([
        streamMsg({ stream_uuid: STREAM_UUID, subject: "existing" }),
      ]);

    await requestStreamSidebarTopicsHydrate(STREAM_UUID, "expand");

    expect(fetchStreamChannelMock).not.toHaveBeenCalled();
  });

  it("dedupes concurrent hydrate for the same stream", async () => {
    useChatListStore
      .getState()
      .upsertStreamMetadataRows([{ streamUuid: STREAM_UUID, name: "general" }]);
    let resolveFetch!: (value: WorkspaceRawMessage[]) => void;
    fetchStreamChannelMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const first = requestStreamSidebarTopicsHydrate(STREAM_UUID, "expand");
    const second = requestStreamSidebarTopicsHydrate(STREAM_UUID, "visible");
    expect(isStreamSidebarTopicsHydrateInFlight(STREAM_UUID)).toBe(true);
    await flushMicrotasks();
    expect(fetchStreamChannelMock).toHaveBeenCalledTimes(1);

    resolveFetch([streamMsg({ stream_uuid: STREAM_UUID, subject: "lazy-topic" })]);
    await Promise.all([first, second]);

    expect(useChatListStore.getState().streamsMap.get(STREAM_UUID)?.topics.has("lazy-topic")).toBe(
      true,
    );
  });

  it("does not mark hydrated when API returns empty messages (allows retry)", async () => {
    useChatListStore
      .getState()
      .upsertStreamMetadataRows([{ streamUuid: STREAM_UUID, name: "general" }]);
    fetchStreamChannelMock.mockResolvedValue([]);

    await requestStreamSidebarTopicsHydrate(STREAM_UUID, "expand");
    await requestStreamSidebarTopicsHydrate(STREAM_UUID, "expand");

    expect(fetchStreamChannelMock).toHaveBeenCalledTimes(2);
    expect(useChatListStore.getState().streamsMap.get(STREAM_UUID)?.topics.size).toBe(0);
  });
});

describe("requestStreamSidebarTopicListHydrate", () => {
  beforeEach(() => {
    resetInstancesStore();
    seedActiveInstance();
    clearStreamSidebarHydrateState();
    useChatListStore.getState().clear();
    fetchStreamTopicsMock.mockReset();
    fetchStreamChannelMock.mockReset();
  });

  afterEach(() => {
    resetInstancesStore();
    clearStreamSidebarHydrateState();
    useChatListStore.getState().clear();
  });

  it("fetches topic rows and inserts topic shells into store", async () => {
    useChatListStore
      .getState()
      .upsertStreamMetadataRows([{ streamUuid: STREAM_UUID, name: "general" }]);
    fetchStreamTopicsMock.mockResolvedValue([
      topicRow("alpha", TOPIC_ALPHA_UUID),
      topicRow("beta", TOPIC_BETA_UUID),
    ]);

    await requestStreamSidebarTopicListHydrate(STREAM_UUID);

    expect(fetchStreamTopicsMock).toHaveBeenCalledWith(STREAM_UUID, expect.any(AbortSignal));
    const stream = useChatListStore.getState().streamsMap.get(STREAM_UUID);
    expect(stream?.topics.has("alpha")).toBe(true);
    expect(stream?.topics.has("beta")).toBe(true);
  });

  it("dedupes concurrent requests for the same stream", async () => {
    useChatListStore
      .getState()
      .upsertStreamMetadataRows([{ streamUuid: STREAM_UUID, name: "general" }]);
    let resolveFetch!: (value: MessengerStreamTopic[]) => void;
    fetchStreamTopicsMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const first = requestStreamSidebarTopicListHydrate(STREAM_UUID);
    const second = requestStreamSidebarTopicListHydrate(STREAM_UUID);
    expect(fetchStreamTopicsMock).toHaveBeenCalledTimes(1);

    resolveFetch([topicRow("alpha", TOPIC_ALPHA_UUID)]);
    await Promise.all([first, second]);
    expect(fetchStreamTopicsMock).toHaveBeenCalledTimes(1);
  });

  it("inserts server default topic shell and hydrates preview by topic uuid", async () => {
    useChatListStore
      .getState()
      .upsertStreamMetadataRows([{ streamUuid: STREAM_UUID, name: "engineering" }]);
    fetchStreamTopicsMock.mockResolvedValue([
      topicRow("General Chat", TOPIC_DEFAULT_UUID, { is_default: true }),
      topicRow("alpha", TOPIC_ALPHA_UUID),
    ]);
    fetchStreamChannelMock.mockResolvedValue([
      streamMsg({
        stream_uuid: STREAM_UUID,
        subject: "",
        topic_uuid: TOPIC_DEFAULT_UUID,
        content: "default topic preview",
      }),
    ]);

    await requestStreamSidebarTopicListHydrate(STREAM_UUID);

    const stream = useChatListStore.getState().streamsMap.get(STREAM_UUID);
    expect(stream?.topics.has("General Chat")).toBe(true);
    expect(stream?.topics.get("General Chat")?.lastMessage).toContain("default topic preview");
    expect(fetchStreamChannelMock).toHaveBeenCalledWith(
      STREAM_UUID,
      undefined,
      expect.any(AbortSignal),
    );
  });

  it("hydrates message previews after topic list shells are inserted", async () => {
    useChatListStore
      .getState()
      .upsertStreamMetadataRows([{ streamUuid: STREAM_UUID, name: "engineering" }]);
    fetchStreamTopicsMock.mockResolvedValue([topicRow("alpha", TOPIC_ALPHA_UUID)]);
    fetchStreamChannelMock.mockResolvedValue([
      streamMsg({ stream_uuid: STREAM_UUID, subject: "alpha", content: "preview text" }),
    ]);

    await requestStreamSidebarTopicListHydrate(STREAM_UUID);

    expect(
      useChatListStore.getState().streamsMap.get(STREAM_UUID)?.topics.get("alpha")?.lastMessage,
    ).toContain("preview text");
    expect(fetchStreamChannelMock).toHaveBeenCalledWith(
      STREAM_UUID,
      undefined,
      expect.any(AbortSignal),
    );
  });
});

describe("requestStreamSidebarTopicsHydrate preview backfill", () => {
  beforeEach(() => {
    resetInstancesStore();
    seedActiveInstance();
    clearStreamSidebarHydrateState();
    useChatListStore.getState().clear();
    fetchStreamChannelMock.mockReset();
  });

  afterEach(() => {
    resetInstancesStore();
    clearStreamSidebarHydrateState();
    useChatListStore.getState().clear();
  });

  it("fetches messages when topic shells exist without preview text", async () => {
    useChatListStore
      .getState()
      .upsertStreamMetadataRows([{ streamUuid: STREAM_UUID, name: "engineering" }]);
    useChatListStore
      .getState()
      .upsertStreamTopicShells(STREAM_UUID, [topicShell("shell-only", TOPIC_SHELL_UUID)]);
    fetchStreamChannelMock.mockResolvedValue([
      streamMsg({ stream_uuid: STREAM_UUID, subject: "shell-only", content: "filled preview" }),
    ]);

    await requestStreamSidebarTopicsHydrate(STREAM_UUID, "expand");

    expect(fetchStreamChannelMock).toHaveBeenCalledWith(
      STREAM_UUID,
      undefined,
      expect.any(AbortSignal),
    );
    expect(
      useChatListStore.getState().streamsMap.get(STREAM_UUID)?.topics.get("shell-only")
        ?.lastMessage,
    ).toContain("filled preview");
  });
});

describe("requestStreamSidebarTopicPreviewBackfill", () => {
  beforeEach(() => {
    resetInstancesStore();
    seedActiveInstance();
    clearStreamSidebarHydrateState();
    useChatListStore.getState().clear();
    fetchLatestTopicMessagesMock.mockReset();
    fetchStreamChannelMock.mockReset();
  });

  afterEach(() => {
    resetInstancesStore();
    clearStreamSidebarHydrateState();
    useChatListStore.getState().clear();
  });

  it("hydrates preview text for topic shells without last message", async () => {
    useChatListStore
      .getState()
      .upsertStreamMetadataRows([{ streamUuid: STREAM_UUID, name: "general" }]);
    useChatListStore
      .getState()
      .upsertStreamTopicShells(STREAM_UUID, [
        topicShell("alpha", TOPIC_ALPHA_UUID),
        topicShell("beta", TOPIC_BETA_UUID),
      ]);
    fetchLatestTopicMessagesMock.mockResolvedValue([
      streamMsg({
        id: "00000000-0000-4000-8000-000000000010",
        stream_uuid: STREAM_UUID,
        subject: "alpha",
        content: "alpha preview",
        timestamp: 10,
      }),
      streamMsg({
        id: "00000000-0000-4000-8000-000000000011",
        stream_uuid: STREAM_UUID,
        subject: "beta",
        content: "beta preview",
        timestamp: 11,
      }),
    ]);

    await requestStreamSidebarTopicPreviewBackfill(STREAM_UUID);

    const stream = useChatListStore.getState().streamsMap.get(STREAM_UUID);
    expect(fetchLatestTopicMessagesMock).toHaveBeenCalledWith(
      STREAM_UUID,
      [
        { topicUuid: TOPIC_ALPHA_UUID, subject: "alpha" },
        { topicUuid: TOPIC_BETA_UUID, subject: "beta" },
      ],
      expect.any(AbortSignal),
    );
    expect(stream?.topics.get("alpha")?.lastMessage).toContain("alpha preview");
    expect(stream?.topics.get("beta")?.lastMessage).toContain("beta preview");
  });

  it("skips fetch when stream topics already have previews", async () => {
    useChatListStore
      .getState()
      .upsertStreamMetadataRows([{ streamUuid: STREAM_UUID, name: "general" }]);
    useChatListStore
      .getState()
      .applyStreamSidebarPreviewsFromMessages([
        streamMsg({ stream_uuid: STREAM_UUID, subject: "alpha" }),
      ]);

    await requestStreamSidebarTopicPreviewBackfill(STREAM_UUID);

    expect(fetchLatestTopicMessagesMock).not.toHaveBeenCalled();
  });

  it("drops stale hydrate results after sidebar state cleanup", async () => {
    useChatListStore
      .getState()
      .upsertStreamMetadataRows([{ streamUuid: STREAM_UUID, name: "general" }]);
    let resolveFetch!: (value: WorkspaceRawMessage[]) => void;
    fetchStreamChannelMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const pending = requestStreamSidebarTopicsHydrate(STREAM_UUID, "expand");
    await flushMicrotasks();
    clearStreamSidebarHydrateState();

    resolveFetch([
      streamMsg({ stream_uuid: STREAM_UUID, subject: "stale-topic", content: "stale preview" }),
    ]);
    await pending;

    expect(useChatListStore.getState().streamsMap.get(STREAM_UUID)?.topics.size).toBe(0);
  });

  it("does not dedupe hydrate requests across different organizations", async () => {
    useChatListStore
      .getState()
      .upsertStreamMetadataRows([{ streamUuid: STREAM_UUID, name: "general" }]);
    let firstResolve!: (value: WorkspaceRawMessage[]) => void;
    let secondResolve!: (value: WorkspaceRawMessage[]) => void;
    fetchStreamChannelMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            firstResolve = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            secondResolve = resolve;
          }),
      );

    const first = requestStreamSidebarTopicsHydrate(STREAM_UUID, "expand");
    await flushMicrotasks();

    clearStreamSidebarHydrateState();
    useChatListStore.getState().clear();
    const secondInstanceId = seedActiveInstance("https://messenger-2.test");
    useInstancesStore.getState().setCurrentInstanceId(secondInstanceId);
    useChatListStore
      .getState()
      .upsertStreamMetadataRows([{ streamUuid: OTHER_STREAM_UUID, name: "general" }]);

    const second = requestStreamSidebarTopicsHydrate(OTHER_STREAM_UUID, "expand");
    await flushMicrotasks();

    expect(fetchStreamChannelMock).toHaveBeenCalledTimes(2);

    firstResolve([streamMsg({ stream_uuid: STREAM_UUID, subject: "old-org" })]);
    secondResolve([streamMsg({ stream_uuid: OTHER_STREAM_UUID, subject: "new-org" })]);
    await Promise.all([first, second]);

    expect(
      useChatListStore.getState().streamsMap.get(OTHER_STREAM_UUID)?.topics.has("new-org"),
    ).toBe(true);
    expect(
      useChatListStore.getState().streamsMap.get(OTHER_STREAM_UUID)?.topics.has("old-org"),
    ).toBe(false);
  });
});
