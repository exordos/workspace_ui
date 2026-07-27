import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import {
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
  readMessengerMessageBodyCache,
  readMessengerCatalogPayloadCache,
  writeMessengerMessageBodyCache,
  restoreMessengerStreamCache,
  writeMessengerCatalogPayloadCache,
} from "./messenger-cache.lib";
import type {
  MessengerBootstrapPayload,
  MessengerMessage,
  MessengerStream,
  MessengerStreamBinding,
} from "./messenger.types";

const OWNER_KEY = "account:a:org:o:project:p:user:u";
const STREAM_UUID = "11111111-1111-4111-8111-111111111111";
const BINDING_UUID = "22222222-2222-4222-8222-222222222222";
const USER_UUID = "33333333-3333-4333-8333-333333333333";
const TOPIC_UUID = "44444444-4444-4444-8444-444444444444";
const MESSAGE_UUID = "55555555-5555-4555-8555-555555555555";
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

function createStream(): MessengerStream {
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
      ownReactionUuidsByEmojiName: {},
      createdAt: DATE,
      updatedAt: DATE,
    };

    await writeMessengerMessageBodyCache(OWNER_KEY, [message]);

    await expect(readMessengerMessageBodyCache(OWNER_KEY, [MESSAGE_UUID])).resolves.toEqual([
      message,
    ]);
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
