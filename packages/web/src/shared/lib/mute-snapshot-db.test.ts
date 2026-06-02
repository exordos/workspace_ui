/**
 * Тесты IndexedDB-слоя mute snapshot.
 * Зачем нужны: гарантируют корректный контракт persist/load/delete по ключу instanceId.
 */
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import {
  openMessageCacheDb,
  resetMessageCacheDbSingletonForTests,
} from "~/shared/lib/message-cache-db";
import {
  deleteMuteSnapshotRow,
  loadMuteSnapshotRow,
  persistMuteSnapshotRow,
} from "~/shared/lib/mute-snapshot-db";

// Тестовый ключ инстанса для проверки изоляции строк по instanceId.
const INSTANCE = "inst-mute";

// Очищает БД после каждого теста, чтобы сценарии не влияли друг на друга.
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

describe("mute-snapshot-db", () => {
  // Проверяет, что сохраненный snapshot читается обратно без потерь структуры/данных.
  it("persists and loads mute snapshot row by instance id", async () => {
    await openMessageCacheDb();
    await persistMuteSnapshotRow({
      instanceId: INSTANCE,
      version: 1,
      savedAt: 1710000000000,
      mutedStreamIds: [10, 20],
      mutedTopics: [{ streamId: 10, topic: "news" }],
      unmutedTopics: [{ streamId: 20, topic: "important" }],
      followedTopics: [{ streamId: 20, topic: "incidents" }],
    });

    const row = await loadMuteSnapshotRow(INSTANCE);
    expect(row).not.toBeNull();
    expect(row).toEqual({
      instanceId: INSTANCE,
      version: 1,
      savedAt: 1710000000000,
      mutedStreamIds: [10, 20],
      mutedTopics: [{ streamId: 10, topic: "news" }],
      unmutedTopics: [{ streamId: 20, topic: "important" }],
      followedTopics: [{ streamId: 20, topic: "incidents" }],
    });
  });

  // Проверяет, что delete действительно удаляет строку snapshot из objectStore.
  it("deletes snapshot row", async () => {
    await openMessageCacheDb();
    await persistMuteSnapshotRow({
      instanceId: INSTANCE,
      version: 1,
      savedAt: 1,
      mutedStreamIds: [1],
      mutedTopics: [],
      unmutedTopics: [],
      followedTopics: [],
    });

    await deleteMuteSnapshotRow(INSTANCE);
    expect(await loadMuteSnapshotRow(INSTANCE)).toBeNull();
  });
});
