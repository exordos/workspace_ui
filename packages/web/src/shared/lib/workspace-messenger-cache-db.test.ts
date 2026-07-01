import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import {
  deleteCachedMessage,
  deleteExpiredMessengerSearchResults,
  deleteWorkspaceMessengerCacheDatabase,
  deleteWorkspaceMessengerOwnerCache,
  openWorkspaceMessengerCacheDb,
  patchCachedMessage,
  readConversationMessageWindow,
  readMessengerCatalogCache,
  readMessengerSearchResults,
  resetWorkspaceMessengerCacheDbSingletonForTests,
  WORKSPACE_MESSENGER_CACHE_DB_NAME,
  WORKSPACE_MESSENGER_CACHE_DB_VERSION,
  workspaceMessengerMessageOrderKey,
  writeConversationMessagePage,
  writeMessengerCatalogCache,
  writeMessengerSearchResults,
  writeRealtimeCursor,
} from "./workspace-messenger-cache-db";

const OWNER = "account:a:org:o:project:p:user:u";
const OTHER_OWNER = "account:b:org:o:project:p:user:u";
const STREAM = "stream-a";
const TOPIC = "topic-a";
const STREAM_CONVERSATION = `stream:${STREAM}`;
const TOPIC_CONVERSATION = `topic:${STREAM}:${TOPIC}`;

function message(uuid: string, createdAt: string) {
  return {
    uuid,
    conversationId: TOPIC_CONVERSATION,
    streamUuid: STREAM,
    topicUuid: TOPIC,
    createdAt,
    updatedAt: createdAt,
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

describe("workspace-messenger-cache-db", () => {
  it("opens a new Workspace cache database with the current schema", async () => {
    const db = await openWorkspaceMessengerCacheDb();

    expect(db.name).toBe(WORKSPACE_MESSENGER_CACHE_DB_NAME);
    expect(db.version).toBe(WORKSPACE_MESSENGER_CACHE_DB_VERSION);
    expect([...db.objectStoreNames]).toEqual([
      "conversations",
      "folderItems",
      "folders",
      "messageBuckets",
      "messageWindows",
      "messages",
      "ownerMeta",
      "realtimeCursor",
      "searchResults",
      "streams",
      "topics",
      "users",
    ]);
  });

  it("writes and reads catalog snapshots without leaking between owners", async () => {
    await writeMessengerCatalogCache(OWNER, {
      streams: [{ uuid: STREAM, updatedAt: "2026-07-01T08:00:00.000Z" }],
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
      lastHydratedAt: 42,
    });
    await writeRealtimeCursor(OWNER, 77);

    const snapshot = await readMessengerCatalogCache(OWNER);
    const otherSnapshot = await readMessengerCatalogCache(OTHER_OWNER);

    expect(snapshot.ownerMeta?.lastHydratedAt).toBe(42);
    expect(snapshot.streams.map((stream) => stream.uuid)).toEqual([STREAM]);
    expect(snapshot.topics.map((topic) => topic.uuid)).toEqual([TOPIC]);
    expect(snapshot.conversations.map((conversation) => conversation.id)).toEqual([
      TOPIC_CONVERSATION,
    ]);
    expect(snapshot.folders.map((folder) => folder.uuid)).toEqual(["folder-a"]);
    expect(snapshot.folderItems.map((item) => item.uuid)).toEqual(["folder-item-a"]);
    expect(snapshot.users.map((user) => user.uuid)).toEqual(["user-a"]);
    expect(snapshot.realtimeCursor?.epochVersion).toBe(77);
    expect(otherSnapshot.streams).toEqual([]);
    expect(otherSnapshot.realtimeCursor).toBeNull();
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

    await deleteCachedMessage(OWNER, "msg-a", [STREAM_CONVERSATION]);

    const streamWindowAfterDelete = await readConversationMessageWindow(OWNER, STREAM_CONVERSATION);
    expect(streamWindowAfterDelete.messages).toEqual([]);
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

    await deleteWorkspaceMessengerOwnerCache(OWNER);

    const ownerCatalog = await readMessengerCatalogCache(OWNER);
    const ownerWindow = await readConversationMessageWindow(OWNER, TOPIC_CONVERSATION);
    const otherOwnerCatalog = await readMessengerCatalogCache(OTHER_OWNER);

    expect(ownerCatalog.streams).toEqual([]);
    expect(ownerWindow.messages).toEqual([]);
    expect(ownerCatalog.realtimeCursor).toBeNull();
    expect(otherOwnerCatalog.streams).toEqual([
      { uuid: "stream-b", updatedAt: "2026-07-01T08:00:00.000Z" },
    ]);
    expect(otherOwnerCatalog.realtimeCursor?.epochVersion).toBe(20);
  });
});
