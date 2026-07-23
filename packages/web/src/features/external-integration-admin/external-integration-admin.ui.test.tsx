import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { useExternalIntegrationAdmin } from "./external-integration-admin.hook";
import { ExternalIntegrationAdminPanel } from "./external-integration-admin.ui";

vi.mock("./external-integration-admin.hook", () => ({
  useExternalIntegrationAdmin: vi.fn(),
}));

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

function viewModel(overrides: Partial<ReturnType<typeof useExternalIntegrationAdmin>> = {}) {
  return {
    status: "ready" as const,
    policy,
    health: {
      provider: "zulip" as const,
      status: "healthy",
      account_counts: { live: 1 },
      chat_counts: { live: 3, syncing: 1 },
      bridge_counts: { active: 1 },
      operation_counts: {},
      metrics: {
        queue_depth: 0,
        selected_chats: 4,
        synchronized_messages: 128,
        synchronized_users: 33,
      },
      updated_at: "2026-07-22T10:00:00Z",
    },
    draft: {
      enabled: true,
      maxAccounts: 50,
      maxSelectedChatsPerAccount: 500,
      maxFileMib: 100,
    },
    saving: false,
    changingSuspension: false,
    saved: false,
    error: null,
    updateDraft: vi.fn(),
    save: vi.fn(),
    changeSuspension: vi.fn(),
    reload: vi.fn(),
    ...overrides,
  };
}

describe("ExternalIntegrationAdminPanel", () => {
  beforeEach(() => {
    vi.mocked(useExternalIntegrationAdmin).mockReturnValue(viewModel());
  });

  it("renders policy limits, aggregate health, and emergency controls", () => {
    const vm = viewModel();
    vi.mocked(useExternalIntegrationAdmin).mockReturnValue(vm);

    render(<ExternalIntegrationAdminPanel runtimeContext={runtimeContext} />);

    expect(screen.getByText("healthy")).toBeInTheDocument();
    expect(screen.getByText("live: 1")).toBeInTheDocument();
    expect(screen.getByText("live: 3 · syncing: 1")).toBeInTheDocument();
    expect(screen.getByText("active: 1")).toBeInTheDocument();
    expect(screen.getByText("128")).toBeInTheDocument();
    expect(screen.getByText("33")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Maximum accounts"), { target: { value: "75" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(screen.getByRole("button", { name: "Emergency suspend" }));

    expect(vm.updateDraft).toHaveBeenCalledWith({ maxAccounts: 75 });
    expect(vm.save).toHaveBeenCalledTimes(1);
    expect(vm.changeSuspension).toHaveBeenCalledTimes(1);
  });

  it("stays hidden when the user does not have admin permissions", () => {
    vi.mocked(useExternalIntegrationAdmin).mockReturnValue(
      viewModel({ status: "denied", policy: null, health: null, draft: null }),
    );

    const { container } = render(<ExternalIntegrationAdminPanel runtimeContext={runtimeContext} />);

    expect(container).toBeEmptyDOMElement();
  });
});
