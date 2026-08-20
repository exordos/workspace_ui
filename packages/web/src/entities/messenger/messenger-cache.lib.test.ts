import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyMessengerMessagePointerCache,
  createMessengerCatalogCacheReconcileFence,
  deleteMessengerStreamBindingCatalogCache,
  deleteWorkspaceMessengerCacheDatabase,
  openWorkspaceMessengerCacheDb,
  readMessengerCatalogCache,
  resetWorkspaceMessengerCacheDbSingletonForTests,
  upsertMessengerStreamBindingsCache,
} from "~/shared/lib/workspace-messenger-cache-db";
import {
  deleteMessengerStreamCache,
  messengerRealtimeBackgroundCache,
  patchMessengerCachedMessage,
  readMessengerCatalogPayloadCache,
  readMessengerConversationWindowCache,
  readMessengerMessageBodyCache,
  writeMessengerMessageBodyCache,
  restoreMessengerStreamCache,
  writeMessengerCatalogPayloadCache,
} from "./messenger-cache.lib";
import type {
  MessengerBootstrapPayload,
  MessengerFolder,
  MessengerMessage,
  MessengerStream,
  MessengerStreamBinding,
  MessengerTopic,
} from "./messenger.types";

const OWNER_KEY = "account:a:org:o:project:p:user:u";
const OTHER_OWNER_KEY = "account:b:org:o:project:p:user:u";
const STREAM_UUID = "11111111-1111-4111-8111-111111111111";
const BINDING_UUID = "22222222-2222-4222-8222-222222222222";
const USER_UUID = "33333333-3333-4333-8333-333333333333";
const TOPIC_UUID = "44444444-4444-4444-8444-444444444444";
const MESSAGE_UUID = "55555555-5555-4555-8555-555555555555";
const FOLDER_UUID = "66666666-6666-4666-8666-666666666666";
const FOLDER_ITEM_UUID = "77777777-7777-4777-8777-777777777777";
const DATE = "2026-07-01T08:00:00.000Z";

function createEmptyPayload(): MessengerBootstrapPayload {
  return {
    streams: [],
    streamBindings: [],
    topics: [],
    conversations: [],
    folders: [],
  };
}

function createStreamBinding(): MessengerStreamBinding {
  return {
    uuid: BINDING_UUID,
    projectId: "project-a",
    streamUuid: STREAM_UUID,
    userUuid: USER_UUID,
    whoUuid: USER_UUID,
    role: "member",
    notificationMode: "all_messages",
    createdAt: DATE,
    updatedAt: DATE,
  };
}

function createStream(overrides: Partial<MessengerStream> = {}): MessengerStream {
  return {
    uuid: STREAM_UUID,
    projectId: "project-a",
    ownerUuid: USER_UUID,
    userUuid: USER_UUID,
    role: "member",
    notificationMode: "all_messages",
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
    color: 0x2563eb,
    directUserUuid: null,
    lastMessageUuid: null,
    createdAt: DATE,
    updatedAt: DATE,
    ...overrides,
  };
}

function createTopic(overrides: Partial<MessengerTopic> = {}): MessengerTopic {
  return {
    uuid: TOPIC_UUID,
    projectId: "project-a",
    streamUuid: STREAM_UUID,
    userUuid: USER_UUID,
    name: "general chat",
    unreadCount: 0,
    isDefault: false,
    isDone: false,
    notificationMode: "default",
    lastMessageUuid: null,
    createdAt: DATE,
    updatedAt: DATE,
    ...overrides,
  };
}

function createFolder(overrides: Partial<MessengerFolder> = {}): MessengerFolder {
  return {
    uuid: FOLDER_UUID,
    title: "All chats",
    backgroundColorValue: null,
    unreadCount: 1,
    systemType: "all",
    items: [
      {
        uuid: FOLDER_ITEM_UUID,
        projectId: "project-a",
        folderUuid: FOLDER_UUID,
        userUuid: USER_UUID,
        streamUuid: STREAM_UUID,
        conversationId: `stream:${STREAM_UUID}`,
        chatType: "stream",
        orderIndex: 0,
        pinnedAt: null,
        unreadCount: 1,
        activeUnreadCount: 1,
        passiveUnreadCount: 0,
        createdAt: DATE,
        updatedAt: DATE,
      },
    ],
    createdAt: DATE,
    updatedAt: DATE,
    ...overrides,
  };
}

function createMessage(overrides: Partial<MessengerMessage> = {}): MessengerMessage {
  return {
    uuid: MESSAGE_UUID,
    conversationId: `topic:${STREAM_UUID}:${TOPIC_UUID}`,
    projectId: "project-a",
    streamUuid: STREAM_UUID,
    topicUuid: TOPIC_UUID,
    authorUuid: USER_UUID,
    userUuid: USER_UUID,
    payload: { kind: "markdown", content: "Message" },
    read: false,
    pinned: false,
    starred: false,
    isOwn: false,
    mentioned: false,
    sourceName: "native",
    source: { kind: "native" },
    provider: null,
    delivery: null,
    reactions: {},
    reactionUserUuidsByEmojiName: {},
    ownReactionUuidsByEmojiName: {},
    createdAt: DATE,
    updatedAt: DATE,
    ...overrides,
  };
}

afterEach(async () => {
  try {
    const db = await openWorkspaceMessengerCacheDb();
    db.close();
  } catch {
    // no open DB
  }
  resetWorkspaceMessengerCacheDbSingletonForTests();
  await deleteWorkspaceMessengerCacheDatabase();
});

describe("messenger cache", () => {
  it("restores stream color from the catalog cache", async () => {
    await writeMessengerCatalogPayloadCache(OWNER_KEY, {
      ...createEmptyPayload(),
      streams: [createStream()],
    });

    const cached = await readMessengerCatalogPayloadCache(OWNER_KEY);

    expect(cached?.payload.streams[0]).toMatchObject({
      uuid: STREAM_UUID,
      name: "Engineering",
      color: 0x2563eb,
    });
  });

  it("keeps side-loaded stream bindings when bootstrap reconcile has no bindings catalog", async () => {
    await upsertMessengerStreamBindingsCache(OWNER_KEY, [createStreamBinding()]);

    await writeMessengerCatalogPayloadCache(OWNER_KEY, createEmptyPayload(), {
      mode: "reconcile",
      reconcileFence: createMessengerCatalogCacheReconcileFence(),
    });

    const snapshot = await readMessengerCatalogCache(OWNER_KEY);
    expect(snapshot.streamBindings.map((binding) => binding.uuid)).toEqual([BINDING_UUID]);
  });

  it("reconciles a fresh topic name after a newer message pointer touched stale cache", async () => {
    const staleTopic = createTopic();
    await writeMessengerCatalogPayloadCache(OWNER_KEY, {
      ...createEmptyPayload(),
      streams: [createStream()],
      topics: [staleTopic],
    });
    await applyMessengerMessagePointerCache(OWNER_KEY, {
      uuid: MESSAGE_UUID,
      conversationId: `topic:${STREAM_UUID}:${TOPIC_UUID}`,
      streamUuid: STREAM_UUID,
      topicUuid: TOPIC_UUID,
      payload: { kind: "markdown", content: "New activity" },
      createdAt: "2026-07-01T08:20:00.000Z",
    });

    const touchedByMessage = await readMessengerCatalogPayloadCache(OWNER_KEY);
    expect(touchedByMessage?.payload.topics[0]).toMatchObject({
      name: "general chat",
      lastMessageUuid: MESSAGE_UUID,
      updatedAt: DATE,
    });

    const reconcileFence = createMessengerCatalogCacheReconcileFence();
    await writeMessengerCatalogPayloadCache(
      OWNER_KEY,
      {
        ...createEmptyPayload(),
        streams: [createStream()],
        topics: [createTopic({ name: "UI", updatedAt: "2026-07-01T08:10:00.000Z" })],
      },
      { mode: "reconcile", reconcileFence },
    );

    const cached = await readMessengerCatalogPayloadCache(OWNER_KEY);
    expect(cached?.payload.topics[0]?.name).toBe("UI");
  });

  it("keeps a topic update written after catalog reconciliation started", async () => {
    await writeMessengerCatalogPayloadCache(OWNER_KEY, {
      ...createEmptyPayload(),
      streams: [createStream()],
      topics: [createTopic()],
    });
    const reconcileFence = createMessengerCatalogCacheReconcileFence();

    await writeMessengerCatalogPayloadCache(OWNER_KEY, {
      ...createEmptyPayload(),
      streams: [createStream()],
      topics: [createTopic({ name: "UI", updatedAt: "2026-07-01T08:10:00.000Z" })],
    });
    await writeMessengerCatalogPayloadCache(
      OWNER_KEY,
      {
        ...createEmptyPayload(),
        streams: [createStream()],
        topics: [createTopic()],
      },
      { mode: "reconcile", reconcileFence },
    );

    const cached = await readMessengerCatalogPayloadCache(OWNER_KEY);
    expect(cached?.payload.topics[0]?.name).toBe("UI");
  });

  it("applies a newer authoritative topic after a post-fence cache write", async () => {
    await writeMessengerCatalogPayloadCache(OWNER_KEY, {
      ...createEmptyPayload(),
      streams: [createStream()],
      topics: [createTopic()],
    });
    const reconcileFence = createMessengerCatalogCacheReconcileFence();

    await writeMessengerCatalogPayloadCache(OWNER_KEY, {
      ...createEmptyPayload(),
      streams: [createStream()],
      topics: [createTopic({ name: "UI", updatedAt: "2026-07-01T08:10:00.000Z" })],
    });
    await writeMessengerCatalogPayloadCache(
      OWNER_KEY,
      {
        ...createEmptyPayload(),
        streams: [createStream()],
        topics: [createTopic({ name: "Platform", updatedAt: "2026-07-01T08:20:00.000Z" })],
      },
      { mode: "reconcile", reconcileFence },
    );

    const cached = await readMessengerCatalogPayloadCache(OWNER_KEY);
    expect(cached?.payload.topics[0]?.name).toBe("Platform");
  });

  it("does not move catalog pointers when an older cached message is edited", async () => {
    const latestMessageUuid = "66666666-6666-4666-8666-666666666666";
    await writeMessengerCatalogPayloadCache(OWNER_KEY, {
      ...createEmptyPayload(),
      streams: [createStream({ lastMessageUuid: latestMessageUuid })],
      topics: [
        createTopic({
          lastMessageUuid: latestMessageUuid,
          updatedAt: "2026-07-01T08:10:00.000Z",
        }),
      ],
    });

    await patchMessengerCachedMessage(
      OWNER_KEY,
      createMessage({
        createdAt: "2026-07-01T08:15:00.000Z",
        updatedAt: "2026-07-01T08:30:00.000Z",
      }),
    );

    const cached = await readMessengerCatalogPayloadCache(OWNER_KEY);
    expect(cached?.payload.streams[0]?.lastMessageUuid).toBe(latestMessageUuid);
    expect(cached?.payload.topics[0]?.lastMessageUuid).toBe(latestMessageUuid);
  });

  it("removes a realtime-deleted stream binding without touching other catalog rows", async () => {
    await upsertMessengerStreamBindingsCache(OWNER_KEY, [createStreamBinding()]);

    await deleteMessengerStreamBindingCatalogCache(OWNER_KEY, BINDING_UUID);

    const snapshot = await readMessengerCatalogCache(OWNER_KEY);
    expect(snapshot.streamBindings).toEqual([]);
  });

  it("keeps external provenance when a message is restored from cache", async () => {
    const message: MessengerMessage = {
      uuid: MESSAGE_UUID,
      conversationId: `topic:${STREAM_UUID}:${TOPIC_UUID}`,
      projectId: "project-a",
      streamUuid: STREAM_UUID,
      topicUuid: TOPIC_UUID,
      authorUuid: USER_UUID,
      userUuid: USER_UUID,
      payload: { kind: "markdown", content: "Imported message" },
      read: false,
      pinned: false,
      starred: false,
      isOwn: false,
      mentioned: true,
      sourceName: "zulip",
      source: { kind: "zulip", stream_id: 7, message_id: 42 },
      provider: {
        kind: "zulip",
        account_uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        external_id: "message-42",
        capabilities: {},
        delivery_class: "backfill",
        notification_eligible: false,
      },
      delivery: { status: "delivered", safe_error: null },
      reactions: {},
      reactionUserUuidsByEmojiName: {},
      ownReactionUuidsByEmojiName: {},
      createdAt: DATE,
      updatedAt: DATE,
    };

    await writeMessengerMessageBodyCache(OWNER_KEY, [message]);

    await expect(readMessengerMessageBodyCache(OWNER_KEY, [MESSAGE_UUID])).resolves.toEqual([
      message,
    ]);
  });

  it("normalizes reaction users when restoring a legacy cached message", async () => {
    const legacyMessage: Partial<MessengerMessage> = { ...createMessage() };
    Reflect.deleteProperty(legacyMessage, "reactionUserUuidsByEmojiName");
    await writeMessengerMessageBodyCache(OWNER_KEY, [legacyMessage as MessengerMessage]);

    const [restoredMessage] = await readMessengerMessageBodyCache(OWNER_KEY, [MESSAGE_UUID]);

    expect(restoredMessage?.reactionUserUuidsByEmojiName).toEqual({});
  });

  it("does not persist runtime-only optimistic reaction state", async () => {
    const message = createMessage({
      optimisticReactionUserUuidsByEmojiName: { thumbs_up: [USER_UUID] },
      pendingOwnReactionsByEmojiName: {
        thumbs_up: {
          requestId: "reaction-request",
          operation: "add",
          previousCount: 0,
          previousOwnReactionUuid: null,
        },
      },
    });

    await writeMessengerMessageBodyCache(OWNER_KEY, [message]);
    const [restoredMessage] = await readMessengerMessageBodyCache(OWNER_KEY, [MESSAGE_UUID]);

    expect(restoredMessage?.optimisticReactionUserUuidsByEmojiName).toBeUndefined();
    expect(restoredMessage?.pendingOwnReactionsByEmojiName).toBeUndefined();
  });

  it("projects background stream unread counters into cached folders", async () => {
    await writeMessengerCatalogPayloadCache(OWNER_KEY, {
      ...createEmptyPayload(),
      streams: [createStream({ unreadCount: 1, activeUnreadCount: 1, passiveUnreadCount: 0 })],
      folders: [createFolder()],
    });

    await messengerRealtimeBackgroundCache.upsertCachedStream(
      OWNER_KEY,
      createStream({ unreadCount: 5, activeUnreadCount: 3, passiveUnreadCount: 2 }),
    );

    const snapshot = await readMessengerCatalogCache(OWNER_KEY);
    expect(snapshot.folders[0]).toMatchObject({
      uuid: FOLDER_UUID,
      unreadCount: 3,
      items: [
        expect.objectContaining({
          uuid: FOLDER_ITEM_UUID,
          unreadCount: 5,
          activeUnreadCount: 3,
          passiveUnreadCount: 2,
        }),
      ],
    });
    expect(snapshot.folderItems[0]).toMatchObject({
      uuid: FOLDER_ITEM_UUID,
      unreadCount: 5,
      activeUnreadCount: 3,
      passiveUnreadCount: 2,
    });
  });

  it("persists the background message lifecycle without crossing owner boundaries", async () => {
    const conversationId = `topic:${STREAM_UUID}:${TOPIC_UUID}`;
    await messengerRealtimeBackgroundCache.writeConversationMessagePage(OWNER_KEY, conversationId, {
      messages: [createMessage()],
    });
    await messengerRealtimeBackgroundCache.writeConversationMessagePage(
      OTHER_OWNER_KEY,
      conversationId,
      {
        messages: [createMessage({ payload: { kind: "markdown", content: "Other owner" } })],
      },
    );

    await expect(readMessengerConversationWindowCache(OWNER_KEY, conversationId)).resolves.toEqual(
      expect.objectContaining({ messages: [expect.objectContaining({ uuid: MESSAGE_UUID })] }),
    );

    await messengerRealtimeBackgroundCache.patchCachedMessage(
      OWNER_KEY,
      createMessage({
        payload: { kind: "markdown", content: "Edited" },
        updatedAt: "2026-07-01T08:10:00.000Z",
      }),
    );
    await messengerRealtimeBackgroundCache.markCachedMessagesRead(OWNER_KEY, [MESSAGE_UUID]);

    await expect(readMessengerMessageBodyCache(OWNER_KEY, [MESSAGE_UUID])).resolves.toEqual([
      expect.objectContaining({
        uuid: MESSAGE_UUID,
        payload: { kind: "markdown", content: "Edited" },
        read: true,
      }),
    ]);
    await expect(readMessengerMessageBodyCache(OTHER_OWNER_KEY, [MESSAGE_UUID])).resolves.toEqual([
      expect.objectContaining({
        uuid: MESSAGE_UUID,
        payload: { kind: "markdown", content: "Other owner" },
        read: false,
      }),
    ]);

    await messengerRealtimeBackgroundCache.deleteCachedMessage(OWNER_KEY, MESSAGE_UUID, [
      `stream:${STREAM_UUID}`,
      conversationId,
    ]);
    await expect(readMessengerMessageBodyCache(OWNER_KEY, [MESSAGE_UUID])).resolves.toEqual([]);
    await expect(readMessengerMessageBodyCache(OTHER_OWNER_KEY, [MESSAGE_UUID])).resolves.toEqual([
      expect.objectContaining({ uuid: MESSAGE_UUID, read: false }),
    ]);
    await expect(readMessengerConversationWindowCache(OWNER_KEY, conversationId)).resolves.toEqual(
      expect.objectContaining({ messages: [] }),
    );
  });

  it("adjusts cached folder unread and keeps the deletion fence after stream deletion", async () => {
    await writeMessengerCatalogPayloadCache(OWNER_KEY, {
      ...createEmptyPayload(),
      streams: [createStream({ unreadCount: 4, activeUnreadCount: 3, passiveUnreadCount: 1 })],
      folders: [
        createFolder({
          unreadCount: 3,
          items: [
            {
              ...createFolder().items[0]!,
              unreadCount: 4,
              activeUnreadCount: 3,
              passiveUnreadCount: 1,
            },
          ],
        }),
      ],
    });

    await messengerRealtimeBackgroundCache.deleteCachedStream(OWNER_KEY, STREAM_UUID);
    await messengerRealtimeBackgroundCache.upsertCachedStream(
      OWNER_KEY,
      createStream({ unreadCount: 9, activeUnreadCount: 9 }),
    );

    const snapshot = await readMessengerCatalogCache(OWNER_KEY);
    expect(snapshot.streams).toEqual([]);
    expect(snapshot.folderItems).toEqual([]);
    expect(snapshot.folders[0]).toMatchObject({ unreadCount: 0, items: [] });
    restoreMessengerStreamCache(OWNER_KEY, STREAM_UUID);
  });

  it("does not let a stale message write recreate a deleted stream cache", async () => {
    const message: MessengerMessage = {
      uuid: MESSAGE_UUID,
      conversationId: `topic:${STREAM_UUID}:${TOPIC_UUID}`,
      projectId: "project-a",
      streamUuid: STREAM_UUID,
      topicUuid: TOPIC_UUID,
      authorUuid: USER_UUID,
      userUuid: USER_UUID,
      payload: { kind: "markdown", content: "Stale message" },
      read: false,
      pinned: false,
      starred: false,
      isOwn: false,
      reactions: {},
      reactionUserUuidsByEmojiName: {},
      ownReactionUuidsByEmojiName: {},
      createdAt: DATE,
      updatedAt: DATE,
    };

    await deleteMessengerStreamCache(OWNER_KEY, STREAM_UUID);
    await writeMessengerMessageBodyCache(OWNER_KEY, [message]);

    await expect(readMessengerMessageBodyCache(OWNER_KEY, [MESSAGE_UUID])).resolves.toEqual([]);
  });

  it("accepts cache writes after an explicit stream restore", async () => {
    const stream = createStream();
    await deleteMessengerStreamCache(OWNER_KEY, STREAM_UUID);
    restoreMessengerStreamCache(OWNER_KEY, STREAM_UUID);
    await writeMessengerCatalogPayloadCache(OWNER_KEY, {
      ...createEmptyPayload(),
      streams: [stream],
    });

    await expect(readMessengerCatalogPayloadCache(OWNER_KEY)).resolves.toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({ streams: [stream] }),
      }),
    );
  });
});
