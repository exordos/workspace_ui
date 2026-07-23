import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { MessengerApiError } from "~/shared/api/messenger-transport.internal";
import { useExternalIntegrationAdmin } from "./external-integration-admin.hook";

const apiMocks = vi.hoisted(() => ({
  getExternalProviderPolicy: vi.fn(),
  getExternalProviderHealth: vi.fn(),
  updateExternalProviderPolicy: vi.fn(),
  changeExternalProviderSuspension: vi.fn(),
}));

vi.mock("~/shared/api/messenger-external-accounts.api", () => apiMocks);

const runtimeContext = {
  accountId: "account-1",
  instanceId: "instance-1",
  organizationId: "organization-1",
  organizationOrigin: "https://workspace.example.com",
  projectId: "22222222-2222-4222-8222-222222222222",
  userUuid: "11111111-1111-4111-8111-111111111111",
  accessToken: "access-token",
  runtimeGeneration: 1,
} satisfies WorkspaceRuntimeContext;

const policy = {
  uuid: "55555555-5555-4555-8555-555555555555",
  provider: "zulip" as const,
  enabled: true,
  emergency_suspended: false,
  limits: {
    max_accounts: 50,
    max_selected_chats_per_account: 500,
    max_file_bytes: 104857600,
  },
  custom_ca_bundle: null,
  revision: 2,
  created_at: "2026-07-22T10:00:00Z",
  updated_at: "2026-07-22T10:00:00Z",
};

const health = {
  provider: "zulip" as const,
  status: "healthy",
  account_counts: { live: 1 },
  chat_counts: { live: 2 },
  bridge_counts: { active: 1 },
  operation_counts: {},
  metrics: { queue_depth: 0 },
  updated_at: "2026-07-22T10:00:00Z",
};

describe("useExternalIntegrationAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.getExternalProviderPolicy.mockResolvedValue({ policy, etag: '"2"' });
    apiMocks.getExternalProviderHealth.mockResolvedValue(health);
    apiMocks.updateExternalProviderPolicy.mockResolvedValue({
      policy: { ...policy, revision: 3 },
      etag: '"3"',
    });
    apiMocks.changeExternalProviderSuspension.mockResolvedValue({
      policy: { ...policy, emergency_suspended: true, revision: 3 },
      etag: '"3"',
    });
  });

  it("loads policy and health, then persists edited limits with ETag", async () => {
    const { result } = renderHook(() => useExternalIntegrationAdmin(runtimeContext));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    act(() => result.current.updateDraft({ maxAccounts: 75 }));
    act(() => result.current.save());

    await waitFor(() => expect(result.current.saved).toBe(true));
    expect(apiMocks.updateExternalProviderPolicy).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: runtimeContext.projectId }),
      {
        settings: {
          kind: "zulip",
          enabled: true,
          limits: {
            max_accounts: 75,
            max_selected_chats_per_account: 500,
            max_file_bytes: 104857600,
          },
          custom_ca_bundle: null,
        },
      },
      '"2"',
    );
  });

  it("hides the panel after a permission-denied policy request", async () => {
    apiMocks.getExternalProviderPolicy.mockRejectedValue(
      new MessengerApiError("forbidden", 403, null),
    );

    const { result } = renderHook(() => useExternalIntegrationAdmin(runtimeContext));

    await waitFor(() => expect(result.current.status).toBe("denied"));
  });
});
