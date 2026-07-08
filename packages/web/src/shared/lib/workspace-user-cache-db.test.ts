import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import {
  deleteWorkspaceUserCacheDatabase,
  deleteWorkspaceUserOwnerCache,
  openWorkspaceUserCacheDb,
  readWorkspaceUserCache,
  readWorkspaceUserCacheProfile,
  replaceWorkspaceUserCache,
  resetWorkspaceUserCacheDbSingletonForTests,
  upsertWorkspaceUserCache,
  WORKSPACE_USER_CACHE_DB_NAME,
  WORKSPACE_USER_CACHE_DB_VERSION,
} from "./workspace-user-cache-db";
import type { WorkspaceUserCacheProfile } from "./workspace-user-cache-db";

const OWNER_A = "account:a:instance:i-a:organization:o:project:p:user:u-a";
const OWNER_B = "account:b:instance:i-b:organization:o:project:p:user:u-b";

function cachedUser(
  uuid: string,
  overrides: Partial<WorkspaceUserCacheProfile> = {},
): WorkspaceUserCacheProfile {
  return {
    uuid,
    username: uuid,
    displayName: uuid,
    firstName: null,
    lastName: null,
    email: null,
    avatarUrl: null,
    createdAt: "2026-07-01T10:00:00.000Z",
    updatedAt: "2026-07-01T10:00:00.000Z",
    ...overrides,
  };
}

afterEach(async () => {
  try {
    const db = await openWorkspaceUserCacheDb();
    db.close();
  } catch {
    // no open DB
  }
  resetWorkspaceUserCacheDbSingletonForTests();
  await deleteWorkspaceUserCacheDatabase();
});

describe("workspace-user-cache-db", () => {
  it("opens a separate Workspace user cache database", async () => {
    const db = await openWorkspaceUserCacheDb();

    expect(db.name).toBe(WORKSPACE_USER_CACHE_DB_NAME);
    expect(db.version).toBe(WORKSPACE_USER_CACHE_DB_VERSION);
    expect([...db.objectStoreNames]).toEqual(["users"]);
    expect([...db.transaction("users", "readonly").objectStore("users").indexNames]).toEqual([
      "byOwner",
    ]);
  });

  it("isolates users by owner key", async () => {
    await upsertWorkspaceUserCache(OWNER_A, [cachedUser("user-a", { displayName: "Alice" })]);
    await upsertWorkspaceUserCache(OWNER_B, [cachedUser("user-b", { displayName: "Bob" })]);

    await expect(readWorkspaceUserCache(OWNER_A)).resolves.toEqual([
      expect.objectContaining({ uuid: "user-a", displayName: "Alice" }),
    ]);
    await expect(readWorkspaceUserCache(OWNER_B)).resolves.toEqual([
      expect.objectContaining({ uuid: "user-b", displayName: "Bob" }),
    ]);
  });

  it("reads one cached user by owner key and uuid", async () => {
    await upsertWorkspaceUserCache(OWNER_A, [cachedUser("user-a", { displayName: "Alice" })]);

    await expect(readWorkspaceUserCacheProfile(OWNER_A, "user-a")).resolves.toEqual(
      expect.objectContaining({
        uuid: "user-a",
        displayName: "Alice",
      }),
    );
  });

  it("does not leak one cached user across owner keys", async () => {
    await upsertWorkspaceUserCache(OWNER_A, [cachedUser("shared-user", { displayName: "Alice" })]);
    await upsertWorkspaceUserCache(OWNER_B, [cachedUser("shared-user", { displayName: "Bob" })]);

    await expect(readWorkspaceUserCacheProfile(OWNER_A, "shared-user")).resolves.toEqual(
      expect.objectContaining({
        uuid: "shared-user",
        displayName: "Alice",
      }),
    );
    await expect(readWorkspaceUserCacheProfile(OWNER_B, "shared-user")).resolves.toEqual(
      expect.objectContaining({
        uuid: "shared-user",
        displayName: "Bob",
      }),
    );
  });

  it("replaces only the current owner snapshot", async () => {
    await upsertWorkspaceUserCache(OWNER_A, [
      cachedUser("stale-a"),
      cachedUser("kept-a", { displayName: "Old" }),
    ]);
    await upsertWorkspaceUserCache(OWNER_B, [cachedUser("other-owner")]);

    await replaceWorkspaceUserCache(OWNER_A, [cachedUser("kept-a", { displayName: "Fresh" })]);

    await expect(readWorkspaceUserCache(OWNER_A)).resolves.toEqual([
      expect.objectContaining({ uuid: "kept-a", displayName: "Fresh" }),
    ]);
    await expect(readWorkspaceUserCache(OWNER_B)).resolves.toEqual([
      expect.objectContaining({ uuid: "other-owner" }),
    ]);
  });

  it("deletes only the current owner cache", async () => {
    await upsertWorkspaceUserCache(OWNER_A, [cachedUser("user-a")]);
    await upsertWorkspaceUserCache(OWNER_B, [cachedUser("user-b")]);

    await deleteWorkspaceUserOwnerCache(OWNER_A);

    await expect(readWorkspaceUserCache(OWNER_A)).resolves.toEqual([]);
    await expect(readWorkspaceUserCache(OWNER_B)).resolves.toEqual([
      expect.objectContaining({ uuid: "user-b" }),
    ]);
  });

  it("returns null for point reads when indexedDB is unavailable", async () => {
    const originalIndexedDb = globalThis.indexedDB;
    // Проверяем best-effort путь без падения наружу.
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: undefined,
    });

    try {
      await expect(readWorkspaceUserCacheProfile(OWNER_A, "user-a")).resolves.toBeNull();
    } finally {
      Object.defineProperty(globalThis, "indexedDB", {
        configurable: true,
        value: originalIndexedDb,
      });
    }
  });
});
