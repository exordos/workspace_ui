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

const INSTANCE = "inst-mute";

const EMPTY_STREAM_NOTIFICATION_FIELDS = {
  streamDesktopNotifyEnabledIds: [] as number[],
  streamDesktopNotifyDisabledIds: [] as number[],
  streamAudibleNotifyEnabledIds: [] as number[],
  streamAudibleNotifyDisabledIds: [] as number[],
};

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
  it("persists and loads mute snapshot row by instance id", async () => {
    await openMessageCacheDb();
    await persistMuteSnapshotRow({
      instanceId: INSTANCE,
      version: 2,
      savedAt: 1710000000000,
      mutedStreamIds: [10, 20],
      mutedTopics: [{ streamId: 10, topic: "news" }],
      unmutedTopics: [{ streamId: 20, topic: "important" }],
      followedTopics: [{ streamId: 20, topic: "incidents" }],
      streamDesktopNotifyEnabledIds: [30],
      streamDesktopNotifyDisabledIds: [],
      streamAudibleNotifyEnabledIds: [30],
      streamAudibleNotifyDisabledIds: [],
    });

    const row = await loadMuteSnapshotRow(INSTANCE);
    expect(row).not.toBeNull();
    expect(row).toEqual({
      instanceId: INSTANCE,
      version: 2,
      savedAt: 1710000000000,
      mutedStreamIds: [10, 20],
      mutedTopics: [{ streamId: 10, topic: "news" }],
      unmutedTopics: [{ streamId: 20, topic: "important" }],
      followedTopics: [{ streamId: 20, topic: "incidents" }],
      streamDesktopNotifyEnabledIds: [30],
      streamDesktopNotifyDisabledIds: [],
      streamAudibleNotifyEnabledIds: [30],
      streamAudibleNotifyDisabledIds: [],
    });
  });

  it("upgrades v1 rows on load with empty stream notification overrides", async () => {
    await openMessageCacheDb();
    const db = await openMessageCacheDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("muteSnapshot", "readwrite");
      tx.onerror = () => reject(tx.error ?? new Error("indexedDB transaction error"));
      tx.oncomplete = () => resolve();
      tx.objectStore("muteSnapshot").put({
        instanceId: INSTANCE,
        version: 1,
        savedAt: 1,
        mutedStreamIds: [1],
        mutedTopics: [],
        unmutedTopics: [],
        followedTopics: [],
      });
    });

    const row = await loadMuteSnapshotRow(INSTANCE);
    expect(row).toEqual({
      instanceId: INSTANCE,
      version: 2,
      savedAt: 1,
      mutedStreamIds: [1],
      mutedTopics: [],
      unmutedTopics: [],
      followedTopics: [],
      ...EMPTY_STREAM_NOTIFICATION_FIELDS,
    });
  });

  it("deletes snapshot row", async () => {
    await openMessageCacheDb();
    await persistMuteSnapshotRow({
      instanceId: INSTANCE,
      version: 2,
      savedAt: 1,
      mutedStreamIds: [1],
      mutedTopics: [],
      unmutedTopics: [],
      followedTopics: [],
      ...EMPTY_STREAM_NOTIFICATION_FIELDS,
    });

    await deleteMuteSnapshotRow(INSTANCE);
    expect(await loadMuteSnapshotRow(INSTANCE)).toBeNull();
  });
});
