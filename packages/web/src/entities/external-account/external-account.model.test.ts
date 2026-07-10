import { beforeEach, describe, expect, it } from "vitest";
import { useExternalAccountsStore } from "./external-account.model";
import type { ExternalAccount } from "./external-account.types";

const account: ExternalAccount = {
  uuid: "account-1",
  projectId: "project-1",
  userUuid: "user-1",
  serverUrl: "https://zulip.example.com",
  sourceScope: "https://zulip.example.com",
  accountType: "zulip",
  status: "active",
  accessStatus: "confirmed",
  accessCheckedAt: null,
  accessConfirmedAt: null,
  accessNextCheckAt: "2026-07-10T10:00:00Z",
  accessLastError: null,
  accountSettingsKind: "zulip",
  userInfo: null,
  createdAt: "2026-07-10T08:00:00Z",
  updatedAt: "2026-07-10T09:00:00Z",
};

describe("external accounts store", () => {
  beforeEach(() => useExternalAccountsStore.getState().clear());

  it("clears data when the owner changes and rejects stale owner writes", () => {
    const store = useExternalAccountsStore.getState();
    store.startOwnerSync("owner-a");
    expect(store.replaceAccountsForOwner("owner-a", [account])).toBe(true);
    expect(useExternalAccountsStore.getState().accounts).toEqual([account]);

    store.startOwnerSync("owner-b");
    expect(useExternalAccountsStore.getState().accounts).toEqual([]);
    expect(store.replaceAccountsForOwner("owner-a", [account])).toBe(false);
    expect(useExternalAccountsStore.getState().accounts).toEqual([]);
  });

  it("keeps failures scoped to the active owner", () => {
    const store = useExternalAccountsStore.getState();
    store.startOwnerSync("owner-a");
    expect(store.setLoadStatusForOwner("owner-a", "error", "network failure")).toBe(true);
    expect(useExternalAccountsStore.getState()).toMatchObject({
      ownerKey: "owner-a",
      loadStatus: "error",
      error: "network failure",
    });
    expect(store.setLoadStatusForOwner("owner-b", "ready")).toBe(false);
  });
});
