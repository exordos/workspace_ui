import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExternalAccount } from "~/entities/external-account/external-account.types";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import type { WorkspaceExternalChatDto } from "~/shared/api/messenger-external-accounts.types";
import { useExternalAccountSync } from "./manage-external-account.hook";
import { ManageExternalAccount } from "./manage-external-account.ui";

vi.mock("./manage-external-account.hook", () => ({
  useExternalAccountSync: vi.fn(),
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

const account = {
  uuid: "33333333-3333-4333-8333-333333333333",
  serverUrl: "https://zulip.example.com",
  email: "user@example.com",
  accountType: "zulip",
  selectionMode: "explicit",
  historyDepth: "30_days",
  defaultProjectId: runtimeContext.projectId,
  credentialPresent: true,
  status: "live",
  liveReady: true,
  capabilities: {},
  safeError: null,
  desiredGeneration: 1,
  appliedGeneration: 1,
  lastProgressAt: null,
  revision: 1,
  createdAt: "2026-07-22T10:00:00Z",
  updatedAt: "2026-07-22T10:00:00Z",
} satisfies ExternalAccount;

const chat = {
  uuid: "44444444-4444-4444-8444-444444444444",
  external_account_uuid: account.uuid,
  source: { kind: "zulip", chat_type: "channel", original_url: null },
  display_name: "Engineering",
  selected: false,
  project_id: null,
  history_depth: "30_days",
  projection_stream_uuid: null,
  status: "available",
  capabilities: {},
  safe_error: null,
  transition_pending: false,
  revision: 1,
  created_at: "2026-07-22T10:00:00Z",
  updated_at: "2026-07-22T10:00:00Z",
} satisfies WorkspaceExternalChatDto;

function viewModel(overrides: Partial<ReturnType<typeof useExternalAccountSync>> = {}) {
  return {
    chats: [chat],
    selectionMode: "explicit" as const,
    historyDepth: "30_days" as const,
    loadingChats: false,
    savingSettings: false,
    changingChatUuid: null,
    saved: false,
    error: null,
    setSelectionMode: vi.fn(),
    setHistoryDepth: vi.fn(),
    saveSettings: vi.fn(),
    toggleChat: vi.fn(),
    reloadChats: vi.fn(),
    ...overrides,
  };
}

describe("ManageExternalAccount", () => {
  beforeEach(() => {
    vi.mocked(useExternalAccountSync).mockReturnValue(viewModel());
  });

  it("exposes synchronization mode, history depth, and individual chat selection", () => {
    const vm = viewModel();
    vi.mocked(useExternalAccountSync).mockReturnValue(vm);

    render(<ManageExternalAccount runtimeContext={runtimeContext} account={account} />);

    fireEvent.change(screen.getByLabelText("Chats to synchronize"), {
      target: { value: "all" },
    });
    fireEvent.change(screen.getByLabelText("History depth"), { target: { value: "7_days" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /engineering/i }));
    fireEvent.click(screen.getByRole("button", { name: "Save synchronization settings" }));

    expect(vm.setSelectionMode).toHaveBeenCalledWith("all");
    expect(vm.setHistoryDepth).toHaveBeenCalledWith("7_days");
    expect(vm.toggleChat).toHaveBeenCalledWith(chat);
    expect(vm.saveSettings).toHaveBeenCalledTimes(1);
  });

  it("explains automatic selection and disables individual switches in all mode", () => {
    vi.mocked(useExternalAccountSync).mockReturnValue(viewModel({ selectionMode: "all" }));

    render(<ManageExternalAccount runtimeContext={runtimeContext} account={account} />);

    expect(screen.getByText(/new chats discovered in zulip/i)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /engineering/i })).toBeDisabled();
  });
});
