import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import type {
  WorkspaceExternalProviderHealthDto,
  WorkspaceExternalProviderPolicyDto,
} from "~/shared/api/messenger-external-provider-admin.types";
import {
  MessengerApiError,
  type MessengerClientOptions,
} from "~/shared/api/messenger-transport.internal";
import {
  type ManageExternalProviderClient,
  useManageExternalProvider,
} from "./manage-external-provider.hook";

function runtime(projectId = "project-a", runtimeGeneration = 1): WorkspaceRuntimeContext {
  return {
    accountId: "account-1",
    instanceId: "instance-1",
    organizationId: "organization-1",
    projectId,
    userUuid: "user-1",
    organizationOrigin: "https://workspace.example.com",
    accessToken: `token-${projectId}-${runtimeGeneration}`,
    runtimeGeneration,
  };
}

function policy(
  overrides: Partial<WorkspaceExternalProviderPolicyDto> = {},
): WorkspaceExternalProviderPolicyDto {
  return {
    uuid: "provider-policy-1",
    created_at: "2026-07-24T10:00:00Z",
    updated_at: "2026-07-24T10:00:00Z",
    revision: 1,
    provider: "zulip",
    enabled: true,
    emergency_suspended: false,
    limits: {
      max_accounts: 2,
      max_selected_chats_per_account: 20,
      max_file_bytes: 52_428_801,
    },
    custom_ca_bundle: null,
    ...overrides,
  };
}

function health(status: "healthy" | "unavailable" = "healthy"): WorkspaceExternalProviderHealthDto {
  return {
    provider: "zulip",
    status,
    account_counts: { live: 2 },
    chat_counts: { available: 4, live: 3 },
    bridge_counts: { active: 1 },
    operation_counts: { completed: 10 },
    metrics: {
      queue_depth: 0,
      selected_chats: 3,
      synchronized_messages: 10,
      synchronized_users: 4,
    },
    updated_at: "2026-07-24T10:00:00Z",
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function accessError(status: number, type: string) {
  return new MessengerApiError("request failed", status, {
    type,
    code: status,
    message: "safe",
  });
}

describe("useManageExternalProvider access probe", () => {
  it("marks a successful policy probe as allowed without loading health", async () => {
    const getPolicy = vi.fn().mockResolvedValue({ policy: policy(), etag: '"1"' });
    const getHealth = vi.fn();
    const currentRuntime = runtime();
    const { result } = renderHook(() =>
      useManageExternalProvider({
        probeEnabled: true,
        open: false,
        runtimeContext: currentRuntime,
        getRuntimeContext: () => currentRuntime,
        client: { getPolicy, getHealth },
      }),
    );

    await waitFor(() => expect(result.current.accessStatus).toBe("allowed"));
    expect(result.current.policy?.limits.max_file_bytes).toBe(52_428_801);
    expect(getHealth).not.toHaveBeenCalled();
  });

  it.each([
    [401, "Anything"],
    [403, "ExternalResourceForbiddenError"],
  ])("maps %i %s to denied", async (status, type) => {
    const currentRuntime = runtime();
    const { result } = renderHook(() =>
      useManageExternalProvider({
        probeEnabled: true,
        open: false,
        runtimeContext: currentRuntime,
        getRuntimeContext: () => currentRuntime,
        client: { getPolicy: vi.fn().mockRejectedValue(accessError(status, type)) },
      }),
    );

    await waitFor(() => expect(result.current.accessStatus).toBe("denied"));
  });

  it("keeps non-typed 403 as a probe error rather than denied", async () => {
    const currentRuntime = runtime();
    const { result } = renderHook(() =>
      useManageExternalProvider({
        probeEnabled: true,
        open: false,
        runtimeContext: currentRuntime,
        getRuntimeContext: () => currentRuntime,
        client: {
          getPolicy: vi.fn().mockRejectedValue(accessError(403, "WorkspacePermissionDeniedError")),
        },
      }),
    );

    await waitFor(() => expect(result.current.accessStatus).toBe("error"));
    expect(result.current.accessError).toBe("access");
  });

  it("revokes allowed access when a later policy load is denied", async () => {
    const currentRuntime = runtime();
    const getPolicy = vi
      .fn()
      .mockResolvedValueOnce({ policy: policy(), etag: '"1"' })
      .mockRejectedValueOnce(accessError(403, "ExternalResourceForbiddenError"));
    const getHealth = vi.fn().mockResolvedValue(health());
    const { result, rerender } = renderHook(
      ({ open }) =>
        useManageExternalProvider({
          probeEnabled: true,
          open,
          runtimeContext: currentRuntime,
          getRuntimeContext: () => currentRuntime,
          client: { getPolicy, getHealth },
        }),
      { initialProps: { open: false } },
    );

    await waitFor(() => expect(result.current.accessStatus).toBe("allowed"));
    rerender({ open: true });

    await waitFor(() => expect(result.current.accessStatus).toBe("denied"));
    expect(result.current.policyStatus).toBe("error");
    expect(result.current.policyError).toBe("load_policy");
    expect(result.current.policy).toBeNull();
    expect(result.current.policyEtag).toBeNull();
    expect(result.current.draft).toBeNull();
    await waitFor(() => expect(result.current.healthStatus).toBe("ready"));
  });

  it("aborts an access probe while open and ignores its late response", async () => {
    const currentRuntime = runtime();
    const oldProbe = deferred<{
      policy: WorkspaceExternalProviderPolicyDto;
      etag: string;
    }>();
    const probeSignals: AbortSignal[] = [];
    const freshPolicy = policy({ uuid: "fresh-detail-policy", revision: 2 });
    const getPolicy = vi
      .fn()
      .mockImplementationOnce((options: MessengerClientOptions) => {
        if (options.signal != null) probeSignals.push(options.signal);
        return oldProbe.promise;
      })
      .mockResolvedValueOnce({ policy: freshPolicy, etag: '"fresh"' })
      .mockResolvedValueOnce({ policy: freshPolicy, etag: '"probe-after-close"' });
    const { result, rerender } = renderHook(
      ({ open }) =>
        useManageExternalProvider({
          probeEnabled: true,
          open,
          runtimeContext: currentRuntime,
          getRuntimeContext: () => currentRuntime,
          client: {
            getPolicy,
            getHealth: vi.fn().mockResolvedValue(health()),
          },
        }),
      { initialProps: { open: false } },
    );

    await waitFor(() => expect(getPolicy).toHaveBeenCalledTimes(1));
    rerender({ open: true });
    await waitFor(() => expect(result.current.policyEtag).toBe('"fresh"'));
    expect(probeSignals[0]?.aborted).toBe(true);

    oldProbe.resolve({ policy: policy({ uuid: "late-probe-policy" }), etag: '"late"' });
    await act(async () => {
      await oldProbe.promise;
    });
    expect(result.current.policy?.uuid).toBe("fresh-detail-policy");
    expect(result.current.policyEtag).toBe('"fresh"');

    rerender({ open: false });
    await waitFor(() => expect(result.current.policyEtag).toBe('"probe-after-close"'));
    expect(getPolicy).toHaveBeenCalledTimes(3);
  });
});

describe("useManageExternalProvider details and changes", () => {
  it("keeps a loaded policy usable when health fails independently", async () => {
    const currentRuntime = runtime();
    const { result } = renderHook(() =>
      useManageExternalProvider({
        probeEnabled: false,
        open: true,
        runtimeContext: currentRuntime,
        getRuntimeContext: () => currentRuntime,
        client: {
          getPolicy: vi.fn().mockResolvedValue({ policy: policy(), etag: '"1"' }),
          getHealth: vi.fn().mockRejectedValue(new Error("health unavailable")),
        },
      }),
    );

    await waitFor(() => expect(result.current.policyStatus).toBe("ready"));
    await waitFor(() => expect(result.current.healthStatus).toBe("error"));
    expect(result.current.policy?.enabled).toBe(true);
    expect(result.current.healthError).toBe("load_health");
  });

  it("blocks save locally when custom CA metadata is present", async () => {
    const updatePolicy = vi.fn();
    const currentRuntime = runtime();
    const customCaPolicy = policy({
      custom_ca_bundle: {
        uuid: "custom-ca-1",
        generation: 1,
        sha256: "a".repeat(64),
        certificate_count: 1,
      },
    });
    const { result } = renderHook(() =>
      useManageExternalProvider({
        probeEnabled: false,
        open: true,
        runtimeContext: currentRuntime,
        getRuntimeContext: () => currentRuntime,
        client: {
          getPolicy: vi.fn().mockResolvedValue({ policy: customCaPolicy, etag: '"1"' }),
          getHealth: vi.fn().mockResolvedValue(health()),
          updatePolicy,
        },
      }),
    );

    await waitFor(() => expect(result.current.policyStatus).toBe("ready"));
    act(() => result.current.setEnabled(false));
    act(() => result.current.save());

    expect(result.current.saveStatus).toBe("blocked");
    expect(result.current.saveError).toBe("custom_ca_update_unsupported");
    expect(updatePolicy).not.toHaveBeenCalled();
  });

  it("saves the byte-exact draft using the current ETag", async () => {
    const currentRuntime = runtime();
    const updated = policy({
      revision: 2,
      enabled: false,
      limits: {
        max_accounts: 3,
        max_selected_chats_per_account: 20,
        max_file_bytes: 52_428_803,
      },
    });
    const updatePolicy = vi.fn().mockResolvedValue({ policy: updated, etag: '"2"' });
    const { result } = renderHook(() =>
      useManageExternalProvider({
        probeEnabled: false,
        open: true,
        runtimeContext: currentRuntime,
        getRuntimeContext: () => currentRuntime,
        client: {
          getPolicy: vi.fn().mockResolvedValue({ policy: policy(), etag: '"1"' }),
          getHealth: vi.fn().mockResolvedValue(health()),
          updatePolicy,
        },
      }),
    );

    await waitFor(() => expect(result.current.policyStatus).toBe("ready"));
    act(() => {
      result.current.setEnabled(false);
      result.current.setLimit("max_accounts", 3);
      result.current.setLimit("max_file_bytes", 52_428_803);
    });
    act(() => result.current.save());

    await waitFor(() => expect(result.current.saveStatus).toBe("saved"));
    expect(updatePolicy.mock.calls[0]?.slice(1)).toEqual([
      {
        settings: {
          kind: "zulip",
          enabled: false,
          limits: {
            max_accounts: 3,
            max_selected_chats_per_account: 20,
            max_file_bytes: 52_428_803,
          },
          custom_ca_bundle: null,
        },
      },
      '"1"',
    ]);
    expect(result.current.policyEtag).toBe('"2"');
  });

  it("preserves edits made after save started when the request succeeds", async () => {
    const currentRuntime = runtime();
    const updateResponse = deferred<{
      policy: WorkspaceExternalProviderPolicyDto;
      etag: string;
    }>();
    const updated = policy({
      revision: 2,
      limits: {
        max_accounts: 5,
        max_selected_chats_per_account: 20,
        max_file_bytes: 52_428_801,
      },
    });
    const { result } = renderHook(() =>
      useManageExternalProvider({
        probeEnabled: false,
        open: true,
        runtimeContext: currentRuntime,
        getRuntimeContext: () => currentRuntime,
        client: {
          getPolicy: vi.fn().mockResolvedValue({ policy: policy(), etag: '"1"' }),
          getHealth: vi.fn().mockResolvedValue(health()),
          updatePolicy: vi.fn().mockReturnValue(updateResponse.promise),
        },
      }),
    );

    await waitFor(() => expect(result.current.policyStatus).toBe("ready"));
    act(() => result.current.setLimit("max_accounts", 5));
    act(() => result.current.save());
    act(() => result.current.setLimit("max_file_bytes", 70_000_003));
    updateResponse.resolve({ policy: updated, etag: '"2"' });

    await waitFor(() => expect(result.current.saveStatus).toBe("saved"));
    expect(result.current.policyEtag).toBe('"2"');
    expect(result.current.draft?.limits).toEqual({
      max_accounts: 5,
      max_selected_chats_per_account: 20,
      max_file_bytes: 70_000_003,
    });
  });

  it("rebases local and remote field changes after a true precondition conflict", async () => {
    const currentRuntime = runtime();
    const first = policy();
    const fresh = policy({
      revision: 2,
      limits: { ...first.limits, max_file_bytes: 80_000_009 },
    });
    const freshResponse = deferred<{
      policy: WorkspaceExternalProviderPolicyDto;
      etag: string;
    }>();
    const getPolicy = vi
      .fn()
      .mockResolvedValueOnce({ policy: first, etag: '"1"' })
      .mockReturnValueOnce(freshResponse.promise);
    const updatePolicy = vi
      .fn()
      .mockRejectedValue(accessError(412, "ExternalPreconditionFailedError"));
    const { result } = renderHook(() =>
      useManageExternalProvider({
        probeEnabled: false,
        open: true,
        runtimeContext: currentRuntime,
        getRuntimeContext: () => currentRuntime,
        client: {
          getPolicy,
          getHealth: vi.fn().mockResolvedValue(health()),
          updatePolicy,
        },
      }),
    );

    await waitFor(() => expect(result.current.policyStatus).toBe("ready"));
    act(() => result.current.setLimit("max_accounts", 5));
    act(() => result.current.save());
    await waitFor(() => expect(result.current.saveStatus).toBe("conflict"));
    act(() => result.current.setLimit("max_selected_chats_per_account", 30));
    freshResponse.resolve({ policy: fresh, etag: '"2"' });

    await waitFor(() => expect(result.current.policyEtag).toBe('"2"'));
    expect(result.current.saveStatus).toBe("conflict");
    expect(result.current.draft?.limits.max_accounts).toBe(5);
    expect(result.current.draft?.limits.max_selected_chats_per_account).toBe(30);
    expect(result.current.draft?.limits.max_file_bytes).toBe(80_000_009);
    expect(result.current.policy?.limits.max_accounts).toBe(2);
    expect(result.current.policy?.limits.max_file_bytes).toBe(80_000_009);
    expect(updatePolicy).toHaveBeenCalledTimes(1);
  });

  it.each([
    [409, "ExternalResourceConflictError"],
    [412, "AnotherPreconditionError"],
  ])(
    "treats HTTP %i with type %s as a regular save error without conflict refresh",
    async (status, type) => {
      const currentRuntime = runtime();
      const getPolicy = vi.fn().mockResolvedValue({ policy: policy(), etag: '"1"' });
      const { result } = renderHook(() =>
        useManageExternalProvider({
          probeEnabled: false,
          open: true,
          runtimeContext: currentRuntime,
          getRuntimeContext: () => currentRuntime,
          client: {
            getPolicy,
            getHealth: vi.fn().mockResolvedValue(health()),
            updatePolicy: vi.fn().mockRejectedValue(accessError(status, type)),
          },
        }),
      );

      await waitFor(() => expect(result.current.policyStatus).toBe("ready"));
      act(() => result.current.setLimit("max_accounts", 5));
      act(() => result.current.save());

      await waitFor(() => expect(result.current.saveStatus).toBe("error"));
      expect(result.current.saveError).toBe("save");
      expect(getPolicy).toHaveBeenCalledTimes(1);
    },
  );

  it("refreshes policy and health after an action without resetting the draft", async () => {
    const currentRuntime = runtime();
    const initial = policy();
    const suspended = policy({ revision: 2, emergency_suspended: true });
    const getPolicy = vi
      .fn()
      .mockResolvedValueOnce({ policy: initial, etag: '"1"' })
      .mockResolvedValueOnce({ policy: suspended, etag: '"2"' });
    const getHealth = vi
      .fn()
      .mockResolvedValueOnce(health("healthy"))
      .mockResolvedValueOnce(health("unavailable"));
    const suspend = vi.fn().mockResolvedValue(suspended);
    const { result } = renderHook(() =>
      useManageExternalProvider({
        probeEnabled: false,
        open: true,
        runtimeContext: currentRuntime,
        getRuntimeContext: () => currentRuntime,
        client: { getPolicy, getHealth, suspend },
      }),
    );

    await waitFor(() => expect(result.current.policyStatus).toBe("ready"));
    act(() => result.current.setLimit("max_accounts", 7));
    act(() => result.current.suspend());

    await waitFor(() => expect(result.current.actionStatus).toBe("success"));
    await waitFor(() => expect(result.current.policyEtag).toBe('"2"'));
    await waitFor(() => expect(result.current.health?.status).toBe("unavailable"));
    expect(result.current.draft?.limits.max_accounts).toBe(7);
    expect(suspend).toHaveBeenCalledTimes(1);
  });

  it("applies the action response before a failed policy refresh", async () => {
    const currentRuntime = runtime();
    const initial = policy();
    const suspended = policy({ revision: 2, emergency_suspended: true });
    const getPolicy = vi
      .fn()
      .mockResolvedValueOnce({ policy: initial, etag: '"1"' })
      .mockRejectedValueOnce(new Error("refresh failed"));
    const getHealth = vi
      .fn()
      .mockResolvedValueOnce(health("healthy"))
      .mockResolvedValueOnce(health("unavailable"));
    const { result } = renderHook(() =>
      useManageExternalProvider({
        probeEnabled: false,
        open: true,
        runtimeContext: currentRuntime,
        getRuntimeContext: () => currentRuntime,
        client: {
          getPolicy,
          getHealth,
          suspend: vi.fn().mockResolvedValue(suspended),
        },
      }),
    );

    await waitFor(() => expect(result.current.policyStatus).toBe("ready"));
    act(() => result.current.setLimit("max_accounts", 7));
    act(() => result.current.suspend());

    await waitFor(() => expect(result.current.actionStatus).toBe("success"));
    await waitFor(() => expect(result.current.policyStatus).toBe("error"));
    expect(result.current.policy?.emergency_suspended).toBe(true);
    expect(result.current.policyEtag).toBeNull();
    expect(result.current.draft?.limits.max_accounts).toBe(7);
    await waitFor(() => expect(result.current.health?.status).toBe("unavailable"));
  });

  it("blocks an action synchronously when save acquired the mutation lock first", async () => {
    const currentRuntime = runtime();
    const updateResponse = deferred<{
      policy: WorkspaceExternalProviderPolicyDto;
      etag: string;
    }>();
    const updatePolicy = vi.fn().mockReturnValue(updateResponse.promise);
    const suspend = vi.fn().mockResolvedValue(policy({ emergency_suspended: true }));
    const { result } = renderHook(() =>
      useManageExternalProvider({
        probeEnabled: false,
        open: true,
        runtimeContext: currentRuntime,
        getRuntimeContext: () => currentRuntime,
        client: {
          getPolicy: vi.fn().mockResolvedValue({ policy: policy(), etag: '"1"' }),
          getHealth: vi.fn().mockResolvedValue(health()),
          updatePolicy,
          suspend,
        },
      }),
    );

    await waitFor(() => expect(result.current.policyStatus).toBe("ready"));
    act(() => result.current.setLimit("max_accounts", 5));
    act(() => {
      result.current.save();
      result.current.suspend();
    });

    expect(updatePolicy).toHaveBeenCalledTimes(1);
    expect(suspend).not.toHaveBeenCalled();
    updateResponse.resolve({
      policy: policy({
        revision: 2,
        limits: { ...policy().limits, max_accounts: 5 },
      }),
      etag: '"2"',
    });
    await waitFor(() => expect(result.current.saveStatus).toBe("saved"));
  });

  it("blocks save synchronously and while action refreshes when action acquired the lock first", async () => {
    const currentRuntime = runtime();
    const actionResponse = deferred<WorkspaceExternalProviderPolicyDto>();
    const refreshedPolicy = deferred<{
      policy: WorkspaceExternalProviderPolicyDto;
      etag: string;
    }>();
    const refreshedHealth = deferred<WorkspaceExternalProviderHealthDto>();
    const initial = policy();
    const suspended = policy({ revision: 2, emergency_suspended: true });
    const getPolicy = vi
      .fn()
      .mockResolvedValueOnce({ policy: initial, etag: '"1"' })
      .mockReturnValueOnce(refreshedPolicy.promise);
    const getHealth = vi
      .fn()
      .mockResolvedValueOnce(health())
      .mockReturnValueOnce(refreshedHealth.promise);
    const updatePolicy = vi.fn();
    const suspend = vi.fn().mockReturnValue(actionResponse.promise);
    const { result } = renderHook(() =>
      useManageExternalProvider({
        probeEnabled: false,
        open: true,
        runtimeContext: currentRuntime,
        getRuntimeContext: () => currentRuntime,
        client: { getPolicy, getHealth, updatePolicy, suspend },
      }),
    );

    await waitFor(() => expect(result.current.policyStatus).toBe("ready"));
    act(() => result.current.setLimit("max_accounts", 5));
    act(() => {
      result.current.suspend();
      result.current.save();
    });

    expect(suspend).toHaveBeenCalledTimes(1);
    expect(updatePolicy).not.toHaveBeenCalled();
    actionResponse.resolve(suspended);
    await waitFor(() => expect(result.current.policy?.emergency_suspended).toBe(true));
    expect(result.current.actionStatus).toBe("suspending");

    act(() => result.current.save());
    expect(updatePolicy).not.toHaveBeenCalled();

    refreshedPolicy.resolve({ policy: suspended, etag: '"2"' });
    refreshedHealth.resolve(health("unavailable"));
    await waitFor(() => expect(result.current.actionStatus).toBe("success"));
  });

  it("clears a pending save status on close and allows save after reopen", async () => {
    const currentRuntime = runtime();
    const pendingSave = deferred<{
      policy: WorkspaceExternalProviderPolicyDto;
      etag: string;
    }>();
    const updatePolicy = vi
      .fn()
      .mockReturnValueOnce(pendingSave.promise)
      .mockResolvedValueOnce({ policy: policy({ revision: 2 }), etag: '"2"' });
    const client: ManageExternalProviderClient = {
      getPolicy: vi.fn().mockResolvedValue({ policy: policy(), etag: '"1"' }),
      getHealth: vi.fn().mockResolvedValue(health()),
      updatePolicy,
    };
    const { result, rerender } = renderHook(
      ({ open }) =>
        useManageExternalProvider({
          probeEnabled: false,
          open,
          runtimeContext: currentRuntime,
          getRuntimeContext: () => currentRuntime,
          client,
        }),
      { initialProps: { open: true } },
    );

    await waitFor(() => expect(result.current.policyStatus).toBe("ready"));
    act(() => result.current.setLimit("max_accounts", 5));
    act(() => result.current.save());
    expect(result.current.saveStatus).toBe("saving");

    rerender({ open: false });
    await waitFor(() => expect(result.current.saveStatus).toBe("idle"));
    rerender({ open: true });
    await waitFor(() => expect(result.current.policyStatus).toBe("ready"));
    act(() => result.current.save());

    await waitFor(() => expect(updatePolicy).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.saveStatus).toBe("saved"));
  });

  it("clears a pending action status on close and allows an action after reopen", async () => {
    const currentRuntime = runtime();
    const pendingAction = deferred<WorkspaceExternalProviderPolicyDto>();
    const suspended = policy({ revision: 2, emergency_suspended: true });
    const suspend = vi
      .fn()
      .mockReturnValueOnce(pendingAction.promise)
      .mockResolvedValueOnce(suspended);
    const client: ManageExternalProviderClient = {
      getPolicy: vi.fn().mockResolvedValue({ policy: policy(), etag: '"1"' }),
      getHealth: vi.fn().mockResolvedValue(health()),
      suspend,
    };
    const { result, rerender } = renderHook(
      ({ open }) =>
        useManageExternalProvider({
          probeEnabled: false,
          open,
          runtimeContext: currentRuntime,
          getRuntimeContext: () => currentRuntime,
          client,
        }),
      { initialProps: { open: true } },
    );

    await waitFor(() => expect(result.current.policyStatus).toBe("ready"));
    act(() => result.current.suspend());
    expect(result.current.actionStatus).toBe("suspending");

    rerender({ open: false });
    await waitFor(() => expect(result.current.actionStatus).toBe("idle"));
    rerender({ open: true });
    await waitFor(() => expect(result.current.policyStatus).toBe("ready"));
    act(() => result.current.suspend());

    await waitFor(() => expect(suspend).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.actionStatus).toBe("success"));
  });

  it("blocks save when a manual policy refresh starts in the same tick", async () => {
    const currentRuntime = runtime();
    const manualRefresh = deferred<{
      policy: WorkspaceExternalProviderPolicyDto;
      etag: string;
    }>();
    const getPolicy = vi
      .fn()
      .mockResolvedValueOnce({ policy: policy(), etag: '"1"' })
      .mockReturnValueOnce(manualRefresh.promise);
    const updatePolicy = vi.fn();
    const { result } = renderHook(() =>
      useManageExternalProvider({
        probeEnabled: false,
        open: true,
        runtimeContext: currentRuntime,
        getRuntimeContext: () => currentRuntime,
        client: {
          getPolicy,
          getHealth: vi.fn().mockResolvedValue(health()),
          updatePolicy,
        },
      }),
    );

    await waitFor(() => expect(result.current.policyStatus).toBe("ready"));
    act(() => result.current.setLimit("max_accounts", 5));
    act(() => {
      result.current.refreshPolicy();
      result.current.save();
    });

    expect(getPolicy).toHaveBeenCalledTimes(2);
    expect(updatePolicy).not.toHaveBeenCalled();
    manualRefresh.resolve({ policy: policy({ revision: 2 }), etag: '"2"' });
    await waitFor(() => expect(result.current.policyEtag).toBe('"2"'));
  });

  it("blocks a manual policy refresh when save starts in the same tick", async () => {
    const currentRuntime = runtime();
    const saveResponse = deferred<{
      policy: WorkspaceExternalProviderPolicyDto;
      etag: string;
    }>();
    const getPolicy = vi.fn().mockResolvedValue({ policy: policy(), etag: '"1"' });
    const updatePolicy = vi.fn().mockReturnValue(saveResponse.promise);
    const { result } = renderHook(() =>
      useManageExternalProvider({
        probeEnabled: false,
        open: true,
        runtimeContext: currentRuntime,
        getRuntimeContext: () => currentRuntime,
        client: {
          getPolicy,
          getHealth: vi.fn().mockResolvedValue(health()),
          updatePolicy,
        },
      }),
    );

    await waitFor(() => expect(result.current.policyStatus).toBe("ready"));
    act(() => result.current.setLimit("max_accounts", 5));
    act(() => {
      result.current.save();
      result.current.refreshPolicy();
    });

    expect(updatePolicy).toHaveBeenCalledTimes(1);
    expect(getPolicy).toHaveBeenCalledTimes(1);
    saveResponse.resolve({ policy: policy({ revision: 2 }), etag: '"2"' });
    await waitFor(() => expect(result.current.saveStatus).toBe("saved"));
  });

  it("mutually blocks manual policy refresh and action in both same-tick orders", async () => {
    const currentRuntime = runtime();
    const manualRefresh = deferred<{
      policy: WorkspaceExternalProviderPolicyDto;
      etag: string;
    }>();
    const actionResponse = deferred<WorkspaceExternalProviderPolicyDto>();
    const getPolicy = vi
      .fn()
      .mockResolvedValueOnce({ policy: policy(), etag: '"1"' })
      .mockReturnValueOnce(manualRefresh.promise)
      .mockResolvedValue({ policy: policy({ emergency_suspended: true }), etag: '"2"' });
    const suspend = vi.fn().mockReturnValue(actionResponse.promise);
    const { result } = renderHook(() =>
      useManageExternalProvider({
        probeEnabled: false,
        open: true,
        runtimeContext: currentRuntime,
        getRuntimeContext: () => currentRuntime,
        client: {
          getPolicy,
          getHealth: vi.fn().mockResolvedValue(health()),
          suspend,
        },
      }),
    );

    await waitFor(() => expect(result.current.policyStatus).toBe("ready"));
    act(() => {
      result.current.refreshPolicy();
      result.current.suspend();
    });
    expect(suspend).not.toHaveBeenCalled();

    manualRefresh.resolve({ policy: policy(), etag: '"1b"' });
    await waitFor(() => expect(result.current.policyEtag).toBe('"1b"'));
    act(() => {
      result.current.suspend();
      result.current.refreshPolicy();
    });
    expect(suspend).toHaveBeenCalledTimes(1);
    expect(getPolicy).toHaveBeenCalledTimes(2);

    actionResponse.resolve(policy({ revision: 2, emergency_suspended: true }));
    await waitFor(() => expect(result.current.actionStatus).toBe("success"));
    expect(getPolicy).toHaveBeenCalledTimes(3);
  });
});

describe("useManageExternalProvider runtime safety", () => {
  it("aborts detail requests when the modal closes", async () => {
    const currentRuntime = runtime();
    const observedSignals: AbortSignal[] = [];
    const pendingPolicy = deferred<{
      policy: WorkspaceExternalProviderPolicyDto;
      etag: string;
    }>();
    const client: ManageExternalProviderClient = {
      getPolicy: vi.fn((options) => {
        if (options.signal != null) observedSignals.push(options.signal);
        return pendingPolicy.promise;
      }),
      getHealth: vi.fn((options) => {
        if (options.signal != null) observedSignals.push(options.signal);
        return new Promise<WorkspaceExternalProviderHealthDto>(() => {
          // Kept pending until closing the modal aborts its signal.
        });
      }),
    };
    const { rerender } = renderHook(
      ({ open }) =>
        useManageExternalProvider({
          probeEnabled: false,
          open,
          runtimeContext: currentRuntime,
          getRuntimeContext: () => currentRuntime,
          client,
        }),
      { initialProps: { open: true } },
    );

    await waitFor(() => expect(observedSignals).toHaveLength(2));
    rerender({ open: false });

    expect(observedSignals.every((signal) => signal.aborted)).toBe(true);
  });

  it("does not apply an A response after switching to B", async () => {
    const responseA = deferred<{ policy: WorkspaceExternalProviderPolicyDto; etag: string }>();
    let currentRuntime = runtime("project-a", 1);
    const client: ManageExternalProviderClient = {
      getPolicy: vi.fn((options) => {
        if (options.accessToken.includes("project-a")) return responseA.promise;
        return Promise.resolve({
          policy: policy({ uuid: "policy-b" }),
          etag: '"b"',
        });
      }),
      getHealth: vi.fn().mockResolvedValue(health()),
    };
    const { result, rerender } = renderHook(
      ({ context }) =>
        useManageExternalProvider({
          probeEnabled: false,
          open: true,
          runtimeContext: context,
          getRuntimeContext: () => currentRuntime,
          client,
        }),
      { initialProps: { context: currentRuntime } },
    );

    currentRuntime = runtime("project-b", 2);
    rerender({ context: currentRuntime });
    await waitFor(() => expect(result.current.policyEtag).toBe('"b"'));

    responseA.resolve({ policy: policy({ uuid: "late-policy-a" }), etag: '"a"' });
    await act(async () => {
      await responseA.promise;
    });

    expect(result.current.policy?.uuid).toBe("policy-b");
    expect(result.current.policyEtag).toBe('"b"');
  });

  it("does not apply the first A response after A to B to a new A generation", async () => {
    const oldA = deferred<{ policy: WorkspaceExternalProviderPolicyDto; etag: string }>();
    let currentRuntime = runtime("project-a", 1);
    const getPolicy = vi.fn((options: MessengerClientOptions) => {
      const accessToken = options.accessToken ?? "";
      if (accessToken.endsWith("-1")) return oldA.promise;
      if (accessToken.includes("project-b")) {
        return Promise.resolve({ policy: policy({ uuid: "policy-b" }), etag: '"b"' });
      }
      return Promise.resolve({ policy: policy({ uuid: "policy-new-a" }), etag: '"new-a"' });
    });
    const client: ManageExternalProviderClient = {
      getPolicy,
      getHealth: vi.fn().mockResolvedValue(health()),
    };
    const { result, rerender } = renderHook(
      ({ context }) =>
        useManageExternalProvider({
          probeEnabled: false,
          open: true,
          runtimeContext: context,
          getRuntimeContext: () => currentRuntime,
          client,
        }),
      { initialProps: { context: currentRuntime } },
    );

    currentRuntime = runtime("project-b", 2);
    rerender({ context: currentRuntime });
    await waitFor(() => expect(result.current.policyEtag).toBe('"b"'));
    currentRuntime = runtime("project-a", 3);
    rerender({ context: currentRuntime });
    await waitFor(() => expect(result.current.policyEtag).toBe('"new-a"'));

    oldA.resolve({ policy: policy({ uuid: "late-old-a" }), etag: '"old-a"' });
    await act(async () => {
      await oldA.promise;
    });

    expect(result.current.policy?.uuid).toBe("policy-new-a");
    expect(result.current.policyEtag).toBe('"new-a"');
  });
});
