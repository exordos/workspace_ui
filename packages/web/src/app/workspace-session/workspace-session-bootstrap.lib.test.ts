import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  invalidateMessengerSessionProtectedResources,
  markMessengerSessionBootstrapError,
  prepareMessengerSessionSnapshot,
  restoreMessengerSessionCatalog,
} from "~/applications/messenger/runtime/sync/messenger-session-snapshot.lib";
import { loadExternalAccounts } from "~/entities/external-account/external-account-loader.lib";
import {
  refreshWorkspaceSessionUsers,
  restoreWorkspaceSessionUsers,
} from "~/entities/user/user-sync.lib";
import { ensureFreshWorkspaceSession } from "~/entities/workspace-auth/workspace-auth.lib";
import {
  useWorkspaceAuthStore,
  type WorkspaceAuthSession,
} from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceMessengerEpochDto } from "~/shared/api/messenger.types";
import { getEpoch } from "~/shared/api/workspace-client";
import type { WorkspaceRealtimeRuntimeContext } from "~/shared/lib/workspace-realtime/workspace-realtime-runtime.lib";
import { prepareWorkspaceSessionSnapshots } from "./workspace-session-bootstrap.lib";

vi.mock("~/applications/messenger/runtime/sync/messenger-session-snapshot.lib", () => ({
  invalidateMessengerSessionProtectedResources: vi.fn(),
  markMessengerSessionBootstrapError: vi.fn(),
  prepareMessengerSessionSnapshot: vi.fn(),
  restoreMessengerSessionCatalog: vi.fn(),
}));
vi.mock("~/entities/external-account/external-account-loader.lib", () => ({
  loadExternalAccounts: vi.fn(),
}));
vi.mock("~/entities/user/user-sync.lib", () => ({
  refreshWorkspaceSessionUsers: vi.fn(),
  restoreWorkspaceSessionUsers: vi.fn(),
}));
vi.mock("~/entities/workspace-auth/workspace-auth.lib", () => ({
  ensureFreshWorkspaceSession: vi.fn(),
}));
vi.mock("~/shared/api/workspace-client", () => ({ getEpoch: vi.fn() }));

function createSession(accountId: string): WorkspaceAuthSession {
  return {
    accountId,
    instanceId: `${accountId}-instance`,
    organizationId: `${accountId}-org`,
    organizationOrigin: `https://${accountId}.example.invalid`,
    projectId: `${accountId}-project`,
    userUuid: `${accountId}-user`,
    login: "tester",
    accessToken: "test-token",
    runtimeGeneration: 1,
    profile: {
      uuid: `${accountId}-user`,
      username: "tester",
      firstName: null,
      lastName: null,
      email: null,
    },
  };
}

function contextFor(
  session: WorkspaceAuthSession,
  surface: WorkspaceRealtimeRuntimeContext["surface"] = "active",
  signal?: AbortSignal,
): WorkspaceRealtimeRuntimeContext {
  return { owner: session, ownerKey: workspaceRuntimeOwnerKey(session), surface, signal };
}

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const A = createSession("account-a");
const B = createSession("account-b");
const context = contextFor(A);
const stored = { epochGeneration: "old", epochVersion: 120 };
const epoch: WorkspaceMessengerEpochDto = {
  epoch_generation: "new",
  epoch_version: 130,
  current_epoch_version: 130,
  minimum_epoch_version: 80,
};
const newCursor = { epochGeneration: "new", epochVersion: 130 };
const expiry = {
  type: "EventsCursorExpiredError" as const,
  code: 410 as const,
  error: "epoch_pruned" as const,
  reason: "epoch_pruned",
  message: "Retained history starts after the saved position",
  epoch_generation: "new",
  current_epoch_version: 128,
  minimum_epoch_version: 121,
};

describe("Workspace session snapshot coordination", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useWorkspaceAuthStore.setState({ sessions: [A, B], currentAccountId: A.accountId });
    vi.mocked(getEpoch).mockResolvedValue(epoch);
    vi.mocked(ensureFreshWorkspaceSession).mockResolvedValue(A);
    vi.mocked(restoreWorkspaceSessionUsers).mockResolvedValue({ status: "empty" });
    vi.mocked(restoreMessengerSessionCatalog).mockResolvedValue("missing");
    vi.mocked(refreshWorkspaceSessionUsers).mockResolvedValue({ status: "applied" });
    vi.mocked(prepareMessengerSessionSnapshot).mockResolvedValue({
      status: "applied",
      ownerKey: context.ownerKey,
    });
    vi.mocked(loadExternalAccounts).mockResolvedValue({
      status: "applied",
      ownerKey: context.ownerKey,
    });
  });

  it("applies users independently while the catalog is pending and after a catalog failure", async () => {
    const catalog = deferred<Awaited<ReturnType<typeof prepareMessengerSessionSnapshot>>>();
    vi.mocked(prepareMessengerSessionSnapshot).mockReturnValueOnce(catalog.promise);
    const barrier = prepareWorkspaceSessionSnapshots(context, {
      savedCursor: null,
      expiry: null,
      resetRequired: false,
    });
    const rejected = expect(barrier).rejects.toThrow("folders unavailable");
    await vi.waitFor(() => {
      expect(refreshWorkspaceSessionUsers).toHaveBeenCalledOnce();
      expect(prepareMessengerSessionSnapshot).toHaveBeenCalledOnce();
    });
    expect(vi.mocked(getEpoch).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(refreshWorkspaceSessionUsers).mock.invocationCallOrder[0] ?? 0,
    );
    expect(await vi.mocked(refreshWorkspaceSessionUsers).mock.results[0]?.value).toEqual({
      status: "applied",
    });
    catalog.resolve({ status: "failed", error: "folders unavailable", ownerKey: context.ownerKey });
    await rejected;
  });

  it("resumes only a saved cursor with both complete cached projections", async () => {
    vi.mocked(restoreWorkspaceSessionUsers).mockResolvedValue({ status: "applied" });
    vi.mocked(restoreMessengerSessionCatalog).mockResolvedValue("restored");
    await expect(
      prepareWorkspaceSessionSnapshots(context, {
        savedCursor: stored,
        expiry: null,
        resetRequired: false,
      }),
    ).resolves.toEqual(stored);
    expect(getEpoch).not.toHaveBeenCalled();

    vi.mocked(restoreWorkspaceSessionUsers).mockResolvedValue({ status: "empty" });
    await expect(
      prepareWorkspaceSessionSnapshots(context, {
        savedCursor: stored,
        expiry: null,
        resetRequired: false,
      }),
    ).resolves.toEqual(newCursor);
    expect(getEpoch).toHaveBeenCalledOnce();
  });

  it("starts users HTTP when an older saved cursor is missing a users baseline and catalog cache is stalled", async () => {
    const catalogCache = deferred<Awaited<ReturnType<typeof restoreMessengerSessionCatalog>>>();
    vi.mocked(restoreMessengerSessionCatalog).mockReturnValueOnce(catalogCache.promise);
    await expect(
      prepareWorkspaceSessionSnapshots(context, {
        savedCursor: stored,
        expiry: null,
        resetRequired: false,
      }),
    ).resolves.toEqual(newCursor);
    expect(refreshWorkspaceSessionUsers).toHaveBeenCalledOnce();
    expect(prepareMessengerSessionSnapshot).toHaveBeenCalledOnce();
    catalogCache.resolve("missing");
  });

  it("uses a fresh epoch before all background expiry snapshots and retries on failure", async () => {
    const background = contextFor(B, "background");
    vi.mocked(loadExternalAccounts).mockResolvedValueOnce({
      status: "failed",
      ownerKey: background.ownerKey,
      error: "external accounts unavailable",
    });
    await expect(
      prepareWorkspaceSessionSnapshots(background, {
        savedCursor: null,
        expiry,
        resetRequired: true,
      }),
    ).rejects.toThrow("external accounts unavailable");
    const secondEpoch = { ...epoch, epoch_version: 137 };
    vi.mocked(getEpoch).mockResolvedValueOnce(secondEpoch);
    await expect(
      prepareWorkspaceSessionSnapshots(background, {
        savedCursor: null,
        expiry,
        resetRequired: true,
      }),
    ).resolves.toEqual({ ...newCursor, epochVersion: 137 });
    for (const ownerOperation of [
      refreshWorkspaceSessionUsers,
      prepareMessengerSessionSnapshot,
      loadExternalAccounts,
    ]) {
      expect(ownerOperation).toHaveBeenCalledTimes(2);
      expect(ownerOperation).toHaveBeenCalledWith(
        expect.objectContaining({ runtimeContext: B, surface: "background" }),
      );
      expect(vi.mocked(getEpoch).mock.invocationCallOrder[1]).toBeLessThan(
        vi.mocked(ownerOperation).mock.invocationCallOrder[1] ?? 0,
      );
    }
    expect(restoreMessengerSessionCatalog).not.toHaveBeenCalled();
    expect(restoreWorkspaceSessionUsers).not.toHaveBeenCalled();
  });

  it("invalidates protected resources on a gap even when the new epoch cannot be fetched", async () => {
    vi.mocked(getEpoch).mockRejectedValueOnce(new Error("epoch unavailable"));
    await expect(
      prepareWorkspaceSessionSnapshots(context, { savedCursor: null, expiry, resetRequired: true }),
    ).rejects.toThrow("epoch unavailable");
    expect(invalidateMessengerSessionProtectedResources).toHaveBeenCalledBefore(
      vi.mocked(getEpoch),
    );
    expect(prepareMessengerSessionSnapshot).not.toHaveBeenCalled();
    expect(refreshWorkspaceSessionUsers).not.toHaveBeenCalled();
  });

  it("discards a late epoch after switching the selected owner", async () => {
    const delayedEpoch = deferred<WorkspaceMessengerEpochDto>();
    vi.mocked(getEpoch).mockReturnValueOnce(delayedEpoch.promise);
    const barrier = prepareWorkspaceSessionSnapshots(context, {
      savedCursor: null,
      expiry: null,
      resetRequired: false,
    });
    const rejected = expect(barrier).rejects.toHaveProperty("name", "AbortError");
    await vi.waitFor(() => expect(getEpoch).toHaveBeenCalledOnce());
    useWorkspaceAuthStore.setState({ currentAccountId: B.accountId });
    delayedEpoch.resolve(epoch);
    await rejected;
    expect(prepareMessengerSessionSnapshot).not.toHaveBeenCalled();
    expect(refreshWorkspaceSessionUsers).not.toHaveBeenCalled();
    expect(markMessengerSessionBootstrapError).not.toHaveBeenCalled();
  });
});
