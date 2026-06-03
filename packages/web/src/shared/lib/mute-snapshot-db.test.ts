/**
 * Tests for the mute snapshot IndexedDB layer.
 * Ensures the persist/load/delete contract keyed by instanceId.
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

// Test instance key for verifying row isolation by instanceId.
const INSTANCE = "inst-mute";

// Clears the DB after each test so scenarios do not affect each other.
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
  // Assert persisted snapshot round-trips without losing structure or data.
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

  // Assert delete removes the snapshot row from the object store.
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
