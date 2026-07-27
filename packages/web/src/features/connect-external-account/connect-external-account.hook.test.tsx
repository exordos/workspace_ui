import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { refreshExternalAccounts } from "~/entities/external-account/external-account-sync.lib";
import { useExternalAccountStore } from "~/entities/external-account/external-account.model";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import {
  createExternalAccount,
  getExternalAccount,
  reconnectExternalAccount,
} from "~/shared/api/messenger-external-accounts.api";
import { MessengerApiError } from "~/shared/api/messenger-transport.internal";
import { useConnectExternalAccount } from "./connect-external-account.hook";

vi.mock("~/entities/external-account/external-account-sync.lib", () => ({
  refreshExternalAccounts: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("~/shared/api/messenger-external-accounts.api", () => ({
  createExternalAccount: vi.fn(),
  getExternalAccount: vi.fn(),
  reconnectExternalAccount: vi.fn(),
}));

const runtimeContext: WorkspaceRuntimeContext = {
  accountId: "workspace-account",
  instanceId: "instance-1",
  organizationId: "organization-1",
  projectId: "project-1",
  userUuid: "user-1",
  organizationOrigin: "https://workspace.example.com",
  accessToken: "test",
  runtimeGeneration: 1,
};

function snapshot(
  uuid = "external-account-1",
  status: "live" | "connecting" = "live",
  liveReady = status === "live",
) {
  return {
    account: {
      uuid,
      settings: {
        kind: "zulip" as const,
        server_url: "https://zulip.example.com",
        email: "user@example.com",
        selection_mode: "explicit" as const,
        history_depth: "30_days" as const,
        default_project_id: "project-1",
      },
      credential_present: true,
      status,
      live_ready: liveReady,
      capabilities: {},
      safe_error: null,
      desired_generation: 1,
      applied_generation: 1,
      last_progress_at: null,
      revision: 1,
      created_at: "2026-07-23T10:00:00Z",
      updated_at: "2026-07-23T10:00:00Z",
    },
    etag: '"1"',
  };
}

describe("useConnectExternalAccount", () => {
  afterEach(() => {
    vi.clearAllMocks();
    useExternalAccountStore.getState().clear();
  });

  it("creates an explicit 30-day connection in the current project and clears the key", async () => {
    vi.mocked(createExternalAccount).mockResolvedValue(snapshot());
    const randomUuid = vi
      .spyOn(crypto, "randomUUID")
      .mockReturnValue("10000000-0000-4000-8000-000000000001");
    const onCompleted = vi.fn();
    const { result } = renderHook(() =>
      useConnectExternalAccount({ open: true, runtimeContext, onCompleted }),
    );

    act(() => {
      result.current.setServerUrl("https://zulip.example.com");
      result.current.setEmail("user@example.com");
      result.current.setApiKey("test");
    });
    act(() => {
      result.current.submit();
    });

    await waitFor(() => expect(createExternalAccount).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createExternalAccount).mock.calls[0]?.[1]).toEqual({
      uuid: "10000000-0000-4000-8000-000000000001",
      settings: {
        kind: "zulip",
        server_url: "https://zulip.example.com",
        email: "user@example.com",
        api_key: "test",
        selection_mode: "explicit",
        history_depth: "30_days",
        default_project_id: "project-1",
      },
    });
    await waitFor(() => expect(result.current.draft.apiKey).toBe(""));
    await waitFor(() => expect(onCompleted).toHaveBeenCalledTimes(1));
    expect(randomUuid).toHaveBeenCalledTimes(1);
    expect(refreshExternalAccounts).toHaveBeenCalled();
  });

  it("reconnects an existing account with its ETag", async () => {
    const reconnectAccount = {
      uuid: "external-account-1",
      provider: "zulip" as const,
      settings: {
        kind: "zulip" as const,
        serverUrl: "https://zulip.example.com",
        email: "old@example.com",
        selectionMode: "explicit" as const,
        historyDepth: "30_days" as const,
        defaultProjectId: "project-1",
      },
      credentialPresent: true,
      status: "auth_required" as const,
      liveReady: false,
      capabilities: {},
      safeError: null,
      desiredGeneration: 1,
      appliedGeneration: 0,
      lastProgressAt: null,
      revision: 3,
      etag: '"3"',
      createdAt: "2026-07-23T10:00:00Z",
      updatedAt: "2026-07-23T10:00:00Z",
    };
    vi.mocked(reconnectExternalAccount).mockResolvedValue(snapshot());
    const onCompleted = vi.fn();
    const { result } = renderHook(() =>
      useConnectExternalAccount({ open: true, runtimeContext, reconnectAccount, onCompleted }),
    );

    act(() => {
      result.current.setEmail("new@example.com");
      result.current.setApiKey("changed");
    });
    act(() => {
      result.current.submit();
    });

    await waitFor(() => expect(reconnectExternalAccount).toHaveBeenCalledTimes(1));
    expect(vi.mocked(reconnectExternalAccount).mock.calls[0]?.slice(1)).toEqual([
      "external-account-1",
      {
        settings: {
          kind: "zulip",
          server_url: "https://zulip.example.com",
          email: "new@example.com",
          api_key: "changed",
        },
      },
      '"3"',
    ]);
    await waitFor(() => expect(onCompleted).toHaveBeenCalledTimes(1));
  });

  it("maps an external resource 403 to the forbidden connection error", async () => {
    vi.mocked(createExternalAccount).mockRejectedValue(
      new MessengerApiError("Forbidden", 403, {
        type: "ExternalResourceForbiddenError",
        code: 403,
        message: "External resource access is forbidden",
      }),
    );
    const onCompleted = vi.fn();
    const { result } = renderHook(() =>
      useConnectExternalAccount({ open: true, runtimeContext, onCompleted }),
    );

    act(() => {
      result.current.setServerUrl("https://zulip.example.com");
      result.current.setEmail("user@example.com");
      result.current.setApiKey("test");
    });
    act(() => result.current.submit());

    await waitFor(() => expect(result.current.error).toBe("forbidden"));
    expect(onCompleted).not.toHaveBeenCalled();
  });

  it("temporarily completes after an accepted connecting response without polling", async () => {
    const connecting = snapshot("external-account-1", "connecting", false);
    vi.mocked(createExternalAccount).mockResolvedValue(connecting);
    const onCompleted = vi.fn();
    const { result } = renderHook(() =>
      useConnectExternalAccount({ open: true, runtimeContext, onCompleted }),
    );

    act(() => {
      result.current.setServerUrl("https://zulip.example.com");
      result.current.setEmail("user@example.com");
      result.current.setApiKey("test");
    });
    act(() => result.current.submit());

    await waitFor(() => expect(onCompleted).toHaveBeenCalledTimes(1));
    expect(result.current.lifecycleAccount).toMatchObject({
      status: "connecting",
      liveReady: false,
    });
    expect(getExternalAccount).not.toHaveBeenCalled();
  });
});
