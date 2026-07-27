import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceRealtimeEventContext } from "~/shared/lib/workspace-realtime/workspace-realtime-runtime.lib";
import { adaptWorkspaceExternalAccountDto } from "./external-account-adapters.lib";
import {
  createExternalAccountRealtimeApplier,
  externalAccountRealtimeTestUtils,
  markExternalAccountLocallyDeleted,
  type ExternalAccountRealtimeCache,
} from "./external-account-realtime-applier.lib";
import { useExternalAccountsStore } from "./external-account.model";

const OWNER_KEY = "owner-a";
const ACCOUNT_UUID = "10000000-0000-4000-8000-000000000001";
const PROJECT_UUID = "20000000-0000-4000-8000-000000000002";

function snapshot(revision: number) {
  return {
    uuid: ACCOUNT_UUID,
    settings: {
      kind: "zulip" as const,
      server_url: "https://zulip.example.com",
      email: "user@example.com",
      selection_mode: "explicit" as const,
      history_depth: "30_days" as const,
      default_project_id: PROJECT_UUID,
    },
    credential_present: true,
    status: "live" as const,
    live_ready: true,
    capabilities: {},
    safe_error: null,
    desired_generation: revision,
    applied_generation: revision,
    last_progress_at: null,
    revision,
    created_at: "2026-07-23T09:00:00Z",
    updated_at: "2026-07-23T10:00:00Z",
  };
}

function context(surface: "active" | "background"): WorkspaceRealtimeEventContext {
  return {
    owner: {
      accountId: "account-a",
      instanceId: "instance-a",
      organizationId: "organization-a",
      projectId: PROJECT_UUID,
      userUuid: "30000000-0000-4000-8000-000000000003",
      runtimeGeneration: 1,
    },
    ownerKey: OWNER_KEY,
    surface,
    source: "websocket",
  };
}

function event(
  kind: "external_account.created" | "external_account.updated" | "external_account.deleted",
  revision: number,
) {
  return {
    epoch_version: revision,
    type: "external_account" as const,
    kind,
    external_account: snapshot(revision),
  };
}

function cacheWith(accounts = [adaptWorkspaceExternalAccountDto(snapshot(1))]) {
  const replace = vi.fn<ExternalAccountRealtimeCache["replace"]>(() => Promise.resolve());
  const cache: ExternalAccountRealtimeCache = {
    read: vi.fn(() => Promise.resolve(accounts)),
    replace,
  };
  return { cache, replace };
}

describe("external account realtime applier", () => {
  beforeEach(() => {
    useExternalAccountsStore.getState().clear();
    externalAccountRealtimeTestUtils.resetDeletionFences();
  });

  it("applies a full newer snapshot to the active owner store and cache", async () => {
    const { cache, replace } = cacheWith();
    const store = useExternalAccountsStore.getState();
    store.startOwnerSync(OWNER_KEY);
    store.replaceAccountsForOwner(OWNER_KEY, [adaptWorkspaceExternalAccountDto(snapshot(1))]);
    const applier = createExternalAccountRealtimeApplier({
      surface: "active",
      isOwnerCurrent: () => true,
      cache,
    });

    applier.applyEvent(event("external_account.updated", 2), context("active"));
    await vi.waitFor(() => expect(replace).toHaveBeenCalledOnce());

    expect(useExternalAccountsStore.getState().accounts[0]?.revision).toBe(2);
    expect(replace.mock.calls[0]?.[1][0]?.revision).toBe(2);
  });

  it("does not let an older snapshot roll the active state back", () => {
    const store = useExternalAccountsStore.getState();
    store.startOwnerSync(OWNER_KEY);
    store.replaceAccountsForOwner(OWNER_KEY, [adaptWorkspaceExternalAccountDto(snapshot(3))]);
    const applier = createExternalAccountRealtimeApplier({
      surface: "active",
      isOwnerCurrent: () => true,
      cache: cacheWith([]).cache,
    });

    applier.applyEvent(event("external_account.updated", 2), context("active"));

    expect(useExternalAccountsStore.getState().accounts[0]?.revision).toBe(3);
  });

  it("does not let a late update restore a locally deleted account", () => {
    const store = useExternalAccountsStore.getState();
    store.startOwnerSync(OWNER_KEY);
    store.replaceAccountsForOwner(OWNER_KEY, [adaptWorkspaceExternalAccountDto(snapshot(1))]);
    markExternalAccountLocallyDeleted(OWNER_KEY, ACCOUNT_UUID);
    store.removeAccountForOwner(OWNER_KEY, ACCOUNT_UUID);
    const applier = createExternalAccountRealtimeApplier({
      surface: "active",
      isOwnerCurrent: () => true,
      cache: cacheWith([]).cache,
    });

    applier.applyEvent(event("external_account.updated", 2), context("active"));

    expect(useExternalAccountsStore.getState().accounts).toEqual([]);

    applier.applyEvent(event("external_account.created", 3), context("active"));

    expect(useExternalAccountsStore.getState().accounts[0]?.revision).toBe(3);
  });

  it("removes a deleted account using the delete snapshot revision", async () => {
    const { cache, replace } = cacheWith();
    const store = useExternalAccountsStore.getState();
    store.startOwnerSync(OWNER_KEY);
    store.replaceAccountsForOwner(OWNER_KEY, [adaptWorkspaceExternalAccountDto(snapshot(1))]);
    const applier = createExternalAccountRealtimeApplier({
      surface: "active",
      isOwnerCurrent: () => true,
      cache,
    });

    applier.applyEvent(event("external_account.deleted", 2), context("active"));
    await vi.waitFor(() => expect(replace).toHaveBeenCalledOnce());

    expect(useExternalAccountsStore.getState().accounts).toEqual([]);
    expect(replace.mock.calls[0]?.[1]).toEqual([]);
  });

  it("keeps background events out of the active store", async () => {
    const { cache, replace } = cacheWith();
    const store = useExternalAccountsStore.getState();
    store.startOwnerSync(OWNER_KEY);
    store.replaceAccountsForOwner(OWNER_KEY, [adaptWorkspaceExternalAccountDto(snapshot(1))]);
    const applier = createExternalAccountRealtimeApplier({
      surface: "background",
      isOwnerCurrent: () => true,
      cache,
    });

    applier.applyEvent(event("external_account.updated", 2), context("background"));
    await vi.waitFor(() => expect(replace).toHaveBeenCalledOnce());

    expect(useExternalAccountsStore.getState().accounts[0]?.revision).toBe(1);
    expect(replace.mock.calls[0]?.[1][0]?.revision).toBe(2);
  });

  it("ignores a stale runtime before store and cache writes", () => {
    const { cache, replace } = cacheWith();
    const applier = createExternalAccountRealtimeApplier({
      surface: "active",
      isOwnerCurrent: () => false,
      cache,
    });

    applier.applyEvent(event("external_account.updated", 2), context("active"));

    expect(cache.read).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
});
