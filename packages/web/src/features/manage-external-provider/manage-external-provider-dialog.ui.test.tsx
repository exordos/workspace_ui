import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceExternalProviderPolicyDto } from "~/shared/api/messenger-external-provider-admin.types";
import { renderWithProviders } from "~/test/render";
import { ManageExternalProviderDialog } from "./manage-external-provider-dialog.ui";
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
    max_file_bytes: 52_428_800,
  },
  custom_ca_bundle: null,
};

function createReadyVm(): UseManageExternalProviderResult {
  return {
    accessStatus: "allowed",
    accessError: null,
    policyStatus: "ready",
    policyError: null,
    policy,
    policyEtag: '"3"',
    draft: {
      enabled: false,
      limits: { ...policy.limits },
    },
    healthStatus: "ready",
    healthError: null,
    health: null,
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
  };
}

describe("ManageExternalProviderDialog", () => {
  it("accepts a prepared view model without an external account dependency", () => {
    const vm = {
      accessStatus: "allowed",
      accessError: null,
      policyStatus: "loading",
      policyError: null,
      policy: null,
      policyEtag: null,
      draft: null,
      healthStatus: "loading",
      healthError: null,
      health: null,
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
    } satisfies UseManageExternalProviderResult;

    renderWithProviders(<ManageExternalProviderDialog open onOpenChange={vi.fn()} vm={vm} />);

    expect(
      screen.getByRole("dialog", { name: "manageExternalProvider.title" }),
    ).toBeInTheDocument();
    expect(screen.getByText("manageExternalProvider.loadingPolicy")).toBeInTheDocument();
  });

  it("updates the footer save state as policy loading and saving change", () => {
    const readyVm = createReadyVm();
    const loadingVm = {
      ...readyVm,
      policyStatus: "loading",
      policy: null,
      policyEtag: null,
      draft: null,
    } satisfies UseManageExternalProviderResult;
    const { rerender } = renderWithProviders(
      <ManageExternalProviderDialog open onOpenChange={vi.fn()} vm={loadingVm} />,
    );

    expect(screen.getByRole("button", { name: "common.save" })).toBeDisabled();

    rerender(<ManageExternalProviderDialog open onOpenChange={vi.fn()} vm={readyVm} />);
    expect(screen.getByRole("button", { name: "common.save" })).toBeEnabled();

    const savingVm = {
      ...readyVm,
      saveStatus: "saving",
    } satisfies UseManageExternalProviderResult;
    rerender(<ManageExternalProviderDialog open onOpenChange={vi.fn()} vm={savingVm} />);
    expect(screen.getByRole("button", { name: "manageExternalProvider.saving" })).toBeDisabled();
  });

  it("keeps actions in a fixed footer and submits the form from there", () => {
    const vm = createReadyVm();
    const onOpenChange = vi.fn();
    const { rerender } = renderWithProviders(
      <ManageExternalProviderDialog open onOpenChange={onOpenChange} vm={vm} />,
    );

    const dialog = screen.getByRole("dialog", { name: "manageExternalProvider.title" });
    const body = dialog.querySelector<HTMLElement>("[data-app-dialog-body]");
    const footer = dialog.querySelector<HTMLElement>("[data-app-dialog-footer]");
    const form = dialog.querySelector<HTMLFormElement>(
      "form[id^='manage-external-provider-form-']",
    );
    const save = screen.getByRole("button", { name: "common.save" });
    const close = screen.getByRole("button", { name: "common.close" });

    expect(dialog).toHaveClass("flex", "max-h-[92vh]", "overflow-hidden");
    expect(body).toHaveClass("min-h-0", "overflow-y-auto");
    expect(footer).toHaveClass("shrink-0", "bg-bg-elevated");
    expect(footer).toContainElement(save);
    expect(within(footer as HTMLElement).getAllByRole("button")).toEqual([save]);
    expect(close.closest("[data-app-dialog-title-row]")).not.toBeNull();
    expect(body).not.toContainElement(save);
    expect(form).not.toBeNull();
    expect(form?.querySelector(".sticky")).toBeNull();
    expect(save).toHaveAttribute("type", "submit");
    expect(save).toHaveAttribute("form", form?.id);
    expect(save).toBeEnabled();

    const initialFormId = form?.id;
    rerender(<ManageExternalProviderDialog open onOpenChange={onOpenChange} vm={vm} />);
    expect(
      screen.getByRole("dialog", { name: "manageExternalProvider.title" }).querySelector("form")
        ?.id,
    ).toBe(initialFormId);

    fireEvent.click(save);
    expect(vm.save).toHaveBeenCalledOnce();

    fireEvent.click(close);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
