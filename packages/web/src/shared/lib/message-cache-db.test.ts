import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import type { MockMessage } from "~/shared/api/zulip.types";
import {
  applyRetentionForChat,
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

const INSTANCE = "inst-a";
const CHAT = "stream:1:general";

function msg(id: number, overrides: Partial<MockMessage> = {}): MockMessage {
  return {
    id,
    sender_id: 10,
    sender_full_name: "A",
    stream_id: 1,
    subject: "general",
    content: `<p>${id}</p>`,
    timestamp: 1000 + id,
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
    expect(rows.map((m) => m.id)).toEqual([1, 2, 3]);
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
    expect(rows[0]!.id).toBe(51);
    expect(rows[199]!.id).toBe(250);
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
    expect(b.oldestId).toBe(10);
    expect(b.newestId).toBe(50);
  });

  it("getInstanceMessagesAscending returns all instance rows sorted by numeric message id", async () => {
    await openMessageCacheDb();
    await upsertChatMessages({
      instanceId: "inst-a",
      chatKey: "stream:1:general",
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
      chatKey: "stream:9:other",
      messages: [msg(5)],
      windowSizeN: 200,
    });

    const rows = await getInstanceMessagesAscending("inst-a");
    expect(rows.map((m) => m.id)).toEqual([2, 11, 100]);
  });

  it("getStreamMessagesAscending merges all topic partitions for a stream", async () => {
    await openMessageCacheDb();
    await upsertChatMessages({
      instanceId: "inst-a",
      chatKey: "stream:1:alpha",
      messages: [msg(30), msg(10)],
      windowSizeN: 200,
    });
    await upsertChatMessages({
      instanceId: "inst-a",
      chatKey: "stream:1:beta",
      messages: [msg(25)],
      windowSizeN: 200,
    });
    await upsertChatMessages({
      instanceId: "inst-a",
      chatKey: "stream:2:other",
      messages: [msg(15)],
      windowSizeN: 200,
    });

    const rows = await getStreamMessagesAscending("inst-a", 1);
    expect(rows.map((m) => m.id)).toEqual([10, 25, 30]);
  });

  it("moveTopicMessagesInCache moves rows from old topic partition to new topic partition", async () => {
    await openMessageCacheDb();
    await upsertChatMessages({
      instanceId: INSTANCE,
      chatKey: "stream:1:incident",
      messages: [msg(1, { subject: "incident" }), msg(2, { subject: "incident" })],
      windowSizeN: 200,
    });

    await moveTopicMessagesInCache({
      instanceId: INSTANCE,
      streamId: 1,
      oldTopic: "incident",
      newTopic: "\u2714 incident",
      messageIds: [1, 2],
      anchorMessageId: 1,
    });

    const oldRows = await getChatMessagesAscending(INSTANCE, "stream:1:incident");
    const newRows = await getChatMessagesAscending(INSTANCE, "stream:1:\u2714 incident");
    expect(oldRows).toHaveLength(0);
    expect(newRows.map((row) => row.id)).toEqual([1, 2]);
    expect(newRows.every((row) => row.subject === "\u2714 incident")).toBe(true);
    const oldMeta = await getChatMeta(INSTANCE, "stream:1:incident");
    const newMeta = await getChatMeta(INSTANCE, "stream:1:\u2714 incident");
    expect(oldMeta).toBeNull();
    expect(newMeta?.oldestMessageId).toBe(1);
    expect(newMeta?.newestMessageId).toBe(2);
  });

  it("moveTopicMessagesInCache moves only target ids and keeps old partition remainder", async () => {
    await openMessageCacheDb();
    await upsertChatMessages({
      instanceId: INSTANCE,
      chatKey: "stream:1:incident",
      messages: [msg(10, { subject: "incident" }), msg(30, { subject: "incident" })],
      windowSizeN: 200,
    });
    await upsertChatMessages({
      instanceId: INSTANCE,
      chatKey: "stream:1:\u2714 incident",
      messages: [msg(20, { subject: "\u2714 incident" })],
      windowSizeN: 200,
    });

    await moveTopicMessagesInCache({
      instanceId: INSTANCE,
      streamId: 1,
      oldTopic: "incident",
      newTopic: "\u2714 incident",
      messageIds: [10],
      anchorMessageId: 10,
    });

    const oldRows = await getChatMessagesAscending(INSTANCE, "stream:1:incident");
    const newRows = await getChatMessagesAscending(INSTANCE, "stream:1:\u2714 incident");
    expect(oldRows.map((row) => row.id)).toEqual([30]);
    expect(newRows.map((row) => row.id)).toEqual([10, 20]);
    expect(newRows.every((row) => row.subject === "\u2714 incident")).toBe(true);
    expect(oldRows.every((row) => row.subject === "incident")).toBe(true);
    const streamWideRows = await getStreamMessagesAscending(INSTANCE, 1);
    expect(streamWideRows.map((row) => row.id)).toEqual([10, 20, 30]);
  });
});
