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

const OWNER_A = "account:a:instance:i:organization:o:project:p:user:u-a";
const OWNER_B = "account:b:instance:i:organization:o:project:p:user:u-b";

function cachedAccount(uuid: string): WorkspaceExternalAccountCacheProfile {
  return {
    uuid,
    provider: "zulip",
    settings: {
      kind: "zulip",
      serverUrl: "https://zulip.example.com",
      email: "user@example.com",
      selectionMode: "explicit",
      historyDepth: "30_days",
      defaultProjectId: "project-a",
    },
    credentialPresent: true,
    status: "live",
    liveReady: true,
    capabilities: {},
    safeError: null,
    desiredGeneration: 1,
    appliedGeneration: 1,
    lastProgressAt: null,
    revision: 1,
    createdAt: "2026-07-10T08:00:00Z",
    updatedAt: "2026-07-10T09:00:00Z",
    etag: '"1"',
  };
}

afterEach(async () => {
  try {
    (await openWorkspaceExternalAccountCacheDb()).close();
  } catch {
    // no open DB
  }
  resetWorkspaceExternalAccountCacheDbSingletonForTests();
  await deleteWorkspaceExternalAccountCacheDatabase();
});

describe("workspace-external-account-cache-db", () => {
  it("opens the v2 owner-scoped cache", async () => {
    const db = await openWorkspaceExternalAccountCacheDb();
    expect(db.name).toBe(WORKSPACE_EXTERNAL_ACCOUNT_CACHE_DB_NAME);
    expect(db.version).toBe(WORKSPACE_EXTERNAL_ACCOUNT_CACHE_DB_VERSION);
  });

  it("isolates and replaces snapshots by complete owner key", async () => {
    await replaceWorkspaceExternalAccountCache(OWNER_A, [cachedAccount("account-a")]);
    await replaceWorkspaceExternalAccountCache(OWNER_B, [cachedAccount("account-b")]);
    await replaceWorkspaceExternalAccountCache(OWNER_A, [cachedAccount("account-a-2")]);
    await expect(readWorkspaceExternalAccountCache(OWNER_A)).resolves.toEqual([
      expect.objectContaining({ uuid: "account-a-2" }),
    ]);
    await expect(readWorkspaceExternalAccountCache(OWNER_B)).resolves.toEqual([
      expect.objectContaining({ uuid: "account-b" }),
    ]);
  });

  it("does not write after the owner is invalidated", async () => {
    await replaceWorkspaceExternalAccountCache(OWNER_A, [cachedAccount("account-a")], () => false);
    await expect(readWorkspaceExternalAccountCache(OWNER_A)).resolves.toEqual([]);
  });

  it("deletes only the requested owner cache", async () => {
    await replaceWorkspaceExternalAccountCache(OWNER_A, [cachedAccount("account-a")]);
    await replaceWorkspaceExternalAccountCache(OWNER_B, [cachedAccount("account-b")]);
    await deleteWorkspaceExternalAccountOwnerCache(OWNER_A);
    await expect(readWorkspaceExternalAccountCache(OWNER_A)).resolves.toEqual([]);
    await expect(readWorkspaceExternalAccountCache(OWNER_B)).resolves.toHaveLength(1);
  });
});
