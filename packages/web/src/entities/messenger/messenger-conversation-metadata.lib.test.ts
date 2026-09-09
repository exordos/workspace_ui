import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearWorkspaceConversationMetadataMemo,
  resolveWorkspaceConversationMetadata,
} from "./messenger-conversation-metadata.lib";
import { useMessengerStore } from "./messenger.model";
import type { MessengerStream, MessengerTopic } from "./messenger.types";

const readCatalogCacheMock = vi.hoisted(() =>
  vi.fn(() => Promise.resolve<{ payload: { streams: unknown[]; topics: unknown[] } } | null>(null)),
);

vi.mock("./messenger-cache.lib", () => ({
  readMessengerCatalogPayloadCache: (...args: Parameters<typeof readCatalogCacheMock>) =>
    readCatalogCacheMock(...args),
}));

function createStream(overrides: Partial<MessengerStream> = {}): MessengerStream {
  return {
    uuid: "stream-1",
    projectId: "project",
    ownerUuid: "owner-1",
    userUuid: "user-1",
    role: "member",
    notificationMode: "mentions_only",
    name: "Engineering",
    description: "",
    unreadCount: 0,
    sourceName: "native",
    source: { kind: "native" },
    audience: "channel",
    isPrivate: false,
    inviteOnly: false,
    announce: false,
    isArchived: false,
    directUserUuid: null,
    lastMessageUuid: null,
    createdAt: "2026-07-07T10:00:00.000Z",
    updatedAt: "2026-07-07T10:00:00.000Z",
    ...overrides,
  };
}

function createTopic(overrides: Partial<MessengerTopic> = {}): MessengerTopic {
  return {
    uuid: "topic-1",
    projectId: "project",
    streamUuid: "stream-1",
    userUuid: "user-1",
    name: "Releases",
    unreadCount: 0,
    isDefault: false,
    isDone: false,
    notificationMode: "follow",
    lastMessageUuid: null,
    createdAt: "2026-07-07T10:00:00.000Z",
    updatedAt: "2026-07-07T10:00:00.000Z",
    ...overrides,
  };
}

const conversation = { ownerKey: "owner-1", streamUuid: "stream-1", topicUuid: "topic-1" };

describe("resolveWorkspaceConversationMetadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearWorkspaceConversationMetadataMemo();
    useMessengerStore.getState().clear();
  });

  afterEach(() => {
    clearWorkspaceConversationMetadataMemo();
    useMessengerStore.getState().clear();
  });

  it("names the conversation from the loaded store without touching the cache", async () => {
    useMessengerStore.setState({
      ownerKey: "owner-1",
      streamsById: { "stream-1": createStream() },
      topicsById: { "topic-1": createTopic() },
    });

    await expect(resolveWorkspaceConversationMetadata(conversation)).resolves.toEqual({
      stream: { streamName: "Engineering", isPrivate: false, notificationMode: "mentions_only" },
      topic: { topicName: "Releases", notificationMode: "follow" },
    });
    expect(readCatalogCacheMock).not.toHaveBeenCalled();
  });

  it("keeps the default topic nameless so the title layer builds its own", async () => {
    useMessengerStore.setState({
      ownerKey: "owner-1",
      streamsById: { "stream-1": createStream() },
      topicsById: { "topic-1": createTopic({ isDefault: true, notificationMode: "default" }) },
    });

    const metadata = await resolveWorkspaceConversationMetadata(conversation);

    expect(metadata.topic).toEqual({ topicName: null, notificationMode: "default" });
  });

  it("falls back to the cached catalog for an owner that is not on screen", async () => {
    useMessengerStore.setState({
      ownerKey: "owner-2",
      streamsById: {},
      topicsById: {},
    });
    readCatalogCacheMock.mockResolvedValue({
      payload: { streams: [createStream({ isPrivate: true })], topics: [createTopic()] },
    });

    await expect(resolveWorkspaceConversationMetadata(conversation)).resolves.toEqual({
      stream: { streamName: "Engineering", isPrivate: true, notificationMode: "mentions_only" },
      topic: { topicName: "Releases", notificationMode: "follow" },
    });
  });

  it("reads the cached catalog once for a burst of candidates", async () => {
    readCatalogCacheMock.mockResolvedValue({
      payload: { streams: [createStream()], topics: [createTopic()] },
    });

    await Promise.all([
      resolveWorkspaceConversationMetadata(conversation),
      resolveWorkspaceConversationMetadata(conversation),
    ]);
    await resolveWorkspaceConversationMetadata(conversation);

    expect(readCatalogCacheMock).toHaveBeenCalledTimes(1);
  });

  it("reports what neither the store nor the cache knows", async () => {
    readCatalogCacheMock.mockResolvedValue({
      payload: { streams: [createStream()], topics: [] },
    });

    await expect(resolveWorkspaceConversationMetadata(conversation)).resolves.toEqual({
      stream: { streamName: "Engineering", isPrivate: false, notificationMode: "mentions_only" },
      topic: null,
    });
  });

  it("stays silent when the cached catalog cannot be read", async () => {
    readCatalogCacheMock.mockRejectedValue(new Error("cache unavailable"));

    await expect(resolveWorkspaceConversationMetadata(conversation)).resolves.toEqual({
      stream: null,
      topic: null,
    });
  });
});
