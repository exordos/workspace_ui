import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ZulipExternalAccount } from "./external-accounts.types";

const resolveScope = vi.hoisted(() => vi.fn());

vi.mock("~/shared/lib/messenger-cache-scope.lib", () => ({
  resolveCurrentMessengerCacheAccountScope: resolveScope,
}));

function account(): ZulipExternalAccount {
  return {
    uuid: "account-1",
    settings: {
      kind: "zulip",
      serverUrl: "https://zulip.example.com",
      email: "owner@example.com",
      selectionMode: "all",
      historyDepth: "30_days",
      defaultProjectId: "project-1",
    },
    credentialPresent: true,
    status: "live",
    liveReady: true,
    safeError: null,
    capabilities: {},
    desiredGeneration: 1,
    appliedGeneration: 1,
    lastProgressAt: null,
    createdAt: "2026-07-17T11:00:00Z",
    updatedAt: "2026-07-17T12:00:00Z",
    etag: '"account-1-r1"',
  };
}

describe("external accounts IndexedDB cache", () => {
  beforeEach(() => {
    resolveScope.mockReset();
    resolveScope.mockReturnValue({
      accountScope: "https://workspace.example|user-1",
      projectId: "project-1",
      userUuid: "user-1",
    });
  });

  it("persists and clears a sanitized credential-free snapshot", async () => {
    const {
      deleteCurrentExternalAccountsSnapshot,
      loadCurrentExternalAccountsSnapshot,
      persistCurrentExternalAccountsSnapshot,
    } = await import("./external-accounts-cache.db");
    await deleteCurrentExternalAccountsSnapshot();
    await persistCurrentExternalAccountsSnapshot({ account: account(), chats: [], operations: [] });

    const cached = await loadCurrentExternalAccountsSnapshot();
    expect(cached?.account?.settings.email).toBe("owner@example.com");
    expect(JSON.stringify(cached)).not.toContain("api_key");
    expect(JSON.stringify(cached)).not.toContain("apiKey");

    await deleteCurrentExternalAccountsSnapshot();
    await expect(loadCurrentExternalAccountsSnapshot()).resolves.toBeNull();
  });
});
