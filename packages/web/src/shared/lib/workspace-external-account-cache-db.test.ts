import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import {
  deleteWorkspaceExternalAccountCacheDatabase,
  deleteWorkspaceExternalAccountOwnerCache,
  openWorkspaceExternalAccountCacheDb,
  readWorkspaceExternalAccountCache,
  replaceWorkspaceExternalAccountCache,
  resetWorkspaceExternalAccountCacheDbSingletonForTests,
  WORKSPACE_EXTERNAL_ACCOUNT_CACHE_DB_NAME,
  WORKSPACE_EXTERNAL_ACCOUNT_CACHE_DB_VERSION,
} from "./workspace-external-account-cache-db";
import type { WorkspaceExternalAccountCacheProfile } from "./workspace-external-account-cache-db";

const OWNER_A = "account:a:org:o:project:p:user:u-a";
const OWNER_B = "account:b:org:o:project:p:user:u-b";

function cachedAccount(
  uuid: string,
  overrides: Partial<WorkspaceExternalAccountCacheProfile> = {},
): WorkspaceExternalAccountCacheProfile {
  return {
    uuid,
    projectId: "project-a",
    userUuid: "user-a",
    serverUrl: "https://zulip.example.com",
    sourceScope: "https://zulip.example.com",
    accountType: "zulip",
    status: "active",
    accessStatus: "confirmed",
    accessCheckedAt: "2026-07-10T09:00:00Z",
    accessConfirmedAt: "2026-07-10T09:00:00Z",
    accessNextCheckAt: "2026-07-10T10:00:00Z",
    accessLastError: null,
    accountSettingsKind: "zulip",
    userInfo: {
      userId: 7,
      email: "user@example.com",
      fullName: "Phoenix",
      avatarUrl: "/user_avatars/2/avatar.png",
    },
    createdAt: "2026-07-10T08:00:00Z",
    updatedAt: "2026-07-10T09:00:00Z",
    ...overrides,
  };
}

afterEach(async () => {
  try {
    const db = await openWorkspaceExternalAccountCacheDb();
    db.close();
  } catch {
    // no open DB
  }
  resetWorkspaceExternalAccountCacheDbSingletonForTests();
  await deleteWorkspaceExternalAccountCacheDatabase();
});

describe("workspace-external-account-cache-db", () => {
  it("opens the owner-scoped external account cache", async () => {
    const db = await openWorkspaceExternalAccountCacheDb();

    expect(db.name).toBe(WORKSPACE_EXTERNAL_ACCOUNT_CACHE_DB_NAME);
    expect(db.version).toBe(WORKSPACE_EXTERNAL_ACCOUNT_CACHE_DB_VERSION);
    expect([...db.objectStoreNames]).toEqual(["accounts"]);
    expect([...db.transaction("accounts", "readonly").objectStore("accounts").indexNames]).toEqual([
      "byOwner",
    ]);
  });

  it("isolates accounts by owner and replaces the owner snapshot", async () => {
    await replaceWorkspaceExternalAccountCache(OWNER_A, [cachedAccount("account-a")]);
    await replaceWorkspaceExternalAccountCache(OWNER_B, [cachedAccount("account-b")]);

    await replaceWorkspaceExternalAccountCache(OWNER_A, [
      cachedAccount("account-a-2", { serverUrl: "https://next.example.com" }),
    ]);

    await expect(readWorkspaceExternalAccountCache(OWNER_A)).resolves.toEqual([
      expect.objectContaining({ uuid: "account-a-2", serverUrl: "https://next.example.com" }),
    ]);
    await expect(readWorkspaceExternalAccountCache(OWNER_B)).resolves.toEqual([
      expect.objectContaining({ uuid: "account-b" }),
    ]);
  });

  it("deletes only the requested owner cache", async () => {
    await replaceWorkspaceExternalAccountCache(OWNER_A, [cachedAccount("account-a")]);
    await replaceWorkspaceExternalAccountCache(OWNER_B, [cachedAccount("account-b")]);

    await deleteWorkspaceExternalAccountOwnerCache(OWNER_A);

    await expect(readWorkspaceExternalAccountCache(OWNER_A)).resolves.toEqual([]);
    await expect(readWorkspaceExternalAccountCache(OWNER_B)).resolves.toEqual([
      expect.objectContaining({ uuid: "account-b" }),
    ]);
  });
});
