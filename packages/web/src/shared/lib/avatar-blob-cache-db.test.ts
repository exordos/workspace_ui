import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import {
  clearAllAvatarBlobCacheForTests,
  clearAvatarBlobCacheForInstance,
  getAvatarBlobCacheRow,
  putAvatarBlobCacheRow,
  touchAvatarBlobCacheRow,
} from "~/shared/lib/avatar-blob-cache-db";
import {
  openMessageCacheDb,
  resetMessageCacheDbSingletonForTests,
} from "~/shared/lib/message-cache-db";

const INSTANCE = "inst-avatar-cache";

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

function pngBlob(bytes: number): Blob {
  return new Blob([new Uint8Array(bytes)], { type: "image/png" });
}

describe("avatar-blob-cache-db", () => {
  it("putAvatarBlobCacheRow then getAvatarBlobCacheRow returns the row", async () => {
    await openMessageCacheDb();
    const blob = pngBlob(64);
    await putAvatarBlobCacheRow({
      instanceId: INSTANCE,
      cacheKey: "/avatar/1.png",
      blob,
      mimeType: "image/png",
      byteSize: blob.size,
      fetchedAt: 1000,
      lastAccessedAt: 1000,
      avatarVersion: 1,
    });
    const row = await getAvatarBlobCacheRow(INSTANCE, "/avatar/1.png");
    expect(row).not.toBeNull();
    expect(row?.byteSize).toBe(64);
    expect(row?.avatarVersion).toBe(1);
    expect(row?.cacheKey).toBe("/avatar/1.png");
  });

  it("touchAvatarBlobCacheRow updates lastAccessedAt", async () => {
    await openMessageCacheDb();
    const blob = pngBlob(8);
    await putAvatarBlobCacheRow({
      instanceId: INSTANCE,
      cacheKey: "/avatar/2.png",
      blob,
      mimeType: "image/png",
      byteSize: blob.size,
      fetchedAt: 1,
      lastAccessedAt: 1,
      avatarVersion: 1,
    });
    await touchAvatarBlobCacheRow(INSTANCE, "/avatar/2.png", 9999);
    const row = await getAvatarBlobCacheRow(INSTANCE, "/avatar/2.png");
    expect(row?.lastAccessedAt).toBe(9999);
  });

  it("clearAvatarBlobCacheForInstance removes rows for that instance only", async () => {
    await openMessageCacheDb();
    const blob = pngBlob(4);
    await putAvatarBlobCacheRow({
      instanceId: INSTANCE,
      cacheKey: "/avatar/a.png",
      blob,
      mimeType: "image/png",
      byteSize: blob.size,
      fetchedAt: 1,
      lastAccessedAt: 1,
      avatarVersion: 1,
    });
    await putAvatarBlobCacheRow({
      instanceId: "other",
      cacheKey: "/avatar/b.png",
      blob,
      mimeType: "image/png",
      byteSize: blob.size,
      fetchedAt: 1,
      lastAccessedAt: 1,
      avatarVersion: 1,
    });
    await clearAvatarBlobCacheForInstance(INSTANCE);
    expect(await getAvatarBlobCacheRow(INSTANCE, "/avatar/a.png")).toBeNull();
    expect(await getAvatarBlobCacheRow("other", "/avatar/b.png")).not.toBeNull();
    await clearAllAvatarBlobCacheForTests();
  });
});
