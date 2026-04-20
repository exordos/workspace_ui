import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { openMessageCacheDb, resetMessageCacheDbSingletonForTests } from "~/shared/lib/message-cache-db";
import {
  deleteUserStatusCacheRow,
  getUserStatusCacheRow,
  putUserStatusCacheRow,
} from "~/shared/lib/user-status-cache-db";

const INSTANCE = "inst-status";

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
        req.error instanceof Error ? req.error : new Error(String(req.error ?? "deleteDatabase failed")),
      );
    req.onsuccess = () => resolve();
  });
});

describe("user-status-cache-db", () => {
  it("putUserStatusCacheRow then getUserStatusCacheRow returns the row", async () => {
    await openMessageCacheDb();
    await putUserStatusCacheRow({
      instanceId: INSTANCE,
      userId: 42,
      status: { text: "In a meeting", away: true, emojiName: "calendar" },
      fetchedAt: 1_700_000_000_000,
    });
    const row = await getUserStatusCacheRow(INSTANCE, 42);
    expect(row).not.toBeNull();
    expect(row?.userId).toBe(42);
    expect(row?.instanceId).toBe(INSTANCE);
    expect(row?.status?.text).toBe("In a meeting");
    expect(row?.status?.away).toBe(true);
    expect(row?.fetchedAt).toBe(1_700_000_000_000);
  });

  it("stores null status", async () => {
    await openMessageCacheDb();
    await putUserStatusCacheRow({
      instanceId: INSTANCE,
      userId: 43,
      status: null,
      fetchedAt: 99,
    });
    const row = await getUserStatusCacheRow(INSTANCE, 43);
    expect(row?.status).toBeNull();
  });

  it("deleteUserStatusCacheRow removes the row", async () => {
    await openMessageCacheDb();
    await putUserStatusCacheRow({
      instanceId: INSTANCE,
      userId: 44,
      status: { text: "x", away: false },
      fetchedAt: 1,
    });
    await deleteUserStatusCacheRow(INSTANCE, 44);
    const row = await getUserStatusCacheRow(INSTANCE, 44);
    expect(row).toBeNull();
  });
});
