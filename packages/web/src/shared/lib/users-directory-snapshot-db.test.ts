import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { openMessageCacheDb, resetMessageCacheDbSingletonForTests } from "~/shared/lib/message-cache-db";
import {
  deleteUsersDirectoryRow,
  loadUsersDirectoryRow,
  persistUsersDirectoryRow,
} from "~/shared/lib/users-directory-snapshot-db";

const INSTANCE = "inst-users";

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

describe("users-directory-snapshot-db", () => {
  it("persistUsersDirectoryRow then loadUsersDirectoryRow returns same members", async () => {
    await openMessageCacheDb();
    await persistUsersDirectoryRow({
      instanceId: INSTANCE,
      version: 1,
      savedAt: 42,
      members: [{ user_id: 7, full_name: "Ada" }],
    });
    const row = await loadUsersDirectoryRow(INSTANCE);
    expect(row).not.toBeNull();
    expect(row!.version).toBe(1);
    expect(row!.savedAt).toBe(42);
    expect(row!.members).toEqual([{ user_id: 7, full_name: "Ada" }]);
  });

  it("deleteUsersDirectoryRow removes row", async () => {
    await openMessageCacheDb();
    await persistUsersDirectoryRow({
      instanceId: INSTANCE,
      version: 1,
      savedAt: 1,
      members: [{ user_id: 1 }],
    });
    await deleteUsersDirectoryRow(INSTANCE);
    expect(await loadUsersDirectoryRow(INSTANCE)).toBeNull();
  });
});
