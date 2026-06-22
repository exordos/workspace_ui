import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import type { MockMessage } from "~/shared/api/messenger.types";
import {
  applyRetentionForChat,
  deleteMessageCacheDatabase,
  getChatMeta,
  getChatMessageBounds,
  getChatMessagesAscending,
  getInstanceMessagesAscending,
  getStreamMessagesAscending,
  moveTopicMessagesInCache,
  openMessageCacheDb,
  resetMessageCacheDbSingletonForTests,
  upsertChatMessages,
} from "~/shared/lib/message-cache-db";
import { testMessageId, testMessageOrdinal } from "~/test/factories";

const INSTANCE = "inst-a";
const STREAM_UUID_A = "11111111-1111-4111-8111-111111111111";
const STREAM_UUID_B = "22222222-2222-4222-8222-222222222222";
const CHAT = `stream:${STREAM_UUID_A}:general`;

function msg(id: number | string, overrides: Partial<MockMessage> = {}): MockMessage {
  return {
    id: testMessageId(id),
    sender_id: 10,
    sender_full_name: "A",
    stream_uuid: STREAM_UUID_A,
    subject: "general",
    content: `<p>${id}</p>`,
    timestamp: 1000 + testMessageOrdinal(id),
    ...overrides,
  };
}

afterEach(async () => {
  try {
    const db = await openMessageCacheDb();
    db.close();
  } catch {
    // no open DB
  }
  resetMessageCacheDbSingletonForTests();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase("workspace-message-cache-v1");
    req.onerror = () => reject(req.error ?? new Error("indexedDB deleteDatabase error"));
    req.onsuccess = () => resolve();
  });
});

describe("message-cache-db", () => {
  it("upsertChatMessages then getChatMessagesAscending returns sorted mocks", async () => {
    await openMessageCacheDb();
    await upsertChatMessages({
      instanceId: INSTANCE,
      chatKey: CHAT,
      messages: [msg(3), msg(1), msg(2)],
      windowSizeN: 200,
    });
    const rows = await getChatMessagesAscending(INSTANCE, CHAT);
    expect(rows.map((m) => m.id)).toEqual([testMessageId(1), testMessageId(2), testMessageId(3)]);
  });

  it("applyRetentionForChat keeps only last N by message id", async () => {
    await openMessageCacheDb();
    const many: MockMessage[] = [];
    for (let i = 1; i <= 250; i += 1) {
      many.push(msg(i));
    }
    await upsertChatMessages({
      instanceId: INSTANCE,
      chatKey: CHAT,
      messages: many,
      windowSizeN: 200,
    });
    await applyRetentionForChat(INSTANCE, CHAT, 200);
    const rows = await getChatMessagesAscending(INSTANCE, CHAT);
    expect(rows).toHaveLength(200);
    expect(rows[0]!.id).toBe(testMessageId(51));
    expect(rows[199]!.id).toBe(testMessageId(250));
  });

  it("getChatMessageBounds reports oldest and newest", async () => {
    await openMessageCacheDb();
    await upsertChatMessages({
      instanceId: INSTANCE,
      chatKey: CHAT,
      messages: [msg(10), msg(50), msg(30)],
      windowSizeN: 200,
    });
    const b = await getChatMessageBounds(INSTANCE, CHAT);
    expect(b.count).toBe(3);
    expect(b.oldestId).toBe(testMessageId(10));
    expect(b.newestId).toBe(testMessageId(50));
  });

  it("getInstanceMessagesAscending returns all instance rows sorted by message timeline", async () => {
    await openMessageCacheDb();
    await upsertChatMessages({
      instanceId: "inst-a",
      chatKey: `stream:${STREAM_UUID_A}:general`,
      messages: [msg(100), msg(2)],
      windowSizeN: 200,
    });
    await upsertChatMessages({
      instanceId: "inst-a",
      chatKey: "dm:42",
      messages: [msg(11)],
      windowSizeN: 200,
    });
    await upsertChatMessages({
      instanceId: "inst-b",
      chatKey: `stream:${STREAM_UUID_B}:other`,
      messages: [msg(5, { stream_uuid: STREAM_UUID_B })],
      windowSizeN: 200,
    });

    const rows = await getInstanceMessagesAscending("inst-a");
    expect(rows.map((m) => m.id)).toEqual([
      testMessageId(2),
      testMessageId(11),
      testMessageId(100),
    ]);
  });

  it("getStreamMessagesAscending merges all topic partitions for a stream", async () => {
    await openMessageCacheDb();
    await upsertChatMessages({
      instanceId: "inst-a",
      chatKey: `stream:${STREAM_UUID_A}:alpha`,
      messages: [msg(30), msg(10)],
      windowSizeN: 200,
    });
    await upsertChatMessages({
      instanceId: "inst-a",
      chatKey: `stream:${STREAM_UUID_A}:beta`,
      messages: [msg(25)],
      windowSizeN: 200,
    });
    await upsertChatMessages({
      instanceId: "inst-a",
      chatKey: `stream:${STREAM_UUID_B}:other`,
      messages: [msg(15, { stream_uuid: STREAM_UUID_B })],
      windowSizeN: 200,
    });

    const rows = await getStreamMessagesAscending("inst-a", STREAM_UUID_A);
    expect(rows.map((m) => m.id)).toEqual([
      testMessageId(10),
      testMessageId(25),
      testMessageId(30),
    ]);
  });

  it("moveTopicMessagesInCache moves rows from old topic partition to new topic partition", async () => {
    await openMessageCacheDb();
    await upsertChatMessages({
      instanceId: INSTANCE,
      chatKey: `stream:${STREAM_UUID_A}:incident`,
      messages: [msg(1, { subject: "incident" }), msg(2, { subject: "incident" })],
      windowSizeN: 200,
    });

    await moveTopicMessagesInCache({
      instanceId: INSTANCE,
      streamId: STREAM_UUID_A,
      oldTopic: "incident",
      newTopic: "\u2714 incident",
      messageIds: [testMessageId(1), testMessageId(2)],
      anchorMessageId: testMessageId(1),
    });

    const oldRows = await getChatMessagesAscending(INSTANCE, `stream:${STREAM_UUID_A}:incident`);
    const newRows = await getChatMessagesAscending(
      INSTANCE,
      `stream:${STREAM_UUID_A}:\u2714 incident`,
    );
    expect(oldRows).toHaveLength(0);
    expect(newRows.map((row) => row.id)).toEqual([testMessageId(1), testMessageId(2)]);
    expect(newRows.every((row) => row.subject === "\u2714 incident")).toBe(true);
    const oldMeta = await getChatMeta(INSTANCE, `stream:${STREAM_UUID_A}:incident`);
    const newMeta = await getChatMeta(INSTANCE, `stream:${STREAM_UUID_A}:\u2714 incident`);
    expect(oldMeta).toBeNull();
    expect(newMeta?.oldestMessageId).toBe(testMessageId(1));
    expect(newMeta?.newestMessageId).toBe(testMessageId(2));
  });

  it("moveTopicMessagesInCache moves only target ids and keeps old partition remainder", async () => {
    await openMessageCacheDb();
    await upsertChatMessages({
      instanceId: INSTANCE,
      chatKey: `stream:${STREAM_UUID_A}:incident`,
      messages: [msg(10, { subject: "incident" }), msg(30, { subject: "incident" })],
      windowSizeN: 200,
    });
    await upsertChatMessages({
      instanceId: INSTANCE,
      chatKey: `stream:${STREAM_UUID_A}:\u2714 incident`,
      messages: [msg(20, { subject: "\u2714 incident" })],
      windowSizeN: 200,
    });

    await moveTopicMessagesInCache({
      instanceId: INSTANCE,
      streamId: STREAM_UUID_A,
      oldTopic: "incident",
      newTopic: "\u2714 incident",
      messageIds: [testMessageId(10)],
      anchorMessageId: testMessageId(10),
    });

    const oldRows = await getChatMessagesAscending(INSTANCE, `stream:${STREAM_UUID_A}:incident`);
    const newRows = await getChatMessagesAscending(
      INSTANCE,
      `stream:${STREAM_UUID_A}:\u2714 incident`,
    );
    expect(oldRows.map((row) => row.id)).toEqual([testMessageId(30)]);
    expect(newRows.map((row) => row.id)).toEqual([testMessageId(10), testMessageId(20)]);
    expect(newRows.every((row) => row.subject === "\u2714 incident")).toBe(true);
    expect(oldRows.every((row) => row.subject === "incident")).toBe(true);
    const streamWideRows = await getStreamMessagesAscending(INSTANCE, STREAM_UUID_A);
    expect(streamWideRows.map((row) => row.id)).toEqual([
      testMessageId(10),
      testMessageId(20),
      testMessageId(30),
    ]);
  });

  it("deleteMessageCacheDatabase removes persisted chat messages", async () => {
    await upsertChatMessages({
      instanceId: INSTANCE,
      chatKey: CHAT,
      messages: [msg(1)],
      windowSizeN: 200,
    });
    expect(await getChatMessagesAscending(INSTANCE, CHAT)).toHaveLength(1);

    await deleteMessageCacheDatabase();

    expect(await getChatMessagesAscending(INSTANCE, CHAT)).toEqual([]);
  });
});
