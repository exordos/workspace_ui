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
  readMessengerCatalogPayloadCache,
  writeMessengerCatalogPayloadCache,
} from "./messenger-cache.lib";
import type {
  MessengerBootstrapPayload,
  MessengerStream,
  MessengerStreamBinding,
} from "./messenger.types";

const OWNER_KEY = "account:a:org:o:project:p:user:u";
const STREAM_UUID = "11111111-1111-4111-8111-111111111111";
const BINDING_UUID = "22222222-2222-4222-8222-222222222222";
const USER_UUID = "33333333-3333-4333-8333-333333333333";
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
});
