import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import {
  createMessengerCatalogCacheReconcileFence,
  deleteCachedStreamMessageBuckets,
  deleteCachedMessage,
  deleteCachedTopicMessageBuckets,
  deleteOwnMessageReaction,
  deleteOwnMessageReactionsForMessage,
  deleteOwnMessageReactionsForMessages,
  deleteExpiredMessengerSearchResults,
  deleteWorkspaceMessengerCacheDatabase,
  deleteWorkspaceMessengerOwnerCache,
  openWorkspaceMessengerCacheDb,
  patchCachedMessage,
  readCachedMessagesByUuids,
  readWorkspaceComposerDraft,
  readConversationMessageWindow,
  readMessengerCatalogCache,
  readOwnMessageReaction,
  readOwnMessageReactions,
  readMessengerSearchResults,
  replaceOwnMessageReactionsForOwner,
  replaceOwnMessageReactionsForMessage,
  resetWorkspaceMessengerCacheDbSingletonForTests,
  WORKSPACE_MESSENGER_CACHE_DB_NAME,
  WORKSPACE_MESSENGER_CACHE_DB_VERSION,
  workspaceMessengerMessageOrderKey,
  upsertCachedMessages,
  upsertOwnMessageReaction,
  writeConversationMessagePage,
  writeMessengerCatalogCache,
  writeMessengerSearchResults,
  writeRealtimeCursor,
} from "./workspace-messenger-cache-db";
import type { WorkspaceMessengerComposerDraftCacheRow } from "./workspace-messenger-cache-db";

const OWNER = "account:a:org:o:project:p:user:u";
const OTHER_OWNER = "account:b:org:o:project:p:user:u";
const STREAM = "stream-a";
const TOPIC = "topic-a";
const STREAM_CONVERSATION = `stream:${STREAM}`;
const TOPIC_CONVERSATION = `topic:${STREAM}:${TOPIC}`;
const USER_UUID = "user-a";

function message(uuid: string, createdAt: string) {
  return {
    uuid,
    conversationId: TOPIC_CONVERSATION,
    streamUuid: STREAM,
    topicUuid: TOPIC,
    payload: { kind: "markdown" as const, content: `Message ${uuid}` },
    createdAt,
    updatedAt: createdAt,
  };
}

function ownReaction(messageUuid: string, emojiName: string, reactionUuid: string) {
  return {
    messageUuid,
    userUuid: USER_UUID,
    reactionUuid,
    emojiName,
    createdAt: "2026-07-01T08:00:00.000Z",
    updatedAt: "2026-07-01T08:00:00.000Z",
  };
}

async function seedLegacyComposerDraft<TContent>(
  ownerKey: string,
  conversationId: string,
  draft: Omit<
    WorkspaceMessengerComposerDraftCacheRow<TContent>,
    "id" | "ownerKey" | "conversationId"
  >,
): Promise<void> {
  const db = await openWorkspaceMessengerCacheDb();
  const transaction = db.transaction("composerDrafts", "readwrite");
  transaction.objectStore("composerDrafts").put({
    id: `${ownerKey}:${conversationId}`,
    ownerKey,
    conversationId,
    ...draft,
  } satisfies WorkspaceMessengerComposerDraftCacheRow<TContent>);
  await new Promise<void>((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("error", () =>
      reject(new Error(transaction.error?.message ?? "Cannot seed legacy composer draft")),
    );
    transaction.addEventListener("abort", () =>
      reject(new Error(transaction.error?.message ?? "Cannot seed legacy composer draft")),
    );
  });
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

describe("workspace-messenger-cache-db", () => {
  it("opens a new Workspace cache database with the current schema", async () => {
    const db = await openWorkspaceMessengerCacheDb();

    expect(db.name).toBe(WORKSPACE_MESSENGER_CACHE_DB_NAME);
    expect(db.version).toBe(WORKSPACE_MESSENGER_CACHE_DB_VERSION);
    expect([...db.objectStoreNames]).toEqual([
      "composerDrafts",
      "conversations",
      "folderItems",
      "folders",
      "messageBuckets",
      "messageWindows",
      "messages",
      "ownMessageReactions",
      "ownerMeta",
      "realtimeCursor",
      "searchResults",
      "streamBindings",
      "streams",
      "topics",
      "users",
    ]);

    const transaction = db.transaction("ownMessageReactions", "readonly");
    expect([...transaction.objectStore("ownMessageReactions").indexNames]).toEqual([
      "byOwner",
      "byOwnerMessage",
      "byOwnerReactionUuid",
    ]);

    const composerDraftTransaction = db.transaction("composerDrafts", "readonly");
    expect([...composerDraftTransaction.objectStore("composerDrafts").indexNames]).toEqual([
      "byOwner",
    ]);
  });

  it("reads legacy composer drafts independently by owner and conversation", async () => {
    await seedLegacyComposerDraft(OWNER, TOPIC_CONVERSATION, {
      snapshotId: "snapshot-a",
      content: { text: "Черновик" },
      updatedAt: 100,
    });
    await seedLegacyComposerDraft(OTHER_OWNER, TOPIC_CONVERSATION, {
      snapshotId: "snapshot-b",
      content: { text: "Другой владелец" },
      updatedAt: 200,
    });

    await expect(
      readWorkspaceComposerDraft<{ text: string }>(OWNER, TOPIC_CONVERSATION),
    ).resolves.toEqual({
      id: `${OWNER}:${TOPIC_CONVERSATION}`,
      ownerKey: OWNER,
      conversationId: TOPIC_CONVERSATION,
      snapshotId: "snapshot-a",
      content: { text: "Черновик" },
      updatedAt: 100,
    });
    await expect(
      readWorkspaceComposerDraft<{ text: string }>(OTHER_OWNER, TOPIC_CONVERSATION),
    ).resolves.toMatchObject({ snapshotId: "snapshot-b" });
  });

  it("removes composer drafts with the rest of an owner cache", async () => {
    await seedLegacyComposerDraft(OWNER, TOPIC_CONVERSATION, {
      snapshotId: "snapshot-a",
      content: { text: "Черновик" },
      updatedAt: 100,
    });
    await seedLegacyComposerDraft(OTHER_OWNER, TOPIC_CONVERSATION, {
      snapshotId: "snapshot-b",
      content: { text: "Другой владелец" },
      updatedAt: 100,
    });

    await deleteWorkspaceMessengerOwnerCache(OWNER);

    await expect(readWorkspaceComposerDraft(OWNER, TOPIC_CONVERSATION)).resolves.toBeNull();
    await expect(
      readWorkspaceComposerDraft(OTHER_OWNER, TOPIC_CONVERSATION),
    ).resolves.toMatchObject({
      snapshotId: "snapshot-b",
    });
  });

  it("writes and reads catalog snapshots without leaking between owners", async () => {
    await writeMessengerCatalogCache(OWNER, {
      streams: [{ uuid: STREAM, color: 0x2563eb, updatedAt: "2026-07-01T08:00:00.000Z" }],
      topics: [{ uuid: TOPIC, streamUuid: STREAM, updatedAt: "2026-07-01T08:01:00.000Z" }],
      conversations: [
        {
          id: TOPIC_CONVERSATION,
          streamUuid: STREAM,
          topicUuid: TOPIC,
          title: "Topic",
          unreadCount: 2,
          lastMessageUuid: "msg-2",
          updatedAt: "2026-07-01T08:02:00.000Z",
        },
      ],
      folders: [{ uuid: "folder-a", updatedAt: "2026-07-01T08:03:00.000Z" }],
      folderItems: [
        {
          uuid: "folder-item-a",
          folderUuid: "folder-a",
          conversationId: STREAM_CONVERSATION,
          streamUuid: STREAM,
          chatType: "stream",
          orderIndex: 1,
          pinnedAt: null,
          updatedAt: "2026-07-01T08:04:00.000Z",
        },
      ],
      users: [{ uuid: "user-a", updatedAt: "2026-07-01T08:05:00.000Z" }],
      streamBindings: [
        {
          uuid: "binding-a",
          streamUuid: STREAM,
          updatedAt: "2026-07-01T08:06:00.000Z",
        },
      ],
      lastHydratedAt: 42,
    });
    await writeRealtimeCursor(OWNER, 77);

    const snapshot = await readMessengerCatalogCache(OWNER);
    const otherSnapshot = await readMessengerCatalogCache(OTHER_OWNER);

    expect(snapshot.ownerMeta?.lastHydratedAt).toBe(42);
    expect(snapshot.streams).toEqual([
      { uuid: STREAM, color: 0x2563eb, updatedAt: "2026-07-01T08:00:00.000Z" },
    ]);
    expect(snapshot.topics.map((topic) => topic.uuid)).toEqual([TOPIC]);
    expect(snapshot.conversations.map((conversation) => conversation.id)).toEqual([
      TOPIC_CONVERSATION,
    ]);
    expect(snapshot.folders.map((folder) => folder.uuid)).toEqual(["folder-a"]);
    expect(snapshot.folderItems.map((item) => item.uuid)).toEqual(["folder-item-a"]);
    expect(snapshot.users).toEqual([]);
    expect(snapshot.streamBindings.map((binding) => binding.uuid)).toEqual(["binding-a"]);
    expect(snapshot.realtimeCursor?.epochVersion).toBe(77);
    expect(otherSnapshot.streams).toEqual([]);
    expect(otherSnapshot.realtimeCursor).toBeNull();
  });

  it("writes and reads cached messages by uuid without creating conversation windows", async () => {
    await upsertCachedMessages(OWNER, [
      message("msg-a", "2026-07-01T08:00:00.000Z"),
      message("msg-b", "2026-07-01T08:01:00.000Z"),
    ]);

    const messages = await readCachedMessagesByUuids(OWNER, ["msg-b", "msg-missing", "msg-a"]);
    const otherOwnerMessages = await readCachedMessagesByUuids(OTHER_OWNER, ["msg-a"]);
    const topicWindow = await readConversationMessageWindow(OWNER, TOPIC_CONVERSATION);

    expect(messages.map((item) => item.uuid)).toEqual(["msg-b", "msg-a"]);
    expect(otherOwnerMessages).toEqual([]);
    expect(topicWindow.messages).toEqual([]);
    expect(topicWindow.window).toBeNull();
  });

  it("merges catalog snapshots without deleting omitted or empty collections", async () => {
    await writeMessengerCatalogCache(OWNER, {
      folders: [{ uuid: "folder-a", updatedAt: "2026-07-01T08:03:00.000Z" }],
      folderItems: [
        {
          uuid: "folder-item-a",
          folderUuid: "folder-a",
          conversationId: STREAM_CONVERSATION,
          streamUuid: STREAM,
          chatType: "stream",
          orderIndex: 1,
          pinnedAt: null,
          updatedAt: "2026-07-01T08:04:00.000Z",
        },
      ],
    });

    await writeMessengerCatalogCache(OWNER, {
      streams: [{ uuid: STREAM, updatedAt: "2026-07-01T08:05:00.000Z" }],
      folders: [],
    });
    await writeMessengerCatalogCache(OWNER, {
      streams: [{ uuid: "stream-b", updatedAt: "2026-07-01T08:06:00.000Z" }],
    });

    const snapshot = await readMessengerCatalogCache(OWNER);

    expect(
      snapshot.streams.map((stream) => stream.uuid).sort((a, b) => a.localeCompare(b)),
    ).toEqual([STREAM, "stream-b"]);
    expect(snapshot.folders.map((folder) => folder.uuid)).toEqual(["folder-a"]);
    expect(snapshot.folderItems.map((item) => item.uuid)).toEqual(["folder-item-a"]);
  });

  it("backfills a missing stream color without replacing newer cached data", async () => {
    await writeMessengerCatalogCache(OWNER, {
      streams: [
        {
          uuid: STREAM,
          lastMessageUuid: "newer-message",
          updatedAt: "2026-07-01T08:02:00.000Z",
        },
      ],
    });

    await writeMessengerCatalogCache(OWNER, {
      streams: [
        {
          uuid: STREAM,
          color: 0x2563eb,
          lastMessageUuid: "older-message",
          updatedAt: "2026-07-01T08:01:00.000Z",
        },
      ],
    });

    const snapshot = await readMessengerCatalogCache(OWNER);

    expect(snapshot.streams).toEqual([
      {
        uuid: STREAM,
        color: 0x2563eb,
        lastMessageUuid: "newer-message",
        updatedAt: "2026-07-01T08:02:00.000Z",
      },
    ]);
  });

  it("reconciles catalog snapshots by deleting missing rows", async () => {
    await writeMessengerCatalogCache(OWNER, {
      streams: [
        { uuid: STREAM, updatedAt: "2026-07-01T08:00:00.000Z" },
        { uuid: "stream-b", updatedAt: "2026-07-01T08:00:00.000Z" },
      ],
    });

    await writeMessengerCatalogCache(
      OWNER,
      {
        streams: [{ uuid: STREAM, updatedAt: "2026-07-01T08:01:00.000Z" }],
      },
      {
        mode: "reconcile",
        reconcileFence: createMessengerCatalogCacheReconcileFence(),
      },
    );

    const snapshot = await readMessengerCatalogCache(OWNER);

    expect(snapshot.streams).toEqual([{ uuid: STREAM, updatedAt: "2026-07-01T08:01:00.000Z" }]);
  });

  it("keeps undefined collections untouched during full catalog reconcile", async () => {
    await writeMessengerCatalogCache(OWNER, {
      streams: [{ uuid: STREAM, updatedAt: "2026-07-01T08:00:00.000Z" }],
      folders: [{ uuid: "folder-a", updatedAt: "2026-07-01T08:03:00.000Z" }],
    });

    await writeMessengerCatalogCache(
      OWNER,
      {
        streams: [{ uuid: "stream-b", updatedAt: "2026-07-01T08:01:00.000Z" }],
      },
      {
        mode: "reconcile",
        reconcileFence: createMessengerCatalogCacheReconcileFence(),
      },
    );

    const snapshot = await readMessengerCatalogCache(OWNER);

    expect(snapshot.streams).toEqual([{ uuid: "stream-b", updatedAt: "2026-07-01T08:01:00.000Z" }]);
    expect(snapshot.folders).toEqual([{ uuid: "folder-a", updatedAt: "2026-07-01T08:03:00.000Z" }]);
  });

  it("clears old rows for empty collections during full catalog reconcile", async () => {
    await writeMessengerCatalogCache(OWNER, {
      users: [
        { uuid: "user-a", updatedAt: "2026-07-01T08:00:00.000Z" },
        { uuid: "user-b", updatedAt: "2026-07-01T08:00:00.000Z" },
      ],
    });

    await writeMessengerCatalogCache(
      OWNER,
      { users: [] },
      {
        mode: "reconcile",
        reconcileFence: createMessengerCatalogCacheReconcileFence(),
      },
    );

    const snapshot = await readMessengerCatalogCache(OWNER);

    expect(snapshot.users).toEqual([]);
  });

  it("keeps rows written after the reconcile fence", async () => {
    await writeMessengerCatalogCache(OWNER, {
      streams: [
        { uuid: STREAM, updatedAt: "2026-07-01T08:00:00.000Z" },
        { uuid: "stream-old-missing", updatedAt: "2026-07-01T08:00:00.000Z" },
      ],
    });

    const reconcileFence = createMessengerCatalogCacheReconcileFence();

    await writeMessengerCatalogCache(OWNER, {
      streams: [{ uuid: "stream-realtime", updatedAt: "2026-07-01T08:02:00.000Z" }],
    });

    await writeMessengerCatalogCache(
      OWNER,
      {
        streams: [{ uuid: STREAM, updatedAt: "2026-07-01T08:01:00.000Z" }],
      },
      {
        mode: "reconcile",
        reconcileFence,
      },
    );

    const snapshot = await readMessengerCatalogCache(OWNER);

    expect(
      snapshot.streams.map((stream) => stream.uuid).sort((a, b) => a.localeCompare(b)),
    ).toEqual([STREAM, "stream-realtime"]);
  });

  it("keeps newer realtime catalog rows when an older snapshot arrives later", async () => {
    await writeMessengerCatalogCache(OWNER, {
      streams: [
        {
          uuid: STREAM,
          updatedAt: "2026-07-01T08:10:00.000Z",
          lastMessageUuid: "msg-new",
        },
      ],
      topics: [
        {
          uuid: TOPIC,
          streamUuid: STREAM,
          updatedAt: "2026-07-01T08:10:00.000Z",
          lastMessageUuid: "msg-new",
        },
      ],
    });

    await writeMessengerCatalogCache(OWNER, {
      streams: [
        {
          uuid: STREAM,
          updatedAt: "2026-07-01T08:00:00.000Z",
          lastMessageUuid: "msg-old",
        },
      ],
      topics: [
        {
          uuid: TOPIC,
          streamUuid: STREAM,
          updatedAt: "2026-07-01T08:00:00.000Z",
          lastMessageUuid: "msg-old",
        },
      ],
    });

    const snapshot = await readMessengerCatalogCache(OWNER);

    expect(snapshot.streams[0]).toMatchObject({ uuid: STREAM, lastMessageUuid: "msg-new" });
    expect(snapshot.topics[0]).toMatchObject({ uuid: TOPIC, lastMessageUuid: "msg-new" });
  });

  it("stores conversation pages sorted by createdAt plus uuid and deduplicates buckets", async () => {
    await writeConversationMessagePage(OWNER, TOPIC_CONVERSATION, {
      messages: [
        message("msg-c", "2026-07-01T08:02:00.000Z"),
        message("msg-a", "2026-07-01T08:01:00.000Z"),
        message("msg-b", "2026-07-01T08:01:00.000Z"),
      ],
      nextPageMarker: "marker-1",
      hasMore: true,
    });
    await writeConversationMessagePage(OWNER, TOPIC_CONVERSATION, {
      messages: [
        message("msg-c", "2026-07-01T08:02:00.000Z"),
        message("msg-a", "2026-07-01T08:01:00.000Z"),
        message("msg-b", "2026-07-01T08:01:00.000Z"),
      ],
      nextPageMarker: "marker-1",
      hasMore: true,
    });

    const topicWindow = await readConversationMessageWindow(OWNER, TOPIC_CONVERSATION);
    const streamWindow = await readConversationMessageWindow(OWNER, STREAM_CONVERSATION);

    expect(topicWindow.messages.map((item) => item.uuid)).toEqual(["msg-a", "msg-b", "msg-c"]);
    expect(streamWindow.messages.map((item) => item.uuid)).toEqual(["msg-a", "msg-b", "msg-c"]);
    expect(topicWindow.window?.nextPageMarker).toBe("marker-1");
    expect(topicWindow.window?.hasMore).toBe(true);
    expect(topicWindow.window?.windowSize).toBe(3);
    expect(workspaceMessengerMessageOrderKey(message("msg-b", "2026-07-01T08:01:00.000Z"))).toBe(
      "2026-07-01T08:01:00.000Z|msg-b",
    );
  });

  it("patches cached messages and recalculates bucket order when createdAt changes", async () => {
    await writeConversationMessagePage(OWNER, TOPIC_CONVERSATION, {
      messages: [
        message("msg-a", "2026-07-01T08:01:00.000Z"),
        message("msg-b", "2026-07-01T08:02:00.000Z"),
      ],
    });

    await patchCachedMessage(OWNER, message("msg-b", "2026-07-01T08:00:00.000Z"));

    const topicWindow = await readConversationMessageWindow(OWNER, TOPIC_CONVERSATION);
    expect(topicWindow.messages.map((item) => item.uuid)).toEqual(["msg-b", "msg-a"]);
  });

  it("deletes message bodies only after every bucket reference is removed", async () => {
    await writeConversationMessagePage(OWNER, TOPIC_CONVERSATION, {
      messages: [message("msg-a", "2026-07-01T08:01:00.000Z")],
    });
    await upsertOwnMessageReaction(OWNER, ownReaction("msg-a", "thumbs_up", "reaction-a"));

    await deleteCachedMessage(OWNER, "msg-a", [TOPIC_CONVERSATION]);

    const topicWindowAfterDelete = await readConversationMessageWindow(OWNER, TOPIC_CONVERSATION);
    const streamWindowAfterTopicDelete = await readConversationMessageWindow(
      OWNER,
      STREAM_CONVERSATION,
    );
    expect(topicWindowAfterDelete.messages).toEqual([]);
    expect(streamWindowAfterTopicDelete.messages).toEqual([
      message("msg-a", "2026-07-01T08:01:00.000Z"),
    ]);
    expect(
      (await readOwnMessageReactions(OWNER, ["msg-a"])).map((row) => row.reactionUuid),
    ).toEqual(["reaction-a"]);

    await deleteCachedMessage(OWNER, "msg-a", [STREAM_CONVERSATION]);

    const streamWindowAfterDelete = await readConversationMessageWindow(OWNER, STREAM_CONVERSATION);
    expect(streamWindowAfterDelete.messages).toEqual([]);
    expect(await readOwnMessageReactions(OWNER, ["msg-a"])).toEqual([]);
  });

  it("deletes cached topic buckets and windows without requiring messages in memory", async () => {
    await writeConversationMessagePage(OWNER, TOPIC_CONVERSATION, {
      messages: [
        message("msg-a", "2026-07-01T08:01:00.000Z"),
        message("msg-b", "2026-07-01T08:02:00.000Z"),
      ],
    });
    await writeConversationMessagePage(OWNER, `topic:${STREAM}:topic-b`, {
      messages: [
        {
          ...message("msg-c", "2026-07-01T08:03:00.000Z"),
          conversationId: `topic:${STREAM}:topic-b`,
          topicUuid: "topic-b",
        },
      ],
    });
    await upsertOwnMessageReaction(OWNER, ownReaction("msg-a", "thumbs_up", "reaction-a"));
    await upsertOwnMessageReaction(OWNER, ownReaction("msg-b", "eyes", "reaction-b"));
    await upsertOwnMessageReaction(OWNER, ownReaction("msg-c", "heart", "reaction-c"));

    await deleteCachedTopicMessageBuckets(OWNER, STREAM, TOPIC);

    const topicWindow = await readConversationMessageWindow(OWNER, TOPIC_CONVERSATION);
    const streamWindow = await readConversationMessageWindow(OWNER, STREAM_CONVERSATION);
    const otherTopicWindow = await readConversationMessageWindow(OWNER, `topic:${STREAM}:topic-b`);

    expect(topicWindow.messages).toEqual([]);
    expect(streamWindow.messages.map((item) => item.uuid)).toEqual(["msg-c"]);
    expect(otherTopicWindow.messages.map((item) => item.uuid)).toEqual(["msg-c"]);
    expect(await readOwnMessageReactions(OWNER, ["msg-a", "msg-b"])).toEqual([]);
    expect(
      (await readOwnMessageReactions(OWNER, ["msg-c"])).map((row) => row.reactionUuid),
    ).toEqual(["reaction-c"]);
  });

  it("deletes cached stream buckets, windows, and message bodies", async () => {
    await writeConversationMessagePage(OWNER, TOPIC_CONVERSATION, {
      messages: [message("msg-a", "2026-07-01T08:01:00.000Z")],
    });
    await writeConversationMessagePage(OWNER, "topic:stream-b:topic-b", {
      messages: [
        {
          ...message("msg-b", "2026-07-01T08:02:00.000Z"),
          conversationId: "topic:stream-b:topic-b",
          streamUuid: "stream-b",
          topicUuid: "topic-b",
        },
      ],
    });
    await upsertOwnMessageReaction(OWNER, ownReaction("msg-a", "thumbs_up", "reaction-a"));
    await upsertOwnMessageReaction(OWNER, ownReaction("msg-b", "eyes", "reaction-b"));

    await deleteCachedStreamMessageBuckets(OWNER, STREAM);

    const streamWindow = await readConversationMessageWindow(OWNER, STREAM_CONVERSATION);
    const topicWindow = await readConversationMessageWindow(OWNER, TOPIC_CONVERSATION);
    const otherWindow = await readConversationMessageWindow(OWNER, "stream:stream-b");

    expect(streamWindow.messages).toEqual([]);
    expect(topicWindow.messages).toEqual([]);
    expect(otherWindow.messages.map((item) => item.uuid)).toEqual(["msg-b"]);
    expect(await readOwnMessageReactions(OWNER, ["msg-a"])).toEqual([]);
    expect(
      (await readOwnMessageReactions(OWNER, ["msg-b"])).map((row) => row.reactionUuid),
    ).toEqual(["reaction-b"]);
  });

  it("deletes cached topic and stream windows even when they have no buckets", async () => {
    await writeMessengerCatalogCache(OWNER, {
      topics: [{ uuid: TOPIC, streamUuid: STREAM, updatedAt: "2026-07-01T08:00:00.000Z" }],
    });
    await writeConversationMessagePage(OWNER, TOPIC_CONVERSATION, { messages: [] });
    await writeConversationMessagePage(OWNER, STREAM_CONVERSATION, { messages: [] });

    await deleteCachedTopicMessageBuckets(OWNER, STREAM, TOPIC);

    const topicWindowAfterDelete = await readConversationMessageWindow(OWNER, TOPIC_CONVERSATION);
    expect(topicWindowAfterDelete.window).toBeNull();

    await deleteCachedStreamMessageBuckets(OWNER, STREAM);

    const streamWindowAfterDelete = await readConversationMessageWindow(OWNER, STREAM_CONVERSATION);
    expect(streamWindowAfterDelete.window).toBeNull();
  });

  it("stores search results separately and drops expired rows", async () => {
    await writeMessengerSearchResults(OWNER, {
      queryHash: "hash-a",
      query: "hello",
      filters: { streamUuid: STREAM },
      resultMessageUuids: ["msg-a"],
      createdAt: 10,
      expiresAt: 100,
    });
    await writeMessengerSearchResults(OWNER, {
      queryHash: "hash-b",
      query: "old",
      filters: null,
      resultMessageUuids: ["msg-b"],
      createdAt: 1,
      expiresAt: 5,
    });

    expect(await readMessengerSearchResults(OWNER, "hash-a", 50)).toMatchObject({
      queryHash: "hash-a",
      resultMessageUuids: ["msg-a"],
    });
    expect(await readMessengerSearchResults(OWNER, "hash-b", 50)).toBeNull();

    await deleteExpiredMessengerSearchResults(OWNER, 50);

    expect(await readMessengerSearchResults(OWNER, "hash-a", 50)).not.toBeNull();
    expect(await readMessengerSearchResults(OWNER, "hash-b", 0)).toBeNull();
  });

  it("replaces own reactions only for the requested message", async () => {
    await upsertOwnMessageReaction(OWNER, ownReaction("msg-a", "thumbs_up", "reaction-a"));
    await upsertOwnMessageReaction(OWNER, ownReaction("msg-a", "eyes", "reaction-b"));
    await upsertOwnMessageReaction(OWNER, ownReaction("msg-b", "heart", "reaction-c"));

    await replaceOwnMessageReactionsForMessage(OWNER, "msg-a", [
      ownReaction("msg-a", "joy", "reaction-d"),
    ]);

    expect(
      (await readOwnMessageReactions(OWNER, ["msg-a"])).map((row) => [
        row.messageUuid,
        row.emojiName,
        row.reactionUuid,
      ]),
    ).toEqual([["msg-a", "joy", "reaction-d"]]);
    expect(
      (await readOwnMessageReactions(OWNER, ["msg-b"])).map((row) => [
        row.messageUuid,
        row.emojiName,
        row.reactionUuid,
      ]),
    ).toEqual([["msg-b", "heart", "reaction-c"]]);
  });

  it("replaces own reactions only for the requested owner", async () => {
    await upsertOwnMessageReaction(OWNER, ownReaction("msg-a", "thumbs_up", "reaction-a"));
    await upsertOwnMessageReaction(OWNER, ownReaction("msg-b", "eyes", "reaction-b"));
    await upsertOwnMessageReaction(
      OTHER_OWNER,
      ownReaction("msg-a", "thumbs_up", "reaction-other"),
    );

    await replaceOwnMessageReactionsForOwner(OWNER, [
      ownReaction("msg-c", "heart", "reaction-c"),
      ownReaction("msg-d", "joy", "reaction-d"),
    ]);

    expect(
      (await readOwnMessageReactions(OWNER, ["msg-a", "msg-b", "msg-c", "msg-d"])).map((row) => [
        row.messageUuid,
        row.emojiName,
        row.reactionUuid,
      ]),
    ).toEqual([
      ["msg-c", "heart", "reaction-c"],
      ["msg-d", "joy", "reaction-d"],
    ]);
    expect(
      (await readOwnMessageReactions(OTHER_OWNER, ["msg-a"])).map((row) => [
        row.messageUuid,
        row.emojiName,
        row.reactionUuid,
      ]),
    ).toEqual([["msg-a", "thumbs_up", "reaction-other"]]);
  });

  it("reads, upserts, and deletes one own reaction by message and emoji", async () => {
    await upsertOwnMessageReaction(OWNER, ownReaction("msg-a", "thumbs_up", "reaction-a"));
    await upsertOwnMessageReaction(OWNER, ownReaction("msg-a", "thumbs_up", "reaction-b"));

    expect(await readOwnMessageReaction(OWNER, "msg-a", "thumbs_up")).toMatchObject({
      messageUuid: "msg-a",
      emojiName: "thumbs_up",
      reactionUuid: "reaction-b",
      ownerKey: OWNER,
    });

    await deleteOwnMessageReaction(OWNER, "msg-a", "thumbs_up");

    expect(await readOwnMessageReaction(OWNER, "msg-a", "thumbs_up")).toBeNull();
  });

  it("deletes own reactions for only the requested messages", async () => {
    await upsertOwnMessageReaction(OWNER, ownReaction("msg-a", "thumbs_up", "reaction-a"));
    await upsertOwnMessageReaction(OWNER, ownReaction("msg-b", "eyes", "reaction-b"));
    await upsertOwnMessageReaction(OWNER, ownReaction("msg-c", "heart", "reaction-c"));

    await deleteOwnMessageReactionsForMessage(OWNER, "msg-a");
    await deleteOwnMessageReactionsForMessages(OWNER, ["msg-b"]);

    expect(
      (await readOwnMessageReactions(OWNER, ["msg-a"])).map((row) => row.reactionUuid),
    ).toEqual([]);
    expect(
      (await readOwnMessageReactions(OWNER, ["msg-b"])).map((row) => row.reactionUuid),
    ).toEqual([]);
    expect(
      (await readOwnMessageReactions(OWNER, ["msg-c"])).map((row) => row.reactionUuid),
    ).toEqual(["reaction-c"]);
  });

  it("deletes one owner cache without touching another owner", async () => {
    await writeMessengerCatalogCache(OWNER, {
      streams: [{ uuid: STREAM, updatedAt: "2026-07-01T08:00:00.000Z" }],
    });
    await writeMessengerCatalogCache(OTHER_OWNER, {
      streams: [{ uuid: "stream-b", updatedAt: "2026-07-01T08:00:00.000Z" }],
    });
    await writeConversationMessagePage(OWNER, TOPIC_CONVERSATION, {
      messages: [message("msg-a", "2026-07-01T08:01:00.000Z")],
    });
    await writeRealtimeCursor(OWNER, 10);
    await writeRealtimeCursor(OTHER_OWNER, 20);
    await upsertOwnMessageReaction(OWNER, ownReaction("msg-a", "thumbs_up", "reaction-a"));
    await upsertOwnMessageReaction(
      OTHER_OWNER,
      ownReaction("msg-a", "thumbs_up", "reaction-other"),
    );

    await deleteWorkspaceMessengerOwnerCache(OWNER);

    const ownerCatalog = await readMessengerCatalogCache(OWNER);
    const ownerWindow = await readConversationMessageWindow(OWNER, TOPIC_CONVERSATION);
    const otherOwnerCatalog = await readMessengerCatalogCache(OTHER_OWNER);

    expect(ownerCatalog.streams).toEqual([]);
    expect(ownerWindow.messages).toEqual([]);
    expect(ownerCatalog.realtimeCursor).toBeNull();
    expect(await readOwnMessageReactions(OWNER, ["msg-a"])).toEqual([]);
    expect(
      (await readOwnMessageReactions(OTHER_OWNER, ["msg-a"])).map((row) => row.reactionUuid),
    ).toEqual(["reaction-other"]);
    expect(otherOwnerCatalog.streams).toEqual([
      { uuid: "stream-b", updatedAt: "2026-07-01T08:00:00.000Z" },
    ]);
    expect(otherOwnerCatalog.realtimeCursor?.epochVersion).toBe(20);
  });
});
