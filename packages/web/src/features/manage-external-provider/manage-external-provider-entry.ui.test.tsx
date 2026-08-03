import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { renderWithProviders } from "~/test/render";
import { ManageExternalProviderEntry } from "./manage-external-provider-entry.ui";
import type { UseManageExternalProviderResult } from "./manage-external-provider.hook";

const useManageExternalProviderMock = vi.hoisted(() => vi.fn());

vi.mock("./manage-external-provider.hook", () => ({
  useManageExternalProvider: (options: unknown) => useManageExternalProviderMock(options),
}));

vi.mock("./manage-external-provider-dialog.ui", () => ({
  ManageExternalProviderDialog: ({
    open,
    onOpenChange,
    vm,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    vm: UseManageExternalProviderResult;
  }) =>
    open ? (
      <div role="dialog" data-access-status={vm.accessStatus}>
        <button type="button" onClick={() => onOpenChange(false)}>
          close admin dialog
        </button>
      </div>
    ) : null,
}));

const runtimeContext: WorkspaceRuntimeContext = {
  accountId: "account-a",
  instanceId: "instance-a",
  organizationId: "organization-a",
  organizationOrigin: "https://workspace.example.com",
  projectId: "project-a",
  userUuid: "user-a",
  accessToken: "access-token",
  runtimeGeneration: 1,
};

function createVm(
  accessStatus: UseManageExternalProviderResult["accessStatus"],
): UseManageExternalProviderResult {
  return {
    accessStatus,
    accessError: accessStatus === "error" || accessStatus === "denied" ? "access" : null,
    policyStatus: "idle",
    policyError: null,
    policy: null,
    policyEtag: null,
    draft: null,
    healthStatus: "idle",
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

describe("ManageExternalProviderEntry", () => {
  beforeEach(() => {
    useManageExternalProviderMock.mockReset();
  });

  it.each(["denied", "error", "checking"] as const)(
    "does not expose the administrative action while access is %s",
    (accessStatus) => {
      useManageExternalProviderMock.mockReturnValue(createVm(accessStatus));

      renderWithProviders(<ManageExternalProviderEntry runtimeContext={runtimeContext} />);

      expect(screen.queryByTestId("manage-external-provider-trigger")).not.toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    },
  );

  it("probes with only the runtime context and opens and closes the prepared dialog", () => {
    const vm = createVm("allowed");
    useManageExternalProviderMock.mockReturnValue(vm);

    renderWithProviders(<ManageExternalProviderEntry runtimeContext={runtimeContext} />);

    expect(useManageExternalProviderMock).toHaveBeenCalledWith({
      probeEnabled: true,
      open: false,
      runtimeContext,
    });

    const trigger = screen.getByTestId("manage-external-provider-trigger");
    // Modal opener: leading icon only — no trailing chevron (navigate/expand affordance).
    expect(trigger.querySelectorAll("svg")).toHaveLength(1);

    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toHaveAttribute("data-access-status", "allowed");
    expect(useManageExternalProviderMock).toHaveBeenLastCalledWith({
      probeEnabled: true,
      open: true,
      runtimeContext,
    });

    fireEvent.click(screen.getByRole("button", { name: "close admin dialog" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes an open dialog when access is revoked", () => {
    const allowedVm = createVm("allowed");
    useManageExternalProviderMock.mockReturnValue(allowedVm);
    const { rerender } = renderWithProviders(
      <ManageExternalProviderEntry runtimeContext={runtimeContext} />,
    );

    fireEvent.click(screen.getByTestId("manage-external-provider-trigger"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    useManageExternalProviderMock.mockReturnValue(createVm("denied"));
    rerender(<ManageExternalProviderEntry runtimeContext={runtimeContext} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByTestId("manage-external-provider-trigger")).not.toBeInTheDocument();
  });
});
