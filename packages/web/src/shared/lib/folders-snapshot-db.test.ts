import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import {
  deleteFoldersSnapshotRow,
  loadFoldersSnapshotRow,
  persistFoldersSnapshotRow,
} from "~/shared/lib/folders-snapshot-db";
import {
  openMessageCacheDb,
  resetMessageCacheDbSingletonForTests,
} from "~/shared/lib/message-cache-db";

const INSTANCE = "inst-folders-test";

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
    req.onerror = () =>
      reject(
        req.error instanceof Error
          ? req.error
          : new Error(String(req.error ?? "deleteDatabase failed")),
      );
    req.onsuccess = () => resolve();
  });
});

describe("folders-snapshot-db", () => {
  it("persist then load returns folders", async () => {
    await openMessageCacheDb();
    const folders = [
      { id: "f1", label: "One", backgroundColor: 1, systemType: "created" as const },
    ];
    await persistFoldersSnapshotRow({ instanceId: INSTANCE, folders, version: 1 });
    const row = await loadFoldersSnapshotRow(INSTANCE);
    expect(row?.folders).toEqual(folders);
  });

  it("persists complete folder item snapshots for cache-only bootstrap", async () => {
    await openMessageCacheDb();
    const folderItemsEntries = [
      [
        "f1",
        [
          {
            uuid: "item-1",
            chatId: "stream:stream-1:general",
            folderUuid: "f1",
            orderIndex: 0,
            pinnedAt: null,
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-01T00:00:00Z",
          },
        ],
      ],
    ] as const;
    await persistFoldersSnapshotRow({
      instanceId: INSTANCE,
      folders: [{ id: "f1", label: "One", backgroundColor: 1, systemType: "created" }],
      folderItemsEntries: folderItemsEntries.map(([folderId, items]) => [folderId, [...items]]),
      version: 2,
    });

    const row = await loadFoldersSnapshotRow(INSTANCE);
    expect(row?.version).toBe(2);
    expect(row?.folderItemsEntries).toEqual(folderItemsEntries);
  });

  it("delete removes row", async () => {
    await openMessageCacheDb();
    await persistFoldersSnapshotRow({
      instanceId: INSTANCE,
      folders: [{ id: "x", label: "X", backgroundColor: 2 }],
      version: 1,
    });
    await deleteFoldersSnapshotRow(INSTANCE);
    expect(await loadFoldersSnapshotRow(INSTANCE)).toBeNull();
  });
});
