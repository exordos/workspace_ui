import { beforeEach, describe, expect, it } from "vitest";
import { useExternalAccountsStore } from "./external-account.model";
import type { ExternalAccount } from "./external-account.types";

const account: ExternalAccount = {
  uuid: "account-1",
  provider: "zulip",
  settings: {
    kind: "zulip",
    serverUrl: "https://zulip.example.com",
    email: "user@example.com",
    selectionMode: "explicit",
    historyDepth: "30_days",
    defaultProjectId: "project-1",
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

describe("external accounts store", () => {
  beforeEach(() => useExternalAccountsStore.getState().clear());

  it("clears data when the owner changes and rejects stale owner writes", () => {
    const store = useExternalAccountsStore.getState();
    store.startOwnerSync("owner-a");
    expect(store.replaceAccountsForOwner("owner-a", [account])).toBe(true);
    store.startOwnerSync("owner-b");
    expect(useExternalAccountsStore.getState().accounts).toEqual([]);
    expect(store.replaceAccountsForOwner("owner-a", [account])).toBe(false);
  });

  it("keeps failures scoped to the active owner", () => {
    const store = useExternalAccountsStore.getState();
    store.startOwnerSync("owner-a");
    expect(store.setLoadStatusForOwner("owner-a", "error", "network failure")).toBe(true);
    expect(store.setLoadStatusForOwner("owner-b", "ready")).toBe(false);
  });

  it("does not let an old account load restore a locally deleted account", () => {
    const store = useExternalAccountsStore.getState();
    const loadGeneration = store.startOwnerSync("owner-a");
    store.removeAccountForOwner("owner-a", account.uuid);

    expect(store.replaceAccountsForOwner("owner-a", [account], Date.now(), loadGeneration)).toBe(
      false,
    );
    expect(useExternalAccountsStore.getState().accounts).toEqual([]);
  });
});
