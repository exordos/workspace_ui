import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  WorkspaceExternalProviderHealthDto,
  WorkspaceExternalProviderPolicyDto,
} from "~/shared/api/messenger-external-provider-admin.types";
import { renderWithProviders } from "~/test/render";
import { ManageExternalProviderForm } from "./manage-external-provider-form.ui";
import type { UseManageExternalProviderResult } from "./manage-external-provider.hook";

vi.mock("~/i18n/i18n", () => ({
  getLocale: () => "en",
  t: (key: string) => key,
}));

const policy: WorkspaceExternalProviderPolicyDto = {
  uuid: "provider-policy-1",
  created_at: "2026-07-20T10:00:00Z",
  updated_at: "2026-07-24T10:00:00Z",
  revision: 3,
  provider: "zulip",
  enabled: true,
  emergency_suspended: false,
  limits: {
    max_accounts: 2,
    max_selected_chats_per_account: 20,
    max_file_bytes: 52_428_801,
  },
  custom_ca_bundle: null,
};

const health: WorkspaceExternalProviderHealthDto = {
  provider: "zulip",
  status: "healthy",
  account_counts: { live: 2, unknown_account_status: 55 },
  chat_counts: { available: 4, live: 3 },
  bridge_counts: { active: 1 },
  operation_counts: { succeeded: 8 },
  metrics: {
    queue_depth: 999,
    selected_chats: 3,
    synchronized_messages: 9_586,
    synchronized_users: 25,
  },
  updated_at: "2026-07-24T10:10:00Z",
};

function createVm(
  overrides: Partial<UseManageExternalProviderResult> = {},
): UseManageExternalProviderResult {
  return {
    accessStatus: "allowed",
    accessError: null,
    policyStatus: "ready",
    policyError: null,
    policy,
    policyEtag: '"3"',
    draft: {
      enabled: policy.enabled,
      limits: { ...policy.limits },
    },
    healthStatus: "ready",
    healthError: null,
    health,
    saveStatus: "idle",
    saveError: null,
    actionStatus: "idle",
    actionError: null,
    setEnabled: vi.fn(),
    setLimit: vi.fn(),
    probeAccess: vi.fn(),
    refreshPolicy: vi.fn(),
    refreshHealth: vi.fn(),
    resetDraft: vi.fn(),
    save: vi.fn(),
    suspend: vi.fn(),
    resume: vi.fn(),
    resetOperationState: vi.fn(),
    ...overrides,
  };
}

describe("ManageExternalProviderForm", () => {
  it("shows policy loading and supports retry after a policy load error", () => {
    const loadingVm = createVm({
      policyStatus: "loading",
      policy: null,
      policyEtag: null,
      draft: null,
    });
    const { rerender } = renderWithProviders(<ManageExternalProviderForm vm={loadingVm} />);

    expect(screen.getByRole("status")).toHaveTextContent("manageExternalProvider.loadingPolicy");

    const errorVm = createVm({
      policyStatus: "error",
      policyError: "load_policy",
      policy: null,
      policyEtag: null,
      draft: null,
    });
    rerender(<ManageExternalProviderForm vm={errorVm} />);
    fireEvent.click(screen.getByRole("button", { name: "common.retry" }));

    expect(errorVm.refreshPolicy).toHaveBeenCalledOnce();
  });

  it("keeps the policy form usable when health fails and retries health independently", () => {
    const vm = createVm({
      healthStatus: "error",
      healthError: "load_health",
      health: null,
    });
    renderWithProviders(<ManageExternalProviderForm vm={vm} />);

    expect(
      screen.getByRole("switch", { name: "manageExternalProvider.enabled.label" }),
    ).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "common.retry" }));

    expect(vm.refreshHealth).toHaveBeenCalledOnce();
    expect(vm.refreshPolicy).not.toHaveBeenCalled();
  });

  it("validates integer bounds and converts an edited MiB value to bytes", () => {
    const vm = createVm();
    renderWithProviders(<ManageExternalProviderForm vm={vm} />);

    const accounts = screen.getByLabelText("manageExternalProvider.limits.maxAccounts");
    const fileSize = screen.getByRole("spinbutton", {
      name: /manageExternalProvider\.limits\.maxFileSize/,
    });
    const save = screen.getByRole("button", { name: "common.save" });

    expect(fileSize).toHaveValue(policy.limits.max_file_bytes / (1024 * 1024));
    expect(save).toBeDisabled();

    fireEvent.change(accounts, { target: { value: "2.5" } });
    expect(accounts).toHaveAttribute("aria-invalid", "true");
    expect(vm.setLimit).not.toHaveBeenCalledWith("max_accounts", expect.anything());

    fireEvent.change(accounts, { target: { value: "3" } });
    expect(vm.setLimit).toHaveBeenCalledWith("max_accounts", 3);

    fireEvent.change(fileSize, { target: { value: "64" } });
    expect(vm.setLimit).toHaveBeenCalledWith("max_file_bytes", 67_108_864);
  });

  it("blocks policy saving when custom CA metadata is present", () => {
    const caPolicy: WorkspaceExternalProviderPolicyDto = {
      ...policy,
      custom_ca_bundle: {
        uuid: "ca-bundle-1",
        generation: 2,
        sha256: "a".repeat(64),
        certificate_count: 3,
      },
    };
    const vm = createVm({
      policy: caPolicy,
      draft: {
        enabled: false,
        limits: { ...caPolicy.limits },
      },
    });
    renderWithProviders(<ManageExternalProviderForm vm={vm} />);

    expect(screen.getByText("manageExternalProvider.ca.saveBlocked")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "common.save" })).toBeDisabled();
    expect(screen.getByText("a".repeat(64))).toBeInTheDocument();
  });

  it("preserves the draft after a conflict until the user chooses an action", () => {
    const vm = createVm({
      saveStatus: "conflict",
      saveError: "conflict",
      draft: { enabled: false, limits: { ...policy.limits } },
    });
    renderWithProviders(<ManageExternalProviderForm vm={vm} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "manageExternalProvider.conflict.keepDraft",
      }),
    );
    expect(vm.resetOperationState).toHaveBeenCalledOnce();
    expect(vm.resetDraft).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", {
        name: "manageExternalProvider.conflict.loadCurrent",
      }),
    );
    expect(vm.resetDraft).toHaveBeenCalledOnce();
  });

  it("requires confirmation before suspend and exposes resume explicitly", () => {
    const vm = createVm();
    const { rerender } = renderWithProviders(<ManageExternalProviderForm vm={vm} />);

    fireEvent.click(screen.getByRole("button", { name: "manageExternalProvider.danger.suspend" }));
    expect(vm.suspend).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    const confirmButton = screen.getByRole("button", {
      name: "manageExternalProvider.danger.confirmSuspend",
    });
    expect(confirmButton).toHaveFocus();

    fireEvent.click(confirmButton);
    expect(vm.suspend).toHaveBeenCalledOnce();

    const suspendedPolicy = { ...policy, emergency_suspended: true };
    const suspendedVm = createVm({
      policy: suspendedPolicy,
      draft: {
        enabled: suspendedPolicy.enabled,
        limits: { ...suspendedPolicy.limits },
      },
    });
    rerender(<ManageExternalProviderForm vm={suspendedVm} />);
    fireEvent.click(screen.getByRole("button", { name: "manageExternalProvider.danger.resume" }));
    expect(suspendedVm.resume).toHaveBeenCalledOnce();
  });

  it("mutually disables policy saving and emergency actions while either request is pending", () => {
    const savingVm = createVm({
      saveStatus: "saving",
      draft: { enabled: false, limits: { ...policy.limits } },
    });
    const { rerender } = renderWithProviders(<ManageExternalProviderForm vm={savingVm} />);

    expect(
      screen.getByRole("button", { name: "manageExternalProvider.danger.suspend" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("switch", { name: "manageExternalProvider.enabled.label" }),
    ).toBeDisabled();
    expect(screen.getByLabelText("manageExternalProvider.limits.maxAccounts")).toBeDisabled();
    expect(screen.getByRole("button", { name: "manageExternalProvider.refresh" })).toBeDisabled();

    const actionVm = createVm({
      actionStatus: "suspending",
      draft: { enabled: false, limits: { ...policy.limits } },
    });
    rerender(<ManageExternalProviderForm vm={actionVm} />);

    expect(screen.getByRole("button", { name: "common.save" })).toBeDisabled();
    expect(
      screen.getByRole("switch", { name: "manageExternalProvider.enabled.label" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "manageExternalProvider.refresh" })).toBeDisabled();
  });

  it("locks policy mutations while the current policy is refreshing", () => {
    const vm = createVm({
      policyStatus: "loading",
      draft: { enabled: false, limits: { ...policy.limits } },
    });
    renderWithProviders(<ManageExternalProviderForm vm={vm} />);

    expect(screen.getByRole("button", { name: "common.save" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "manageExternalProvider.danger.suspend" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("switch", { name: "manageExternalProvider.enabled.label" }),
    ).toBeDisabled();
  });

  it("renders known aggregate and metric rows", () => {
    renderWithProviders(<ManageExternalProviderForm vm={createVm()} />);
    const healthSection = within(
      screen.getByRole("region", { name: "manageExternalProvider.health.title" }),
    );

    expect(healthSection.getByText("Zulip")).toBeInTheDocument();
    expect(healthSection.getByText("manageExternalProvider.health.healthy")).toHaveClass(
      "bg-call-green/10",
      "text-call-green",
    );
    expect(
      screen.getByText("manageExternalProvider.health.status.account.live"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("manageExternalProvider.health.status.chat.available"),
    ).toBeInTheDocument();
    expect(screen.getByText("manageExternalProvider.health.status.chat.live")).toBeInTheDocument();
    expect(
      screen.getByText("manageExternalProvider.health.status.bridge.active"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("manageExternalProvider.health.status.operation.succeeded"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("manageExternalProvider.health.status.metric.queue_depth"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("manageExternalProvider.health.status.metric.selected_chats"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("manageExternalProvider.health.status.metric.synchronized_messages"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("manageExternalProvider.health.status.metric.synchronized_users"),
    ).toBeInTheDocument();
    expect(screen.queryByText("55")).not.toBeInTheDocument();
    expect(screen.getByText("999")).toBeInTheDocument();
  });

  it("renders an unavailable provider status as a danger badge", () => {
    renderWithProviders(
      <ManageExternalProviderForm
        vm={createVm({
          health: { ...health, status: "unavailable" },
        })}
      />,
    );
    const healthSection = within(
      screen.getByRole("region", { name: "manageExternalProvider.health.title" }),
    );

    expect(healthSection.getByText("manageExternalProvider.health.unavailable")).toHaveClass(
      "bg-danger/10",
      "text-danger",
    );
  });
});
